
import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ShieldCheck, WifiOff, Users, Battery, Settings, Menu } from 'lucide-react';
import { mesh } from './services/mesh';
import { generateRoomKey, encryptData, decryptData } from './services/crypto';
import { saveMessage, getMessages, pruneMessages, saveUserProfile, getUserProfile } from './services/db';
import { resourceSync } from './services/network/resourceSync';
import { syncEngine } from './services/syncEngine';
import { roomManager } from './services/roomManager';
import { RoomConfig, Message, MeshPacket } from './types';
import Landing from './components/Landing';
import Room from './components/Room';

function AppLayout() {
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [username, setUsername] = useState<string>('');
  const navigate = useNavigate();

  // Load offline messages and profile on mount
  useEffect(() => {
    getMessages().then(setMessages);
    getUserProfile().then(profile => {
        if(profile && profile.username) {
            setUsername(profile.username);
            mesh.setUsername(profile.username);
        }
    });

    // Cleanup on close
    const cleanup = () => {
        if (roomConfig) {
            roomManager.leaveRoom();
        }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [roomConfig]);

  const handleUpdateUsername = (name: string) => {
      setUsername(name);
      saveUserProfile(name);
      mesh.setUsername(name);
  };

  // Global Mesh Listener
  useEffect(() => {
    const handlePacket = async (packet: MeshPacket) => {
      // Logic for incoming packets
      if (packet.type === 'MSG' && roomConfig?.secretKey) {
        // Double check room ID
        if (packet.roomId !== roomConfig.id) return;

        // Decrypt
        try {
          const payload = JSON.parse(packet.payload); // { iv, cipherText }
          const plainText = await decryptData(roomConfig.secretKey, payload.cipherText, payload.iv);
          
          // Check if this is a Resource Action (Structured JSON)
          try {
             const jsonPayload = JSON.parse(plainText);
             if (jsonPayload && jsonPayload.type === 'RESOURCE_ACTION') {
                 // Route to ResourceSync Service
                 await resourceSync.handleRemoteUpdate(jsonPayload, packet.roomId);
                 return; // Stop processing as chat
             }
          } catch (e) {
             // Not JSON, continue as Chat
          }

          const newMsg: Message = {
            id: packet.id,
            roomId: packet.roomId,
            type: 'CHAT',
            senderId: packet.senderId,
            senderName: mesh.getPeerName(packet.senderId), 
            content: plainText,
            timestamp: Date.now(),
            encryptedPayload: packet.payload, // Store for cloud sync
            synced: false
          };
          
          setMessages(prev => [...prev, newMsg]);
          saveMessage(newMsg);
        } catch (e) {
          console.error("Failed to decrypt incoming message", e);
        }
      } else if (packet.type === 'SOS') {
        alert("SOS RECEIVED from " + packet.senderId);
      }
    };

    mesh.on('packet', handlePacket);
    return () => {
        // cleanup listener? In a real app we'd implement off() properly
    };
  }, [roomConfig]);

  // Sync Engine Integration
  useEffect(() => {
    if (roomConfig) {
      syncEngine.init(roomConfig);
      
      const unsub = syncEngine.subscribeNewMessages((msg) => {
        setMessages(prev => {
           if (prev.find(m => m.id === msg.id)) return prev;
           return [...prev, msg].sort((a,b) => a.timestamp - b.timestamp);
        });
      });
      return () => { unsub(); };
    }
  }, [roomConfig]);

  // Auto-delete timer
  useEffect(() => {
    if (!roomConfig?.retentionPolicy || !roomConfig.id) return;

    const runPrune = async () => {
         // console.log("Running auto-delete prune...");
         await pruneMessages(roomConfig.id, roomConfig.retentionPolicy!);
         // Update state to remove deleted messages
         const cutoff = Date.now() - roomConfig.retentionPolicy!;
         setMessages(prev => prev.filter(m => {
             // Keep message if it belongs to another room OR if it is new enough
             if (m.roomId !== roomConfig.id) return true;
             return m.timestamp >= cutoff;
         }));
    };

    // Run immediately on config change/load
    runPrune();

    // Then every 60 seconds
    const interval = setInterval(runPrune, 60000); 

    return () => clearInterval(interval);
  }, [roomConfig?.retentionPolicy, roomConfig?.id]);

  const handleCreateRoom = async (id: string, pass: string) => {
    // Generate key using the pass and the ID as salt for extra security
    const key = await generateRoomKey(pass, id);
    // Default retention 0 (Never)
    const config: RoomConfig = { id, name: `Room ${id}`, secretKey: key, retentionPolicy: 0 };
    
    setRoomConfig(config);
    mesh.setRoomConfig(config);
    navigate('/room');
  };

  const handleUpdateConfig = (newConfig: Partial<RoomConfig>) => {
      setRoomConfig(prev => prev ? { ...prev, ...newConfig } : null);
  };

  const handleLeaveRoom = () => {
      roomManager.leaveRoom();
      setRoomConfig(null);
      navigate('/');
  };

  return (
    <>
      <div className="min-h-screen bg-dark-950 text-gray-100 font-sans">
        <Routes>
          <Route path="/" element={<Landing onCreateRoom={handleCreateRoom} username={username} onSetUsername={handleUpdateUsername} />} />
          <Route path="/room" element={
            roomConfig ? 
            <Room 
                messages={messages.filter(m => m.roomId === roomConfig.id)} 
                roomConfig={roomConfig} 
                onUpdateConfig={handleUpdateConfig}
                username={username}
                onUpdateUsername={handleUpdateUsername}
                onLeaveRoom={handleLeaveRoom}
                onSendMessage={async (txt) => {
                    if(!roomConfig.secretKey) return;
                    const { iv, cipherText } = await encryptData(roomConfig.secretKey, txt);
                    const msgId = crypto.randomUUID();
                    const encryptedPayload = JSON.stringify({ iv, cipherText });
                    
                    const packet: MeshPacket = {
                        id: msgId,
                        roomId: roomConfig.id,
                        type: 'MSG',
                        payload: encryptedPayload,
                        senderId: mesh.myId,
                        ttl: 5,
                        seenBy: [mesh.myId]
                    };
                    
                    // Optimistic UI
                    const localMsg: Message = {
                        id: msgId,
                        roomId: roomConfig.id,
                        type: 'CHAT',
                        senderId: mesh.myId,
                        senderName: username || 'Me',
                        content: txt,
                        timestamp: Date.now(),
                        encryptedPayload: encryptedPayload,
                        synced: false
                    };
                    setMessages(p => [...p, localMsg]);
                    saveMessage(localMsg);

                    mesh.broadcast(packet);
                }}
            /> 
            : <Landing onCreateRoom={handleCreateRoom} username={username} onSetUsername={handleUpdateUsername} />
          } />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}
