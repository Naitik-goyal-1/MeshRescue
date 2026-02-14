
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { getUnsyncedMessages, markMessageAsSynced, saveMessage, getLatestMessageTimestamp } from './db';
import { Message, RoomConfig } from '../types';
import { decryptData } from './crypto';
import { onlineStatusManager } from './onlineStatusManager';
import { mesh } from './mesh';

type SyncStatus = 'OFFLINE' | 'SYNCING' | 'ACTIVE' | 'ERROR';
type SyncCallback = (status: SyncStatus) => void;
type NewMessageCallback = (msg: Message) => void;

class SyncEngine {
  private status: SyncStatus = 'OFFLINE';
  private statusListeners: Set<SyncCallback> = new Set();
  private messageListeners: Set<NewMessageCallback> = new Set();
  private syncInterval: any = null;
  private roomConfig: RoomConfig | null = null;
  private isSyncing: boolean = false;

  constructor() {
    onlineStatusManager.subscribe((isOnline) => {
      if (isOnline) {
        this.startSync();
      } else {
        this.stopSync();
        this.setStatus('OFFLINE');
      }
    });
  }

  public init(config: RoomConfig) {
    this.roomConfig = config;
    if (onlineStatusManager.isOnline) {
      this.startSync();
    } else {
      this.setStatus('OFFLINE');
    }
  }

  public stop() {
    this.stopSync();
    this.setStatus('OFFLINE');
    this.roomConfig = null;
    // We do not strictly need to clear listeners here as components unsubscribe,
    // but it is good practice if we want a hard reset.
  }

  public subscribeStatus(cb: SyncCallback) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  public subscribeNewMessages(cb: NewMessageCallback) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  private setStatus(s: SyncStatus) {
    this.status = s;
    this.statusListeners.forEach(cb => cb(s));
  }

  private startSync() {
    if (!isSupabaseConfigured() || !this.roomConfig) {
        // If not configured, we just stay "Offline" regarding Cloud Sync
        return; 
    }
    
    if (this.syncInterval) clearInterval(this.syncInterval);
    
    // Initial Sync
    this.runSyncCycle();

    // Poll every 10 seconds
    this.syncInterval = setInterval(() => {
      this.runSyncCycle();
    }, 10000);
  }

  private stopSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = null;
  }

  private async runSyncCycle() {
    if (this.isSyncing || !this.roomConfig || !supabase) return;

    this.isSyncing = true;
    this.setStatus('SYNCING');

    try {
      await this.pushChanges(this.roomConfig.id);
      await this.pullChanges(this.roomConfig);
      this.setStatus('ACTIVE');
    } catch (e) {
      console.error("Sync Cycle Failed", e);
      this.setStatus('ERROR');
    } finally {
      this.isSyncing = false;
    }
  }

  // Step 1: Push Unsynced Local Messages
  private async pushChanges(roomId: string) {
    if(!supabase) return;

    const unsynced = await getUnsyncedMessages(roomId);
    if (unsynced.length === 0) return;

    // Map to Supabase Schema
    const payload = unsynced.map(msg => ({
      id: msg.id,
      room_id: msg.roomId,
      sender_id: msg.senderId,
      encrypted_payload: msg.encryptedPayload,
      timestamp: msg.timestamp,
      synced: true // Flag for cloud DB (optional, depending on cloud schema)
    }));

    // Upsert to cloud
    const { error } = await supabase.from('messages').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Failed to push messages", error);
      throw error;
    }

    // Mark as synced locally
    for (const msg of unsynced) {
      await markMessageAsSynced(msg.id);
    }
  }

  // Step 2: Pull New Cloud Messages
  private async pullChanges(config: RoomConfig) {
    if(!supabase || !config.secretKey) return;

    const lastTimestamp = await getLatestMessageTimestamp(config.id);
    
    // Fetch newer messages
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', config.id)
      .gt('timestamp', lastTimestamp)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error("Failed to pull messages", error);
      throw error;
    }

    if (!data || data.length === 0) return;

    let newCount = 0;

    for (const row of data) {
      try {
        // Decrypt
        // Supabase stores raw encrypted payload. 
        // We assume it matches { iv, cipherText } JSON structure
        const payloadJson = row.encrypted_payload;
        if (!payloadJson) continue;

        const { iv, cipherText } = JSON.parse(payloadJson);
        const plainText = await decryptData(config.secretKey, cipherText, iv);
        
        const senderName = mesh.getPeerName(row.sender_id) || row.sender_id.slice(0,8);

        const newMsg: Message = {
          id: row.id,
          roomId: row.room_id,
          type: 'CHAT', // Basic assumption for now
          senderId: row.sender_id,
          senderName: senderName,
          content: plainText,
          timestamp: Number(row.timestamp),
          encryptedPayload: payloadJson,
          synced: true
        };

        // Save locally
        await saveMessage(newMsg);
        
        // Notify UI
        this.messageListeners.forEach(cb => cb(newMsg));
        newCount++;
      } catch (e) {
        console.warn("Failed to process incoming cloud message", e);
      }
    }

    if (newCount > 0) {
      console.log(`Synced ${newCount} messages from cloud.`);
    }
  }
}

export const syncEngine = new SyncEngine();
