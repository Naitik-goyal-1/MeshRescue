
export type PeerRole = 'HOST' | 'RELAY' | 'CLIENT';

export interface PeerMetrics {
  latency: number; // ms
  packetLoss: number; // % (0-100)
  batteryLevel: number; // % (0-100)
  signalStrength: number; // 0-100 (derived from latency/loss)
  lastHeartbeat: number;
}

export interface User {
  id: string;
  username: string;
  isSelf: boolean;
  role: PeerRole;
  status: 'SAFE' | 'DANGER' | 'UNKNOWN';
  lastSeen: number;
  batteryLevel?: number;
}

export interface Message {
  id: string;
  roomId: string; // ID of the room this message belongs to
  type: 'CHAT' | 'SOS' | 'SYSTEM' | 'FILE';
  senderId: string;
  senderName: string;
  content: string; // Plaintext after decryption
  timestamp: number;
  fileMetadata?: {
    name: string;
    size: number;
    mimeType: string;
    data?: string; // Base64
  };
  // Hybrid Cloud Sync Fields
  encryptedPayload?: string; // Stored to allow syncing without re-encryption. JSON {iv, cipherText}
  synced?: boolean; // True if uploaded to cloud
}

export interface MeshPacket {
  id: string;
  roomId: string; // Used for filtering packets not meant for this room
  type: 'MSG' | 'PING' | 'PONG' | 'STATUS_UPDATE' | 'SOS' | 'SIGNAL' | 'ROUTING_UPDATE';
  payload: string; // Encrypted JSON or Signal Data
  senderId: string;
  destinationId?: string; // If present, unicast to this specific node
  ttl: number; // Time to live for flooding
  seenBy: string[]; // Deduplication
}

export interface RoomConfig {
  id: string; // Human readable ID (e.g. AX7K-92QP)
  name?: string; // Optional alias
  secretKey: CryptoKey | null; // The symmetric key for content encryption
  retentionPolicy?: number; // ms, if defined, messages older than this are deleted
}

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export interface RouteEntry {
  destinationId: string;
  nextHopId: string; // The peer ID to forward to
  cost: number; // Calculated metric score
  hops: number;
}
