
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Droplets, HeartPulse, Tent, Wrench, CircleHelp, 
  MapPin, Clock, Plus, Filter, AlertTriangle, CheckCircle, Search, X
} from 'lucide-react';
import { ResourceItem, ResourceType, ResourcePriority, ResourceStatus } from '../types/resourceTypes';
import { resourceSync } from '../services/network/resourceSync';
import { mesh } from '../services/mesh';
import { RoomConfig } from '../types';

interface ResourceBoardProps {
  roomConfig: RoomConfig;
}

const ResourceBoard: React.FC<ResourceBoardProps> = ({ roomConfig }) => {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [filterType, setFilterType] = useState<ResourceType | 'All'>('All');
  const [filterPriority, setFilterPriority] = useState<ResourcePriority | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Load and Subscribe
  useEffect(() => {
    resourceSync.loadFromDB(roomConfig.id).then(setResources);
    const unsub = resourceSync.subscribe(setResources);
    return () => { unsub(); };
  }, [roomConfig.id]);

  // Derived State
  const filteredResources = resources
    .filter(r => filterType === 'All' || r.type === filterType)
    .filter(r => filterPriority === 'All' || r.priority === filterPriority)
    .filter(r => 
       r.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
       r.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => b.updatedAt - a.updatedAt); // Newest first

  const getTypeIcon = (type: ResourceType) => {
    switch (type) {
      case 'Food': return <Package className="text-orange-400" />;
      case 'Water': return <Droplets className="text-blue-400" />;
      case 'Medical': return <HeartPulse className="text-red-400" />;
      case 'Shelter': return <Tent className="text-green-400" />;
      case 'Supplies': return <Wrench className="text-gray-400" />;
      default: return <CircleHelp className="text-purple-400" />;
    }
  };

  const getPriorityColor = (p: ResourcePriority) => {
    if (p === 'High') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (p === 'Medium') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="flex flex-col h-full bg-dark-950 relative">
      {/* Header / Filters */}
      <div className="p-4 bg-dark-900 border-b border-gray-800 space-y-3">
        <div className="flex items-center gap-2 bg-dark-950 border border-gray-700 rounded-xl px-3 py-2">
           <Search size={18} className="text-gray-500" />
           <input 
             type="text" 
             placeholder="Search resources..." 
             className="bg-transparent outline-none text-white text-sm w-full"
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
           />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(['All', 'High', 'Medium', 'Low'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                filterPriority === p 
                ? 'bg-emergency-600 border-emergency-500 text-white' 
                : 'bg-dark-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {p === 'All' ? 'All Priorities' : p}
            </button>
          ))}
          <div className="w-px h-6 bg-gray-700 mx-1"></div>
          {(['All', 'Medical', 'Food', 'Water', 'Shelter'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t as any)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                filterType === t 
                ? 'bg-blue-600 border-blue-500 text-white' 
                : 'bg-dark-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {t === 'All' ? 'All Types' : t}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredResources.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
             <Package size={48} className="mx-auto mb-4 opacity-20" />
             <p>No resources found.</p>
             <p className="text-xs">Add items to help the group.</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredResources.map(r => (
              <ResourceCard key={r.id} item={r} roomConfig={roomConfig} getTypeIcon={getTypeIcon} getPriorityColor={getPriorityColor} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowAddModal(true)}
        className="absolute bottom-6 right-6 bg-emergency-600 text-white p-4 rounded-full shadow-lg border-2 border-emergency-500 z-20"
      >
        <Plus size={24} />
      </motion.button>

      {showAddModal && <AddResourceModal roomConfig={roomConfig} onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

const ResourceCard: React.FC<{ 
  item: ResourceItem, 
  roomConfig: RoomConfig,
  getTypeIcon: (t: ResourceType) => React.ReactNode,
  getPriorityColor: (p: ResourcePriority) => string
}> = ({ item, roomConfig, getTypeIcon, getPriorityColor }) => {
  const isAvailable = item.status === 'Available';
  
  const handleToggleStatus = () => {
     const newStatus = isAvailable ? 'Unavailable' : 'Available';
     const updated = { ...item, status: newStatus as ResourceStatus, updatedAt: Date.now() };
     resourceSync.broadcastResourceAction('UPDATE', updated, roomConfig);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`bg-dark-800 rounded-xl p-4 border relative overflow-hidden ${item.priority === 'High' ? 'border-red-500/40 shadow-sm shadow-red-900/10' : 'border-gray-700'}`}
    >
      {/* Status Stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isAvailable ? 'bg-green-500' : 'bg-gray-600'}`}></div>

      <div className="flex justify-between items-start mb-2 pl-2">
        <div className="flex items-center gap-2">
          {getTypeIcon(item.type)}
          <div>
            <h3 className={`font-bold text-sm ${!isAvailable && 'line-through text-gray-500'}`}>{item.title}</h3>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
               <Clock size={10} /> {new Date(item.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
               <span>•</span>
               <span>{item.createdBy.slice(0,6)}</span>
            </div>
          </div>
        </div>
        <div className={`text-[10px] px-2 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>
           {item.priority} Priority
        </div>
      </div>

      <p className="text-xs text-gray-300 mb-3 pl-2 leading-relaxed">{item.description}</p>

      <div className="flex items-center justify-between pl-2">
         <div className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin size={12} />
            <span className="truncate max-w-[120px]">{item.location}</span>
         </div>
         
         <button 
           onClick={handleToggleStatus}
           className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
             isAvailable 
             ? 'bg-green-900/20 text-green-400 border-green-500/30 hover:bg-green-900/30' 
             : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700'
           }`}
         >
           {isAvailable ? <CheckCircle size={12}/> : <AlertTriangle size={12}/>}
           {item.status}
         </button>
      </div>
    </motion.div>
  );
};

const AddResourceModal: React.FC<{ roomConfig: RoomConfig, onClose: () => void }> = ({ roomConfig, onClose }) => {
  const [type, setType] = useState<ResourceType>('Food');
  const [priority, setPriority] = useState<ResourcePriority>('Medium');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!title || !desc || !location) {
      setError('All fields are required');
      return;
    }

    const newItem: ResourceItem = {
      id: crypto.randomUUID(),
      roomId: roomConfig.id,
      type,
      priority,
      title,
      description: desc,
      location,
      status: 'Available',
      createdBy: mesh.myId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
      verifiedCount: 0
    };

    resourceSync.broadcastResourceAction('CREATE', newItem, roomConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-0">
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-dark-900 w-full max-w-md rounded-2xl border border-gray-700 shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-dark-800">
           <h3 className="font-bold text-white">Add Emergency Resource</h3>
           <button onClick={onClose}><X className="text-gray-400" /></button>
        </div>
        
        <div className="p-5 space-y-4">
           {error && <div className="text-red-400 text-xs bg-red-900/20 p-2 rounded">{error}</div>}
           
           <div className="grid grid-cols-2 gap-3">
              <div>
                 <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Type</label>
                 <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-dark-950 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none">
                    <option value="Food">Food</option>
                    <option value="Water">Water</option>
                    <option value="Medical">Medical</option>
                    <option value="Shelter">Shelter</option>
                    <option value="Supplies">Supplies</option>
                    <option value="Other">Other</option>
                 </select>
              </div>
              <div>
                 <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Priority</label>
                 <select value={priority} onChange={e => setPriority(e.target.value as any)} className="w-full bg-dark-950 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High (Emergency)</option>
                 </select>
              </div>
           </div>

           <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 5 Gallons Water" className="w-full bg-dark-950 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none" />
           </div>
           
           <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Details..." rows={2} className="w-full bg-dark-950 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none resize-none" />
           </div>

           <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Location / Coordinates</label>
              <div className="relative">
                 <MapPin size={14} className="absolute left-3 top-2.5 text-gray-500" />
                 <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Hall, Room 102" className="w-full bg-dark-950 border border-gray-700 rounded-lg p-2 pl-9 text-sm text-white outline-none" />
              </div>
           </div>

           <button onClick={handleSubmit} className="w-full bg-emergency-600 hover:bg-emergency-500 text-white font-bold py-3 rounded-xl transition-colors mt-2">
              Post Resource
           </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ResourceBoard;
