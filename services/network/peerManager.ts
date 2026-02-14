
import { User } from '../../types';
import { metricsTracker } from './metricsTracker';

class PeerManager {
  private users: Map<string, User> = new Map();
  private myId: string = '';

  initialize(myId: string, myUsername: string) {
    this.myId = myId;
    this.updateUser(myId, {
      id: myId,
      username: myUsername,
      isSelf: true,
      role: 'CLIENT',
      status: 'SAFE',
      lastSeen: Date.now(),
      batteryLevel: metricsTracker.getMyBatteryLevel()
    });
  }

  updateUser(id: string, data: Partial<User>) {
    const current = this.users.get(id) || {
      id,
      username: 'Unknown',
      isSelf: id === this.myId,
      role: 'CLIENT',
      status: 'SAFE',
      lastSeen: Date.now()
    };

    const updated = { ...current, ...data, lastSeen: Date.now() };
    this.users.set(id, updated);
    return updated;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getAllUsers(): Map<string, User> {
    return this.users;
  }

  getPeerSummary(peerId: string) {
    const user = this.getUser(peerId);
    const metrics = metricsTracker.getMetrics(peerId);
    return {
      user,
      metrics
    };
  }

  // Remove peers that haven't been seen in a while (e.g. 60s)
  pruneStalePeers() {
    const now = Date.now();
    this.users.forEach((user, id) => {
      if (!user.isSelf && now - user.lastSeen > 60000) {
        // We generally keep users in UI but maybe mark as offline?
        // For mesh routing, they will be removed if connections drop.
        // This method is mostly for cleanup if needed.
      }
    });
  }

  resetPeers() {
    // Clear all peers except self
    const self = this.users.get(this.myId);
    this.users.clear();
    if (self) {
        this.users.set(this.myId, self);
    }
  }
}

export const peerManager = new PeerManager();
