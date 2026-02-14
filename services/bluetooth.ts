// Custom UUIDs for MeshRescue (Nordic UART Service compatible)
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
const RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify

export class BluetoothService {
  private device: any | null = null; // Using any for BluetoothDevice as types might not be globally available
  private server: any | null = null;
  private txCharacteristic: any | null = null;
  private rxCharacteristic: any | null = null;
  private onMessageCallback: ((data: string) => void) | null = null;
  private receiveBuffer: string = '';
  public isConnected: boolean = false;

  constructor() {
    console.log("BluetoothService initialized");
  }

  onMessage(cb: (data: string) => void) {
    this.onMessageCallback = cb;
  }

  async connect(): Promise<boolean> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      console.error("Web Bluetooth API not available");
      return false;
    }

    try {
      console.log("Requesting Bluetooth Device...");
      this.device = await nav.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
      });

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

      console.log("Connecting to GATT Server...");
      this.server = await this.device.gatt.connect();

      console.log("Getting Service...");
      const service = await this.server.getPrimaryService(SERVICE_UUID);

      console.log("Getting Characteristics...");
      this.txCharacteristic = await service.getCharacteristic(TX_CHARACTERISTIC_UUID);
      this.rxCharacteristic = await service.getCharacteristic(RX_CHARACTERISTIC_UUID);

      await this.rxCharacteristic.startNotifications();
      this.rxCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotifications.bind(this));
      
      this.isConnected = true;
      console.log("Bluetooth Connected!");
      return true;
    } catch (error: any) {
      // Robust check for user cancellation across different browsers
      if (
          error.name === 'NotFoundError' || 
          error.name === 'SecurityError' || 
          error.message?.includes('cancelled') ||
          error.message?.includes('User cancelled')
      ) {
         console.log("Bluetooth selection cancelled by user or permission denied.");
         return false;
      }
      console.error('BLE Connection failed', error);
      this.handleDisconnect();
      return false;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
  }

  handleDisconnect() {
    console.log("Bluetooth Disconnected");
    this.isConnected = false;
    this.device = null;
    this.server = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
  }

  handleNotifications(event: any) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const chunk = decoder.decode(value);
    
    this.receiveBuffer += chunk;

    // Check for delimiter (newline) to process complete messages
    // Mesh packets are JSON, so we expect a full JSON string followed by \n
    let delimiterIndex = this.receiveBuffer.indexOf('\n');
    while (delimiterIndex !== -1) {
      const message = this.receiveBuffer.substring(0, delimiterIndex);
      this.receiveBuffer = this.receiveBuffer.substring(delimiterIndex + 1);
      
      if (message.trim() && this.onMessageCallback) {
        this.onMessageCallback(message);
      }
      
      delimiterIndex = this.receiveBuffer.indexOf('\n');
    }
  }

  async send(data: string): Promise<void> {
    if (!this.isConnected || !this.txCharacteristic) {
      return;
    }

    // Append delimiter
    const payload = data + '\n';
    const encoder = new TextEncoder();
    const encoded = encoder.encode(payload);

    // Chunking (MTU is often small, 20 bytes is safe default, but many support more. 
    // We'll try 100 bytes chunks to be more efficient than 20, but safe enough for modern BLE)
    const CHUNK_SIZE = 100; 

    for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
      const chunk = encoded.slice(i, i + CHUNK_SIZE);
      try {
        await this.txCharacteristic.writeValue(chunk);
      } catch (e) {
        console.error("BLE Write failed", e);
        // Try smaller chunk if failed?
        break;
      }
    }
  }
}