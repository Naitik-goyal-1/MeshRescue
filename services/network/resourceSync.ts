
import { mesh } from '../mesh';
import { messageForwarder } from './messageForwarder';
import { encryptData } from '../crypto';
import { saveResource, getResources } from '../db';
import { RoomConfig, MeshPacket } from '../../types';
import { ResourceItem, ResourcePacketPayload } from '../../types/resourceTypes';

type ChangeListener = (items: ResourceItem[]) => void;

class ResourceSync {
  private listeners: Set<ChangeListener> = new Set();
  
  subscribe(listener: ChangeListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(items: ResourceItem[]) {
    this.listeners.forEach(l => l(items));
  }

  async loadFromDB(roomId: string) {
    const items = await getResources(roomId);
    this.notify(items);
    return items;
  }

  async broadcastResourceAction(
    action: 'CREATE' | 'UPDATE',
    item: ResourceItem,
    roomConfig: RoomConfig
  ) {
    if (!roomConfig.secretKey) return;

    // 1. Save locally first
    await saveResource(item);
    
    // 2. Notify UI
    this.loadFromDB(roomConfig.id);

    // 3. Prepare Packet
    const payloadObj: ResourcePacketPayload = {
      type: 'RESOURCE_ACTION',
      action,
      data: item
    };

    const payloadStr = JSON.stringify(payloadObj);
    const { iv, cipherText } = await encryptData(roomConfig.secretKey, payloadStr);

    const packet = messageForwarder.createPacket(
      'MSG', // We reuse MSG type, but payload content differs
      JSON.stringify({ iv, cipherText }),
      mesh.myId,
      roomConfig.id
    );

    // 4. Broadcast
    mesh.broadcast(packet);
  }

  async handleRemoteUpdate(payload: ResourcePacketPayload, roomId: string) {
    if (payload.type !== 'RESOURCE_ACTION') return;

    // Last-write-wins conflict resolution logic could go here
    // For now, we trust the update if valid
    await saveResource(payload.data);
    
    // Trigger UI refresh
    this.loadFromDB(roomId);
  }
}

export const resourceSync = new ResourceSync();
