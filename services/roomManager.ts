
import { mesh } from './mesh';
import { syncEngine } from './syncEngine';
import { peerManager } from './network/peerManager';
import { routingEngine } from './network/routingEngine';

export const roomManager = {
    /**
     * Cleans up all networking and sync states when leaving a room.
     * Ensures no dangling WebRTC connections or sync intervals remain.
     */
    leaveRoom: () => {
        console.log("[RoomManager] Initiating Room Leave Procedure...");

        // 1. Close Mesh Connections
        // Disconnects all peers, closes channels, stops media.
        mesh.leaveRoom();
        
        // 2. Reset Network State Modules
        // Clears known peers (except self) and routing tables.
        peerManager.resetPeers();
        routingEngine.reset();

        // 3. Stop Cloud Sync
        // Stops polling intervals and listeners.
        syncEngine.stop();

        console.log("[RoomManager] Room exited cleanly.");
    }
};
