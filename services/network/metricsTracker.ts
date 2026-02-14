
import { PeerMetrics } from '../../types';

class MetricsTracker {
  private metrics: Map<string, PeerMetrics> = new Map();
  private myBattery: number = 100;

  constructor() {
    this.initBatteryListener();
  }

  private async initBatteryListener() {
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        this.myBattery = Math.round(battery.level * 100);
        
        battery.addEventListener('levelchange', () => {
          this.myBattery = Math.round(battery.level * 100);
        });
      }
    } catch (e) {
      console.warn("Battery API not supported");
    }
  }

  getMyBatteryLevel(): number {
    return this.myBattery;
  }

  updateLatency(peerId: string, rtt: number) {
    const current = this.getMetrics(peerId);
    // Exponential moving average for latency smoothness
    const newLatency = Math.round((current.latency * 0.7) + (rtt * 0.3));
    
    // Crude packet loss estimation (if RTT > 1000 or spike, assume some loss/congestion)
    let newLoss = current.packetLoss;
    if (rtt > 1000) newLoss = Math.min(100, newLoss + 5);
    else if (rtt < 200) newLoss = Math.max(0, newLoss - 1);

    // Calculate generic signal strength score (0-100)
    // Lower latency = higher strength
    let strength = 100 - Math.min(100, newLatency / 10);
    if(newLoss > 0) strength -= (newLoss * 2);

    this.metrics.set(peerId, {
      ...current,
      latency: newLatency,
      packetLoss: newLoss,
      signalStrength: Math.max(0, Math.round(strength)),
      lastHeartbeat: Date.now()
    });
  }

  updatePeerBattery(peerId: string, level: number) {
    const current = this.getMetrics(peerId);
    this.metrics.set(peerId, { ...current, batteryLevel: level });
  }

  getMetrics(peerId: string): PeerMetrics {
    if (!this.metrics.has(peerId)) {
      this.metrics.set(peerId, {
        latency: 999, // Default high latency
        packetLoss: 0,
        batteryLevel: 100, // Optimistic default
        signalStrength: 50,
        lastHeartbeat: Date.now()
      });
    }
    return this.metrics.get(peerId)!;
  }

  calculateLinkCost(peerId: string): number {
    const m = this.getMetrics(peerId);
    
    // Weights
    const W_LATENCY = 1;
    const W_LOSS = 10;
    const W_BATTERY = 5;

    // Cost formula (Lower is better)
    // Base cost is latency
    let cost = m.latency * W_LATENCY;
    
    // Penalty for packet loss
    cost += m.packetLoss * W_LOSS;
    
    // Penalty for low battery (inverted: lower battery = higher cost)
    // If battery is 100%, penalty is 0. If battery is 20%, penalty is (100-20)*5 = 400
    cost += (100 - m.batteryLevel) * W_BATTERY;

    return Math.round(cost);
  }
}

export const metricsTracker = new MetricsTracker();
