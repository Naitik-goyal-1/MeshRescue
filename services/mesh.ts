
import { generateId } from './crypto';
import { Message, MeshPacket, User, RoomConfig, RouteEntry } from '../types';
import { RTC_CONFIG } from '../constants';
import { BluetoothService } from './bluetooth';
import { metricsTracker } from './network/metricsTracker';
import { peerManager } from './network/peerManager';
import { routingEngine } from './network/routingEngine';
import { messageForwarder } from './network/messageForwarder';

type SignalData = {
  type: 'OFFER' | 'ANSWER' | 'CANDIDATE';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  senderId: string;
};

// Event Emitter for mesh updates
type Listener = (data: any) => void;

class MeshService {
  public myId: string = generateId();
  public myUsername: string = 'Anonymous';
  
  // NOTE: We keep peers/channels here for low-level access, but logic is moving to modules
  public peers: Map<string, RTCPeerConnection> = new Map();
  public channels: Map<string, RTCDataChannel> = new Map();
  
  // Media State
  public localStream: MediaStream | null = null;
  public remoteStreams: Map<string, MediaStream> = new Map();

  // Bluetooth State
  public bluetooth: BluetoothService = new BluetoothService();

  private listeners: Map<string, Set<Listener>> = new Map();
  private roomConfig: RoomConfig | null = null;

  constructor() {
    console.log("MeshService initialized with ID:", this.myId);
    
    // Initialize Modules
    peerManager.initialize(this.myId, this.myUsername);
    routingEngine.init(this.myId);

    // Setup Bluetooth Listener
    this.bluetooth.onMessage((data) => {
      // console.log("Received packet via BLE");
      this.handlePacket(data, true); 
    });

    // Start Routing Heartbeat
    setInterval(() => this.runRoutingCycle(), 5000);
  }

  setRoomConfig(config: RoomConfig) {
    this.roomConfig = config;
  }

  setUsername(name: string) {
    this.myUsername = name;
    peerManager.updateUser(this.myId, { username: name });
    this.broadcastStatus();
  }

  getPeerName(peerId: string): string {
    return peerManager.getUser(peerId)?.username || peerId.slice(0, 8);
  }

  async connectBluetooth() {
    const success = await this.bluetooth.connect();
    if (success) {
      this.broadcastStatus();
    }
    return success;
  }

  // --- Connection Cleanup ---
  
  leaveRoom() {
    console.log("Leaving room, cleaning up mesh...");
    
    // Close all WebRTC Peer Connections
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    
    // Clear Channels
    this.channels.clear();
    
    // Clear Remote Streams
    this.remoteStreams.clear();
    
    // Stop Media
    this.stopVoice();

    // Reset Room Config
    this.roomConfig = null;
    
    // Notify UI to clear stats
    this.emit('stats-update', {});
    this.emit('connection-change', { state: 'disconnected' });
  }

  // --- Core Network Loop ---

  private runRoutingCycle() {
      // 1. Send Pings to measure latency
      this.pingAllPeers();

      // 2. Broadcast Routing Table (Distance Vector Update)
      // Only do this if we have connections
      if (this.channels.size > 0 || this.bluetooth.isConnected) {
          const table = routingEngine.getExportableTable();
          const packet = messageForwarder.createPacket(
              'ROUTING_UPDATE',
              JSON.stringify(table),
              this.myId,
              'GLOBAL'
          );
          // Broadcast to immediate neighbors only (TTL 0 for routing updates usually, but 1 allows slight prop if needed. 
          // DV works hop by hop, so we send to direct neighbors)
          this.broadcast(packet, [], true); // true = direct neighbors only
      }
      
      // 3. Emit stats for UI
      this.emit('stats-update', {});
  }

  broadcastStatus() {
    const payload = JSON.stringify({
        id: this.myId,
        username: this.myUsername,
        status: 'SAFE',
        battery: metricsTracker.getMyBatteryLevel()
    });

    const packet = messageForwarder.createPacket(
        'STATUS_UPDATE',
        payload,
        this.myId,
        'GLOBAL'
    );
    packet.ttl = 2; 

    this.broadcast(packet);
  }

  // --- Event System ---
  on(event: string, cb: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(cb);
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  // --- WebRTC Handling ---

  createPeer(peerId: string, initiator: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.ontrack = (event) => {
      console.log("Received remote track from", peerId);
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(peerId, stream);
      this.emit('remote-stream-added', { peerId, stream });
      
      stream.onremovetrack = () => {
         if (stream.getTracks().length === 0) {
             this.remoteStreams.delete(peerId);
             this.emit('remote-stream-removed', peerId);
         }
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.channels.has(peerId) && this.channels.get(peerId)?.readyState === 'open') {
             const packet = messageForwarder.createPacket(
                 'SIGNAL',
                 JSON.stringify({ type: 'CANDIDATE', candidate: event.candidate, senderId: this.myId }),
                 this.myId,
                 'GLOBAL'
             );
             packet.ttl = 0;
             this.sendDirect(peerId, packet);
        } else {
             this.emit('signal-generated', { 
                type: 'CANDIDATE', 
                candidate: event.candidate, 
                senderId: this.myId 
             });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      this.emit('connection-change', { peerId, state: pc.connectionState });
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.handlePeerDisconnect(peerId);
      }
    };

    if (this.localStream) {
        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
    }

    if (initiator) {
      const channel = pc.createDataChannel("mesh-rescue");
      this.setupChannel(channel, peerId);
    } else {
      pc.ondatachannel = (event) => {
        this.setupChannel(event.channel, peerId);
      };
    }

    this.peers.set(peerId, pc);
    return pc;
  }

  handlePeerDisconnect(peerId: string) {
    this.peers.delete(peerId);
    this.channels.delete(peerId);
    this.remoteStreams.delete(peerId);
    
    // Notify Engine
    routingEngine.removeDirectPeer(peerId);
    
    this.emit('remote-stream-removed', peerId);
    this.emit('stats-update', {});
  }

  setupChannel(channel: RTCDataChannel, peerId: string) {
    channel.onopen = () => {
      console.log(`Channel opened with ${peerId}`);
      this.channels.set(peerId, channel);
      
      // Notify Engine
      routingEngine.addDirectPeer(peerId);
      
      this.emit('peer-connected', peerId);
      this.broadcastStatus();
      
      if (this.localStream) {
          this.negotiateConnection(peerId);
      }
    };
    
    channel.onmessage = (event) => {
      this.handlePacket(event.data);
    };
  }

  async negotiateConnection(peerId: string) {
      const pc = this.peers.get(peerId);
      if (!pc) return;

      try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          const packet = messageForwarder.createPacket(
              'SIGNAL',
              JSON.stringify({ type: 'OFFER', sdp: offer, senderId: this.myId }),
              this.myId,
              'GLOBAL'
          );
          packet.ttl = 0;
          this.sendDirect(peerId, packet);
      } catch (e) {
          console.error("Negotiation failed", e);
      }
  }

  pingAllPeers() {
    this.channels.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        const payload = JSON.stringify({ ts: Date.now() });
        const packet = messageForwarder.createPacket('PING', payload, this.myId, 'GLOBAL');
        packet.ttl = 0;
        this.sendDirect(peerId, packet);
      }
    });
  }

  // --- Packet Handling ---

  handlePacket(json: string, fromBLE: boolean = false) {
    try {
      const packet: MeshPacket = JSON.parse(json);

      // 1. Signal Handling (P2P only)
      if (packet.type === 'SIGNAL') {
          this.handleInBandSignal(packet.senderId, packet.payload);
          return; 
      }

      // 2. Ping/Pong (Metrics)
      if (packet.type === 'PING') {
        const pong = messageForwarder.createPacket('PONG', packet.payload, this.myId, 'GLOBAL');
        pong.ttl = 0;
        this.sendDirect(packet.senderId, pong);
        return;
      }

      if (packet.type === 'PONG') {
        try {
            const { ts } = JSON.parse(packet.payload);
            const rtt = Date.now() - ts;
            metricsTracker.updateLatency(packet.senderId, rtt);
        } catch (e) {}
        return;
      }

      // 3. Routing Updates
      if (packet.type === 'ROUTING_UPDATE') {
          const routes = JSON.parse(packet.payload) as RouteEntry[];
          routingEngine.handleRoutingUpdate(packet.senderId, routes);
          return;
      }

      // 4. Status Updates
      if (packet.type === 'STATUS_UPDATE') {
          try {
             const data = JSON.parse(packet.payload);
             peerManager.updateUser(packet.senderId, { 
                 username: data.username, 
                 batteryLevel: data.battery 
             });
             if(data.battery) metricsTracker.updatePeerBattery(packet.senderId, data.battery);
          } catch(e) {}
      }

      // 5. General Packet Routing
      // Duplicate Check
      if (!messageForwarder.shouldProcess(packet, this.myId)) return;
      
      // Destination Check
      const isForMe = !packet.destinationId || packet.destinationId === this.myId;
      const isForMyRoom = this.roomConfig && (packet.roomId === this.roomConfig.id || packet.roomId === 'GLOBAL');
      
      if (isForMe && isForMyRoom) {
          this.emit('packet', packet);
      }

      // Forwarding Logic
      // If ttl > 0 and (it was broadcast OR (unicast but I am not the destination))
      if (packet.ttl > 0 && (!isForMe || !packet.destinationId)) {
        packet.ttl--;
        packet.seenBy.push(this.myId);
        
        if (packet.destinationId) {
            // Unicast Routing
            const nextHop = routingEngine.getNextHop(packet.destinationId);
            if (nextHop) {
                // Smart Forward
                this.sendDirect(nextHop, packet);
            } else {
                // Fallback to flood if route lost
                this.broadcast(packet, packet.seenBy);
            }
        } else {
            // Broadcast Routing (Flood)
            this.broadcast(packet, packet.seenBy); 
        }
      }

    } catch (e) {
      console.error("Error handling packet", e);
    }
  }

  async handleInBandSignal(senderId: string, payload: string) {
      const pc = this.peers.get(senderId);
      if (!pc) return;

      try {
          const signal: SignalData = JSON.parse(payload);
          
          if (signal.type === 'OFFER' && signal.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              
              const packet = messageForwarder.createPacket(
                  'SIGNAL',
                  JSON.stringify({ type: 'ANSWER', sdp: answer, senderId: this.myId }),
                  this.myId,
                  'GLOBAL'
              );
              packet.ttl = 0;
              this.sendDirect(senderId, packet);
          } 
          else if (signal.type === 'ANSWER' && signal.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }
          else if (signal.type === 'CANDIDATE' && signal.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
      } catch (e) {}
  }

  broadcast(packet: MeshPacket, excludeIds: string[] = [], directOnly: boolean = false) {
    const serialized = JSON.stringify(packet);
    
    this.channels.forEach((channel, peerId) => {
      if (!excludeIds.includes(peerId) && channel.readyState === 'open') {
        channel.send(serialized);
      }
    });

    if (!directOnly && this.bluetooth.isConnected) {
      this.bluetooth.send(serialized);
    }
  }

  sendDirect(peerId: string, packet: MeshPacket) {
    const channel = this.channels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(packet));
    } else if (this.bluetooth.isConnected) {
      this.bluetooth.send(JSON.stringify(packet));
    }
  }

  // --- Voice / Manual Signaling ---
  // (Keeping existing implementations wrapper)

  async startVoice() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.localStream.getTracks().forEach(track => {
        this.peers.forEach((pc, peerId) => {
          const senders = pc.getSenders();
          if (!senders.find(s => s.track?.id === track.id)) {
            pc.addTrack(track, this.localStream!);
            this.negotiateConnection(peerId);
          }
        });
      });
      this.emit('local-stream', this.localStream);
      return true;
    } catch (e) {
      return false;
    }
  }

  stopVoice() {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
        this.emit('local-stream', null);
      }
  }

  toggleMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  async generateOffer(): Promise<string> {
    const peerId = generateId(); 
    const pc = this.createPeer(peerId, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    return JSON.stringify({
      type: 'OFFER',
      sdp: pc.localDescription,
      senderId: this.myId
    });
  }

  async handleSignal(signalStr: string): Promise<string | null> {
    try {
      const signal: SignalData = JSON.parse(signalStr);
      if (signal.type === 'OFFER' && signal.sdp) {
        const peerId = signal.senderId;
        const pc = this.createPeer(peerId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return JSON.stringify({ type: 'ANSWER', sdp: pc.localDescription, senderId: this.myId });
      } else if (signal.type === 'ANSWER' && signal.sdp) {
        for (const [pid, pc] of this.peers) {
           if (pc.signalingState === 'have-local-offer') {
               await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
               this.peers.set(signal.senderId, pc);
               return null;
           }
        }
      } else if (signal.type === 'CANDIDATE' && signal.candidate) {
          const pc = this.peers.get(signal.senderId);
          if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
      return null;
    } catch (e) { return null; }
  }

  // Helper for UI
  getPeers() {
      return Array.from(this.channels.keys());
  }
}

export const mesh = new MeshService();
