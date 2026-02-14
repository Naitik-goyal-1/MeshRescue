
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Share2, Activity, Battery, ArrowRight } from 'lucide-react';
import { mesh } from '../services/mesh';
import { routingEngine } from '../services/network/routingEngine';
import { peerManager } from '../services/network/peerManager';
import { metricsTracker } from '../services/network/metricsTracker';

const NetworkStatusPanel: React.FC = () => {
  const [routes, setRoutes] = useState<any[]>([]);
  const [myBattery, setMyBattery] = useState(100);

  useEffect(() => {
    const update = () => {
      const table = routingEngine.getExportableTable();
      setRoutes(table.map(r => {
          const peer = peerManager.getUser(r.destinationId);
          const nextHop = peerManager.getUser(r.nextHopId);
          return {
              ...r,
              peerName: peer?.username || r.destinationId.slice(0,4),
              nextHopName: nextHop?.username || r.nextHopId.slice(0,4)
          };
      }));
      setMyBattery(metricsTracker.getMyBatteryLevel());
    };

    mesh.on('stats-update', update);
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, []);

  if (routes.length === 0) return null;

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800/80 backdrop-blur border border-gray-700 rounded-xl p-3 mb-4 text-xs"
    >
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 font-bold uppercase tracking-wider">
                <Network size={12} /> Routing Table
            </div>
            <div className="flex items-center gap-1 text-green-400">
                <Battery size={10} /> {myBattery}%
            </div>
        </div>

        <div className="space-y-2 max-h-32 overflow-y-auto">
            {routes.map(route => {
                const isDirect = route.hops === 1;
                const quality = route.cost < 50 ? 'Good' : route.cost < 150 ? 'Moderate' : 'Weak';
                const qualityColor = route.cost < 50 ? 'text-green-400' : route.cost < 150 ? 'text-yellow-400' : 'text-red-400';

                return (
                    <div key={route.destinationId} className="flex items-center justify-between bg-dark-900/50 p-2 rounded">
                        <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${isDirect ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
                             <span className="font-bold text-gray-200">{route.peerName}</span>
                        </div>
                        
                        <div className="flex items-center gap-3 text-gray-500">
                            {!isDirect && (
                                <div className="flex items-center gap-1 text-[10px]">
                                    <span>Via {route.nextHopName}</span>
                                    <ArrowRight size={8} />
                                </div>
                            )}
                            <span className="bg-dark-800 px-1.5 rounded text-[10px] border border-gray-700">
                                {isDirect ? 'DIRECT' : `${route.hops} HOPS`}
                            </span>
                            <span className={`${qualityColor} font-mono w-8 text-right`}>{route.cost}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    </MotionDiv>
  );
};

export default NetworkStatusPanel;
