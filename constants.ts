export const APP_NAME = "MeshRescue";
export const MESH_TTL = 5; // Max hops for a message
export const SOS_FLASH_INTERVAL = 500; // ms
export const HEARTBEAT_INTERVAL = 10000; // ms
export const OFFLINE_STORAGE_KEY = "mesh-rescue-storage-v1";

// WebRTC Configuration - Google STUN servers are used as a fallback if internet exists, 
// but the app works purely on local network/p2p if candidates are exchanged manually.
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ]
};