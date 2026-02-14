
import { RouteEntry } from '../../types';
import { metricsTracker } from './metricsTracker';

class RoutingEngine {
  private routingTable: Map<string, RouteEntry> = new Map(); // Destination ID -> Route Info
  private directPeers: Set<string> = new Set();
  private myId: string = '';

  init(myId: string) {
    this.myId = myId;
  }

  addDirectPeer(peerId: string) {
    this.directPeers.add(peerId);
    this.recalculateRoutes();
  }

  removeDirectPeer(peerId: string) {
    this.directPeers.delete(peerId);
    // Remove routes where this peer is the next hop
    for (const [dest, route] of this.routingTable) {
      if (route.nextHopId === peerId) {
        this.routingTable.delete(dest);
      }
    }
    this.recalculateRoutes();
  }

  // Handle incoming routing table broadcast from a neighbor
  handleRoutingUpdate(senderId: string, neighborTable: RouteEntry[]) {
    // Cost to reach the neighbor who sent this update
    const linkCost = metricsTracker.calculateLinkCost(senderId);

    let changed = false;

    // 1. Process routes advertised by neighbor
    for (const entry of neighborTable) {
      const targetId = entry.destinationId;
      
      // Avoid loops: if I am in the path or I am the target, ignore
      if (targetId === this.myId) continue;

      const newTotalCost = linkCost + entry.cost;
      const currentRoute = this.routingTable.get(targetId);

      // Bellman-Ford relaxation
      // Update if we found a cheaper path OR if the update comes from our current next-hop (topology change)
      if (!currentRoute || newTotalCost < currentRoute.cost || currentRoute.nextHopId === senderId) {
        this.routingTable.set(targetId, {
          destinationId: targetId,
          nextHopId: senderId,
          cost: newTotalCost,
          hops: entry.hops + 1
        });
        changed = true;
      }
    }

    // 2. Also ensure we have a route to the sender itself
    const routeToSender = this.routingTable.get(senderId);
    if (!routeToSender || linkCost < routeToSender.cost) {
      this.routingTable.set(senderId, {
        destinationId: senderId,
        nextHopId: senderId,
        cost: linkCost,
        hops: 1
      });
      changed = true;
    }

    return changed;
  }

  recalculateRoutes() {
    // Base Check: Direct peers are always routes with cost = linkCost
    this.directPeers.forEach(peerId => {
      const linkCost = metricsTracker.calculateLinkCost(peerId);
      const current = this.routingTable.get(peerId);
      
      // If no route, or we found a direct link is cheaper than a specialized route (unlikely but possible in weird graph weights)
      // or if the current route IS direct, update it.
      if (!current || (current.nextHopId === peerId && current.cost !== linkCost)) {
        this.routingTable.set(peerId, {
          destinationId: peerId,
          nextHopId: peerId,
          cost: linkCost,
          hops: 1
        });
      }
    });
  }

  getNextHop(destinationId: string): string | null {
    if (this.directPeers.has(destinationId)) return destinationId;
    const route = this.routingTable.get(destinationId);
    return route ? route.nextHopId : null;
  }

  // Prepare table to broadcast to neighbors (Split Horizon could be applied here but keeping it simple)
  getExportableTable(): RouteEntry[] {
    return Array.from(this.routingTable.values());
  }

  getRouteInfo(destinationId: string): RouteEntry | undefined {
    return this.routingTable.get(destinationId);
  }

  reset() {
    this.routingTable.clear();
    this.directPeers.clear();
  }
}

export const routingEngine = new RoutingEngine();
