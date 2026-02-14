
type Listener = (isOnline: boolean) => void;

class OnlineStatusManager {
  private listeners: Set<Listener> = new Set();
  public isOnline: boolean = navigator.onLine;

  constructor() {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  private handleOnline = () => {
    console.log("Network status: ONLINE");
    this.isOnline = true;
    this.notify();
  };

  private handleOffline = () => {
    console.log("Network status: OFFLINE");
    this.isOnline = false;
    this.notify();
  };

  private notify() {
    this.listeners.forEach(cb => cb(this.isOnline));
  }

  subscribe(cb: Listener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  cleanup() {
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
  }
}

export const onlineStatusManager = new OnlineStatusManager();
