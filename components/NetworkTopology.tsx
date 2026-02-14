
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { mesh } from '../services/mesh';
import { peerManager } from '../services/network/peerManager';
import { routingEngine } from '../services/network/routingEngine';
import { metricsTracker } from '../services/network/metricsTracker';
import { User } from '../types';

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  user: User | undefined;
  isMe: boolean;
  radius: number;
  color: string;
}

interface Link {
  source: string;
  target: string;
  type: 'DIRECT' | 'INDIRECT';
  quality: number; // 0-100
}

const NetworkTopology: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  // Physics constants
  const REPULSION = 800;
  const SPRING_LENGTH = 120;
  const SPRING_STRENGTH = 0.05;
  const DAMPING = 0.85;
  const CENTER_GRAVITY = 0.01;

  const nodesRef = useRef<Map<string, Node>>(new Map());
  const linksRef = useRef<Link[]>([]);
  const frameRef = useRef<number>(0);

  // Initialize data
  useEffect(() => {
    const initData = () => {
      const currentNodes = nodesRef.current;
      const newLinks: Link[] = [];
      
      // 1. Ensure "Me" exists
      if (!currentNodes.has(mesh.myId)) {
        currentNodes.set(mesh.myId, createNode(mesh.myId, true));
      }

      // 2. Get all known peers from PeerManager
      const allUsers = peerManager.getAllUsers();
      allUsers.forEach((user, id) => {
        if (!currentNodes.has(id)) {
          currentNodes.set(id, createNode(id, false, user));
        } else {
          // Update user data reference
          const n = currentNodes.get(id)!;
          n.user = user;
          
          // Update visual props based on metrics
          const metrics = metricsTracker.getMetrics(id);
          n.radius = 15 + (metrics.signalStrength / 100) * 5; 
          
          // Color based on role/status
          if (id !== mesh.myId) {
             if (metrics.latency > 500) n.color = '#ef4444'; // Red (Poor)
             else if (user.role === 'RELAY') n.color = '#f59e0b'; // Orange
             else n.color = '#3b82f6'; // Blue
          }
        }
      });

      // 3. Build Links based on Routing Table
      // Direct connections
      const directPeers = mesh.getPeers();
      directPeers.forEach(peerId => {
        if (currentNodes.has(peerId)) {
          const m = metricsTracker.getMetrics(peerId);
          newLinks.push({
            source: mesh.myId,
            target: peerId,
            type: 'DIRECT',
            quality: m.signalStrength
          });
        }
      });

      // Indirect connections (Visualized as NextHop -> Destination)
      const routes = routingEngine.getExportableTable();
      routes.forEach(route => {
        // If route is indirect (hops > 1), draw link from NextHop to Dest
        if (route.hops > 1) {
             if (currentNodes.has(route.nextHopId) && currentNodes.has(route.destinationId)) {
                 newLinks.push({
                     source: route.nextHopId,
                     target: route.destinationId,
                     type: 'INDIRECT',
                     quality: 50 // Generic quality for indirect
                 });
             }
        }
      });

      // Prune nodes that are gone
      // (Optional: keep them for a bit?)
      
      linksRef.current = newLinks;
      setStats({ nodes: currentNodes.size, edges: newLinks.length });
    };

    const createNode = (id: string, isMe: boolean, user?: User): Node => {
      const width = containerRef.current?.clientWidth || 500;
      const height = containerRef.current?.clientHeight || 500;
      return {
        id,
        x: width / 2 + (Math.random() - 0.5) * 50,
        y: height / 2 + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        isMe,
        user,
        radius: isMe ? 25 : 15,
        color: isMe ? '#10b981' : '#6b7280'
      };
    };

    const interval = setInterval(initData, 1000);
    initData();
    return () => clearInterval(interval);
  }, []);

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      canvas.width = width;
      canvas.height = height;

      // Physics Update
      const nodes = Array.from(nodesRef.current.values());
      const links = linksRef.current;

      // 1. Repulsion (Node vs Node)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!a.isMe) { a.vx += fx; a.vy += fy; }
          if (!b.isMe) { b.vx -= fx; b.vy -= fy; }
        }
      }

      // 2. Attraction (Links)
      links.forEach(link => {
        const s = nodesRef.current.get(link.source);
        const t = nodesRef.current.get(link.target);
        if (s && t) {
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // Hooke's Law
          const displacement = dist - SPRING_LENGTH;
          const force = displacement * SPRING_STRENGTH;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!s.isMe) { s.vx += fx; s.vy += fy; }
          if (!t.isMe) { t.vx -= fx; t.vy -= fy; }
        }
      });

      // 3. Center Gravity & Update
      nodes.forEach(n => {
        if (n.isMe) {
            n.x = width / 2;
            n.y = height / 2;
            n.vx = 0; 
            n.vy = 0;
            return;
        }

        const dx = (width / 2) - n.x;
        const dy = (height / 2) - n.y;
        n.vx += dx * CENTER_GRAVITY;
        n.vy += dy * CENTER_GRAVITY;

        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
      });

      // Render
      ctx.clearRect(0, 0, width, height);

      // Draw Links
      links.forEach(link => {
        const s = nodesRef.current.get(link.source);
        const t = nodesRef.current.get(link.target);
        if (s && t) {
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          
          if (link.type === 'DIRECT') {
              ctx.strokeStyle = `rgba(59, 130, 246, ${0.2 + (link.quality/200)})`; // Blueish
              ctx.lineWidth = 2 + (link.quality / 50);
              ctx.setLineDash([]);
          } else {
              ctx.strokeStyle = 'rgba(156, 163, 175, 0.4)'; // Gray
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 5]);
          }
          ctx.stroke();
        }
      });

      // Draw Nodes
      nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        
        // Glow
        const gradient = ctx.createRadialGradient(n.x, n.y, n.radius * 0.5, n.x, n.y, n.radius * 1.5);
        gradient.addColorStop(0, n.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.strokeStyle = '#1f2937'; // dark-800
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const name = n.user?.username || n.id.slice(0, 4);
        ctx.fillText(name.slice(0, 10), n.x, n.y + n.radius + 15);
      });

      frameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let found: Node | null = null;
    nodesRef.current.forEach(n => {
        const dist = Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2);
        if (dist < n.radius + 5) found = n;
    });
    setHoveredNode(found);
  };

  return (
    <div className="relative w-full h-full bg-dark-950 overflow-hidden" ref={containerRef} onMouseMove={handleMouseMove}>
        <canvas ref={canvasRef} className="block" />
        
        <div className="absolute top-4 left-4 bg-dark-800/80 backdrop-blur p-3 rounded-xl border border-gray-700 text-xs text-gray-400">
            <div className="font-bold text-white mb-1">Network Topology</div>
            <div>Nodes: {stats.nodes}</div>
            <div>Edges: {stats.edges}</div>
            <div className="mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Client
                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Relay
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Me
            </div>
        </div>

        {hoveredNode && (
             <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bg-dark-800/90 backdrop-blur border border-gray-600 rounded-lg p-3 shadow-xl z-10 pointer-events-none"
                style={{ left: hoveredNode.x + 20, top: hoveredNode.y - 20 }}
             >
                 <div className="font-bold text-white text-sm mb-1">{hoveredNode.user?.username || 'Unknown'}</div>
                 <div className="text-xs text-gray-400 font-mono mb-1">ID: {hoveredNode.id.slice(0, 8)}...</div>
                 <div className="text-xs space-y-1">
                     <div className="flex justify-between gap-4"><span>Role:</span> <span className="text-blue-400">{hoveredNode.isMe ? 'Host' : hoveredNode.user?.role || 'Client'}</span></div>
                     {!hoveredNode.isMe && (
                        <>
                         <div className="flex justify-between gap-4"><span>Battery:</span> <span className={hoveredNode.user?.batteryLevel && hoveredNode.user.batteryLevel < 20 ? 'text-red-400' : 'text-green-400'}>{hoveredNode.user?.batteryLevel}%</span></div>
                         <div className="flex justify-between gap-4"><span>Latency:</span> <span>{metricsTracker.getMetrics(hoveredNode.id).latency}ms</span></div>
                         <div className="flex justify-between gap-4"><span>Signal:</span> <span>{metricsTracker.getMetrics(hoveredNode.id).signalStrength}%</span></div>
                        </>
                     )}
                 </div>
             </motion.div>
        )}
    </div>
  );
};

export default NetworkTopology;
