
import React, { useState, useEffect, useRef } from 'react';
import { RoomConfig, Message, User } from '../types';
import { Send, Plus, UserPlus, Activity, Copy, Mic, MicOff, Settings, Trash2, Clock, User as UserIcon, ArrowDown, Bluetooth, MessageSquare, Network, Package, Cloud, CloudOff, RefreshCw, ArrowLeft, LogOut, AlertTriangle, X } from 'lucide-react';
import { mesh } from '../services/mesh';
import { peerManager } from '../services/network/peerManager';
import { syncEngine } from '../services/syncEngine';
import SignalingModal from './SignalingModal';
import NetworkStatusPanel from './NetworkStatusPanel';
import NetworkTopology from './NetworkTopology';
import ResourceBoard from './ResourceBoard';
import { motion, AnimatePresence } from 'framer-motion';

interface RoomProps {
  roomConfig: RoomConfig;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
  username: string;
  onUpdateUsername: (name: string) => void;
  onLeaveRoom: () => void;
}

const Room: React.FC<RoomProps> = ({ roomConfig, messages, onSendMessage, onUpdateConfig, username, onUpdateUsername, onLeaveRoom }) => {
  const [text, setText] = useState('');
  const [peers, setPeers] = useState<string[]>([]);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'network' | 'resources'>('chat');
  
  // Scroll State
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Voice State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // Bluetooth State
  const [isBleConnected, setIsBleConnected] = useState(false);

  // Sync State
  const [syncStatus, setSyncStatus] = useState<'OFFLINE' | 'SYNCING' | 'ACTIVE' | 'ERROR'>('OFFLINE');

  // Signaling State
  const [showSignalModal, setShowSignalModal] = useState(false);
  const [signalStep, setSignalStep] = useState<'INIT' | 'SHOW_OFFER' | 'SCAN_ANSWER' | 'SHOW_ANSWER'>('INIT');
  const [generatedSignal, setGeneratedSignal] = useState<string | null>(null);

  // Leave Confirmation State
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const MotionDiv = motion.div as any;
  const MotionButton = motion.button as any;

  // --- Scroll Logic ---
  const handleScroll = () => {
      if (!scrollViewportRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isScrolledUp = distanceFromBottom > 150;
      setShowScrollButton(isScrolledUp);
      if (!isScrolledUp) setUnreadCount(0);
  };

  const scrollToBottom = () => {
      scrollViewportRef.current?.scrollTo({ top: scrollViewportRef.current.scrollHeight, behavior: 'smooth' });
      setUnreadCount(0);
  };

  useEffect(() => {
    if (activeTab !== 'chat') return;
    if (!scrollViewportRef.current) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    const isMe = lastMsg.senderId === mesh.myId;
    
    if (isMe) {
        setTimeout(scrollToBottom, 50);
        return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    if (distanceFromBottom < 200) {
        setTimeout(scrollToBottom, 50);
    } else {
        setUnreadCount(prev => prev + 1);
    }
  }, [messages, activeTab]);

  // --- Mesh & Stats Logic ---
  useEffect(() => {
    const updateStats = () => {
        setPeers(mesh.getPeers());
        setIsBleConnected(mesh.bluetooth.isConnected);
    };

    const handleRemoteStreamAdded = ({ peerId, stream }: { peerId: string, stream: MediaStream }) => {
        setRemoteStreams(prev => new Map(prev).set(peerId, stream));
    };

    const handleRemoteStreamRemoved = (peerId: string) => {
        setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
        });
    };

    mesh.on('peer-connected', updateStats);
    mesh.on('connection-change', updateStats);
    mesh.on('stats-update', updateStats);
    mesh.on('remote-stream-added', handleRemoteStreamAdded);
    mesh.on('remote-stream-removed', handleRemoteStreamRemoved);

    const unsubSync = syncEngine.subscribeStatus(setSyncStatus);

    updateStats();

    return () => {
      unsubSync();
    };
  }, []);

  // --- Handlers ---
  const handleAddDevice = async () => {
    setSignalStep('SHOW_OFFER');
    const offer = await mesh.generateOffer();
    setGeneratedSignal(offer);
    setShowSignalModal(true);
  };

  const handleConnectBle = async () => {
      const success = await mesh.connectBluetooth();
      setIsBleConnected(success);
  };

  const handleScan = async (data: string) => {
    const result = await mesh.handleSignal(data);
    if (result) {
        setGeneratedSignal(result);
        setSignalStep('SHOW_ANSWER');
    } else {
        if(signalStep === 'SHOW_OFFER') {
            setShowSignalModal(false);
            setGeneratedSignal(null);
        }
    }
  };

  const toggleVoice = async () => {
      if (isVoiceActive) {
          mesh.stopVoice();
          setIsVoiceActive(false);
          setIsMuted(false);
      } else {
          const success = await mesh.startVoice();
          if (success) {
              setIsVoiceActive(true);
              setIsMuted(false); 
          }
      }
  };

  const toggleMute = () => {
      const newState = !isMuted;
      setIsMuted(newState);
      mesh.toggleMute(newState);
  };

  const startPTT = () => {
      if(isVoiceActive) { setIsMuted(false); mesh.toggleMute(false); }
  };
  const stopPTT = () => {
      if(isVoiceActive) { setIsMuted(true); mesh.toggleMute(true); }
  };
  const copyRoomId = () => { navigator.clipboard.writeText(roomConfig.id); }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-dark-950">
      <SignalingModal 
        isOpen={showSignalModal}
        onClose={() => { setShowSignalModal(false); setGeneratedSignal(null); setSignalStep('INIT'); }}
        generatedSignal={generatedSignal}
        onScan={handleScan}
        step={signalStep}
        setStep={setSignalStep}
      />
      
      {/* Leave Confirmation Modal */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <MotionDiv
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-dark-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
             >
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-dark-800">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <LogOut size={18} /> Leave Room?
                    </h3>
                    <button onClick={() => setShowLeaveConfirm(false)}><X className="text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-6">
                    <p className="text-gray-300 text-sm mb-6">
                        You will disconnect from all peers in this session. Messages are saved locally on your device.
                    </p>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setShowLeaveConfirm(false)}
                            className="flex-1 bg-dark-800 hover:bg-dark-700 border border-gray-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={onLeaveRoom}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
                        >
                            Leave Room
                        </button>
                    </div>
                </div>
             </MotionDiv>
          </div>
        )}
      </AnimatePresence>

      {Array.from(remoteStreams.entries()).map(([id, stream]) => (
          <audio key={id} autoPlay ref={audio => { if(audio) audio.srcObject = stream; }} />
      ))}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-dark-900 border-r border-gray-800 transform transition-transform z-30 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 flex flex-col`}>
        <div className="p-6 flex-1 overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-1">Room {roomConfig.id}</h2>
             <button onClick={copyRoomId} className="text-xs text-emergency-500 font-mono mb-6 flex items-center gap-2 hover:text-emergency-400">
                <Copy size={12} />
                ID: {roomConfig.id}
            </button>
            
            <div className="mb-6 space-y-3">
                <button 
                    onClick={handleAddDevice}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg p-3 flex items-center justify-center gap-2 text-sm font-medium transition-all"
                >
                    <UserPlus size={16} />
                    Add Device
                </button>

                <button 
                    onClick={handleConnectBle}
                    className={`w-full border text-white rounded-lg p-3 flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                        isBleConnected 
                        ? 'bg-blue-900/50 border-blue-500/50 text-blue-200' 
                        : 'bg-white/5 hover:bg-white/10 border-white/10'
                    }`}
                >
                    <Bluetooth size={16} className={isBleConnected ? 'text-blue-400' : ''}/>
                    {isBleConnected ? 'BLE Connected' : 'Connect BLE Relay'}
                </button>

                <div className="bg-dark-800 rounded-xl p-3 border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-400 uppercase">Voice Comms</span>
                        {isVoiceActive && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
                    </div>
                    
                    <button 
                        onClick={toggleVoice}
                        className={`w-full mb-2 p-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                            isVoiceActive 
                            ? 'bg-red-900/50 text-red-200 border border-red-800 hover:bg-red-900' 
                            : 'bg-green-700 text-white hover:bg-green-600'
                        }`}
                    >
                        {isVoiceActive ? 'Disconnect Audio' : 'Join Voice Channel'}
                    </button>

                    {isVoiceActive && (
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={toggleMute}
                                className={`p-2 rounded-lg flex items-center justify-center border transition-all ${
                                    isMuted ? 'bg-red-600 border-red-500 text-white' : 'bg-dark-700 border-gray-600 text-gray-300'
                                }`}
                            >
                                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                            <button
                                onMouseDown={startPTT}
                                onMouseUp={stopPTT}
                                onTouchStart={startPTT}
                                onTouchEnd={stopPTT}
                                className="p-2 rounded-lg bg-emergency-600 text-white font-bold text-xs flex items-center justify-center shadow-lg active:scale-95 active:bg-emergency-500 select-none"
                            >
                                HOLD PTT
                            </button>
                        </div>
                    )}
                </div>
                
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-full flex items-center justify-between p-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-2"><Settings size={14} /> Room Settings</span>
                    <span className="text-xs">{showSettings ? 'Hide' : 'Show'}</span>
                </button>

                <AnimatePresence>
                    {showSettings && (
                        <MotionDiv
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden bg-dark-800 rounded-xl border border-gray-700"
                        >
                            <div className="p-3 space-y-4">
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
                                        <UserIcon size={12} /> Username
                                    </label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-dark-900 border border-gray-600 rounded-lg p-2 text-sm text-white focus:border-emergency-500 outline-none"
                                        value={username}
                                        onChange={(e) => onUpdateUsername(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
                                        <Trash2 size={12} /> Auto-Delete Chat
                                    </label>
                                    <select 
                                        className="w-full bg-dark-900 border border-gray-600 rounded-lg p-2 text-sm text-white focus:border-emergency-500 outline-none"
                                        value={roomConfig.retentionPolicy || 0}
                                        onChange={(e) => onUpdateConfig({ retentionPolicy: Number(e.target.value) })}
                                    >
                                        <option value={0}>Never (Keep forever)</option>
                                        <option value={3600000}>After 1 Hour</option>
                                        <option value={86400000}>After 24 Hours</option>
                                        <option value={604800000}>After 7 Days</option>
                                    </select>
                                </div>

                                <button 
                                    onClick={() => setShowLeaveConfirm(true)}
                                    className="w-full bg-red-900/20 border border-red-900/50 hover:bg-red-900/40 text-red-400 p-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all"
                                >
                                    <LogOut size={14} />
                                    Leave Room
                                </button>
                            </div>
                        </MotionDiv>
                    )}
                </AnimatePresence>
            </div>

            <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Network Graph</h3>
                <NetworkStatusPanel />

                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Connected Nodes ({peers.length})</h3>
                <ul className="space-y-2">
                    {/* Me */}
                    <li className="flex items-center gap-3 text-sm text-white bg-white/5 p-2 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold">ME</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="font-medium truncate max-w-[100px]">{username}</div>
                                {isVoiceActive && (
                                    <div className={`flex items-center justify-center w-5 h-5 rounded-full ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                                        {isMuted ? <MicOff size={10} /> : <Mic size={10} />}
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-green-400">Online (Host)</div>
                        </div>
                    </li>
                    {/* Peers */}
                    {peers.map(p => {
                        const summary = peerManager.getPeerSummary(p);
                        const displayName = summary.user?.username || p.slice(0, 8);
                        const hasStream = remoteStreams.has(p);
                        const latency = summary.metrics.latency;
                        
                        return (
                        <li key={p} className="flex items-center gap-3 text-sm text-gray-300 p-2">
                             <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">{displayName.slice(0,2).toUpperCase()}</div>
                             <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="truncate font-medium">{displayName}</div>
                                    {hasStream && (
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-500">
                                            <Mic size={10} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                     <span>{latency < 999 ? `${latency}ms` : '...'}</span>
                                     {summary.user?.batteryLevel && <span>• 🔋 {summary.user.batteryLevel}%</span>}
                                </div>
                             </div>
                        </li>
                    )})}
                </ul>
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        <div className="h-16 bg-dark-900/80 backdrop-blur-md border-b border-gray-800 flex items-center justify-between px-4 z-20 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={() => setShowLeaveConfirm(true)} className="text-gray-400 hover:text-white transition-colors" title="Leave Room">
                     <ArrowLeft size={24} />
                </button>
                <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="md:hidden text-white">
                    <UserPlus size={24} />
                </button>
                <div className="flex flex-col">
                    <span className="font-bold text-lg leading-tight md:hidden">ID: {roomConfig.id}</span>
                    <span className="text-xs text-gray-400 hidden md:inline-block">Smart Mesh Network Active</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* Sync Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  syncStatus === 'ACTIVE' ? 'bg-green-900/20 text-green-400 border-green-500/30' :
                  syncStatus === 'SYNCING' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30' :
                  'bg-gray-800 text-gray-400 border-gray-700'
                }`}>
                  {syncStatus === 'ACTIVE' ? <Cloud size={14} /> :
                   syncStatus === 'SYNCING' ? <RefreshCw size={14} className="animate-spin" /> :
                   <CloudOff size={14} />
                  }
                  <span className="hidden sm:inline">
                    {syncStatus === 'ACTIVE' ? 'Cloud Backup' :
                     syncStatus === 'SYNCING' ? 'Syncing...' :
                     'Offline Mode'}
                  </span>
                </div>

                {/* View Switcher */}
                <div className="flex bg-dark-800 rounded-lg p-1 border border-gray-700">
                    <button 
                        onClick={() => setActiveTab('chat')}
                        className={`p-1.5 rounded-md transition-all ${activeTab === 'chat' ? 'bg-dark-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                        title="Chat View"
                    >
                        <MessageSquare size={16} />
                    </button>
                    <button 
                        onClick={() => setActiveTab('network')}
                        className={`p-1.5 rounded-md transition-all ${activeTab === 'network' ? 'bg-dark-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                        title="Network Topology"
                    >
                        <Network size={16} />
                    </button>
                    <button 
                        onClick={() => setActiveTab('resources')}
                        className={`p-1.5 rounded-md transition-all ${activeTab === 'resources' ? 'bg-dark-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                        title="Emergency Resources"
                    >
                        <Package size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-2 bg-dark-800 px-3 py-1.5 rounded-full border border-gray-700">
                    <Activity size={14} className="text-emergency-500" />
                    <span className="text-xs font-mono font-bold text-gray-300">
                        {peers.length > 0 ? 'MESH OK' : 'OFFLINE'}
                    </span>
                </div>
            </div>
        </div>

        {activeTab === 'chat' ? (
            <>
                {/* Messages */}
                <div 
                    className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth min-h-0 relative" 
                    ref={scrollViewportRef}
                    onScroll={handleScroll}
                >
                    <AnimatePresence initial={false}>
                        {messages.map((msg) => {
                            const isMe = msg.senderId === mesh.myId;
                            return (
                                <MotionDiv 
                                    layout
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.2 }}
                                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[80%] rounded-2xl p-4 ${
                                        isMe 
                                        ? 'bg-emergency-600 text-white rounded-tr-sm' 
                                        : 'bg-dark-800 text-gray-200 border border-gray-700 rounded-tl-sm'
                                    }`}>
                                        {!isMe && <div className="text-xs text-gray-400 mb-1 font-bold">{msg.senderName || msg.senderId.slice(0,6)}</div>}
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                        <div className="text-[10px] opacity-50 mt-2 text-right flex items-center justify-end gap-1">
                                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            {msg.synced && <Cloud size={10} className="text-green-300/70" />}
                                        </div>
                                    </div>
                                </MotionDiv>
                            )
                        })}
                    </AnimatePresence>
                </div>

                {/* Floating Scroll Button */}
                <AnimatePresence>
                    {showScrollButton && (
                        <MotionButton
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            onClick={scrollToBottom}
                            className="absolute bottom-24 right-6 z-50 bg-dark-800/80 backdrop-blur-md border border-gray-700 text-white p-3 rounded-full shadow-lg hover:bg-dark-700 transition-colors group"
                        >
                            <ArrowDown size={20} className="group-hover:text-emergency-500 transition-colors" />
                            {unreadCount > 0 && (
                                <div className="absolute -top-2 -left-2 bg-emergency-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full animate-bounce">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </div>
                            )}
                        </MotionButton>
                    )}
                </AnimatePresence>

                {/* Input Area */}
                <div className="p-4 bg-dark-900/90 backdrop-blur border-t border-gray-800 shrink-0 relative z-30">
                    <div className="flex items-center gap-2 bg-dark-950 border border-gray-700 rounded-2xl p-2 pl-4">
                        <button className="text-gray-400 hover:text-white transition-colors"><Plus size={20}/></button>
                        <input 
                            type="text" 
                            className="flex-1 bg-transparent text-white outline-none placeholder-gray-600"
                            placeholder="Type encrypted message..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && text.trim() && (onSendMessage(text), setText(''))}
                        />
                        <button 
                            onClick={() => { if(text.trim()) { onSendMessage(text); setText(''); } }}
                            className="bg-emergency-600 text-white p-2 rounded-xl hover:bg-emergency-500 transition-colors"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </>
        ) : activeTab === 'network' ? (
            <NetworkTopology />
        ) : (
            <ResourceBoard roomConfig={roomConfig} />
        )}
      </div>
    </div>
  );
};

export default Room;
