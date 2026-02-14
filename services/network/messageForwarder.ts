
import { MeshPacket } from '../../types';
import { generateId } from '../crypto';

class MessageForwarder {
  private messageHistory: Set<string> = new Set();
  private MAX_HISTORY = 1000;

  isDuplicate(packetId: string): boolean {
    if (this.messageHistory.has(packetId)) return true;
    
    this.messageHistory.add(packetId);
    if (this.messageHistory.size > this.MAX_HISTORY) {
      const it = this.messageHistory.values();
      this.messageHistory.delete(it.next().value);
    }
    return false;
  }

  createPacket(
    type: MeshPacket['type'],
    payload: string,
    senderId: string,
    roomId: string,
    destinationId?: string
  ): MeshPacket {
    return {
      id: generateId(),
      roomId,
      type,
      payload,
      senderId,
      destinationId,
      ttl: 10, // Default TTL
      seenBy: [senderId]
    };
  }

  shouldProcess(packet: MeshPacket, myId: string): boolean {
    if (this.isDuplicate(packet.id)) return false;
    
    // If it's unicast, and I am NOT the destination, and I'm not in the path (handled by duplicate),
    // and TTL is expired... handle in routing logic.
    // This method strictly checks if *this node* has already processed this specific packet ID.
    return true;
  }
}

export const messageForwarder = new MessageForwarder();
