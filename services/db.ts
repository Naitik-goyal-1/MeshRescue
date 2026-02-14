
import { Message } from '../types';
import { ResourceItem } from '../types/resourceTypes';

const DB_NAME = 'MeshRescueDB';
const DB_VERSION = 2; // Incremented for schema update
const STORE_MESSAGES = 'messages';
const STORE_CONFIG = 'config';
const STORE_RESOURCES = 'resources';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_RESOURCES)) {
        db.createObjectStore(STORE_RESOURCES, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// --- Messages ---
export const saveMessage = async (msg: Message) => {
  const db = await openDB();
  const tx = db.transaction(STORE_MESSAGES, 'readwrite');
  tx.objectStore(STORE_MESSAGES).put(msg);
};

export const getMessages = async (): Promise<Message[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const request = tx.objectStore(STORE_MESSAGES).getAll();
    request.onsuccess = () => resolve(request.result || []);
  });
};

// New method for Sync Engine
export const getUnsyncedMessages = async (roomId: string): Promise<Message[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const request = tx.objectStore(STORE_MESSAGES).getAll();
    request.onsuccess = () => {
      const all = request.result || [] as Message[];
      // Filter for unsynced messages in this room that have an encrypted payload
      const unsynced = all.filter(m => 
        m.roomId === roomId && 
        m.synced !== true && 
        m.encryptedPayload
      );
      resolve(unsynced);
    };
  });
};

export const markMessageAsSynced = async (id: string) => {
  const db = await openDB();
  const tx = db.transaction(STORE_MESSAGES, 'readwrite');
  const store = tx.objectStore(STORE_MESSAGES);
  
  return new Promise<void>((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const msg = getReq.result as Message;
      if (msg) {
        msg.synced = true;
        store.put(msg).onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
};

export const getLatestMessageTimestamp = async (roomId: string): Promise<number> => {
  const messages = await getMessages();
  const roomMessages = messages.filter(m => m.roomId === roomId);
  if (roomMessages.length === 0) return 0;
  return Math.max(...roomMessages.map(m => m.timestamp));
};

export const clearMessages = async () => {
  const db = await openDB();
  const tx = db.transaction(STORE_MESSAGES, 'readwrite');
  tx.objectStore(STORE_MESSAGES).clear();
};

export const pruneMessages = async (roomId: string, maxAgeMs: number) => {
  const db = await openDB();
  const tx = db.transaction(STORE_MESSAGES, 'readwrite');
  const store = tx.objectStore(STORE_MESSAGES);
  const cutoff = Date.now() - maxAgeMs;

  return new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        const msg = cursor.value as Message;
        if (msg.roomId === roomId && msg.timestamp < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
};

// --- Config / Profile ---
export const saveUserProfile = async (username: string) => {
  const db = await openDB();
  const tx = db.transaction(STORE_CONFIG, 'readwrite');
  tx.objectStore(STORE_CONFIG).put({ key: 'user_profile', username });
};

export const getUserProfile = async (): Promise<{ username: string } | null> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const request = tx.objectStore(STORE_CONFIG).get('user_profile');
    request.onsuccess = () => resolve(request.result || null);
  });
};

// --- Resources ---
export const saveResource = async (resource: ResourceItem) => {
  const db = await openDB();
  const tx = db.transaction(STORE_RESOURCES, 'readwrite');
  tx.objectStore(STORE_RESOURCES).put(resource);
};

export const getResources = async (roomId: string): Promise<ResourceItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_RESOURCES, 'readonly');
    const request = tx.objectStore(STORE_RESOURCES).getAll();
    request.onsuccess = () => {
      const all = request.result || [] as ResourceItem[];
      // Filter by room and not deleted
      resolve(all.filter(r => r.roomId === roomId && !r.isDeleted));
    };
  });
};

export const updateResource = async (resource: ResourceItem) => {
  // Logic is same as save (put overwrites)
  return saveResource(resource);
};
