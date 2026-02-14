import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, WifiOff, Activity, Plus, LogIn, ArrowRight, Clipboard, Check, User, Github, Heart } from 'lucide-react';
import { generateRoomId } from '../services/crypto';

interface LandingProps {
  onCreateRoom: (id: string, pass: string) => void;
  username: string;
  onSetUsername: (name: string) => void;
}

const Landing: React.FC<LandingProps> = ({ onCreateRoom, username, onSetUsername }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [roomId, setRoomId] = useState('');
  const [pass, setPass] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-generate ID on mount or when switching to create tab
  React.useEffect(() => {
    if (activeTab === 'create' && !generatedId) {
      setGeneratedId(generateRoomId());
    }
  }, [activeTab]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(generatedId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = () => {
      if(pass && username) {
          onCreateRoom(generatedId, pass);
      }
  };

  const handleJoin = () => {
      if(roomId && pass && username) {
          onCreateRoom(roomId.toUpperCase(), pass);
      }
  };

  const MotionDiv = motion.div as any;

  return (
    <div className="flex flex-col items-center min-h-screen relative bg-dark-950">
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-dark-800 via-dark-950 to-dark-950 -z-10 pointer-events-none"></div>
      <div className="fixed w-96 h-96 bg-emergency-900/10 rounded-full blur-3xl -top-20 -left-20 animate-pulse-fast -z-10 pointer-events-none"></div>
      
      <div className="w-full max-w-2xl p-6 flex flex-col items-center pt-12 pb-24">
        <MotionDiv 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="text-center w-full z-10"
        >
            <div className="flex justify-center mb-6">
                <div className="bg-dark-800 p-4 rounded-2xl border border-gray-800 shadow-2xl relative">
                    <Shield className="text-emergency-500 w-12 h-12" />
                    <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
                </div>
            </div>

            <h1 className="text-5xl font-black tracking-tighter mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            MeshRescue
            </h1>
            <p className="text-gray-500 text-lg mb-8 font-medium">
            Zero-Internet Emergency Network
            </p>

            {/* Global Username Input */}
            <div className="mb-6 max-w-sm mx-auto">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block text-left">Your Username</label>
                <div className="relative">
                    <User className="absolute left-3 top-3 text-gray-500" size={18} />
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => onSetUsername(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full bg-dark-900 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white focus:border-emergency-500 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex justify-center mb-8">
                <div className="bg-dark-900/50 p-1 rounded-xl border border-gray-800 flex relative">
                    <button 
                        onClick={() => setActiveTab('create')}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'create' ? 'bg-emergency-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Create Room
                    </button>
                    <button 
                        onClick={() => setActiveTab('join')}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'join' ? 'bg-emergency-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Join Room
                    </button>
                </div>
            </div>

            {/* Action Card */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
                {activeTab === 'create' ? (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="text-left">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Your Room ID</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 bg-dark-950 border border-emergency-900/50 rounded-xl p-4 text-2xl font-mono text-white tracking-widest text-center shadow-inner">
                                    {generatedId}
                                </div>
                                <button onClick={handleCopyId} className="bg-dark-800 hover:bg-dark-700 p-4 rounded-xl border border-gray-700 transition-colors">
                                    {copied ? <Check className="text-green-500"/> : <Clipboard className="text-gray-400"/>}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Share this code with nearby peers to let them join.</p>
                        </div>

                        <div className="text-left">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Set Room Password</label>
                            <input 
                                type="password" 
                                value={pass}
                                onChange={(e) => setPass(e.target.value)}
                                placeholder="Secret Key"
                                className="w-full bg-dark-950/50 border border-gray-700 rounded-xl p-3 text-white focus:border-emergency-500 outline-none"
                            />
                        </div>

                        <button 
                            onClick={handleCreate}
                            disabled={!pass || !username}
                            className="w-full bg-gradient-to-r from-emergency-600 to-emergency-700 hover:from-emergency-500 hover:to-emergency-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emergency-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={20} />
                            Launch Room
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="text-left">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Enter Room ID</label>
                            <input 
                                type="text" 
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                                placeholder="XXXX-XXXX"
                                maxLength={9}
                                className="w-full bg-dark-950/50 border border-gray-700 rounded-xl p-4 text-xl font-mono text-white placeholder-gray-600 focus:border-emergency-500 outline-none transition-all uppercase text-center"
                            />
                        </div>

                        <div className="text-left">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Room Password</label>
                            <input 
                                type="password" 
                                value={pass}
                                onChange={(e) => setPass(e.target.value)}
                                placeholder="Secret Key"
                                className="w-full bg-dark-950/50 border border-gray-700 rounded-xl p-3 text-white focus:border-emergency-500 outline-none"
                            />
                        </div>

                        <button 
                            onClick={handleJoin}
                            disabled={!roomId || !pass || !username}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <LogIn size={20} />
                            Join Network
                        </button>
                    </div>
                )}
            </div>

            <div className="flex justify-center gap-6 mt-12 text-gray-500 text-sm font-medium">
                <span className="flex items-center gap-2"><WifiOff size={16}/> Offline</span>
                <span className="flex items-center gap-2"><Activity size={16}/> Mesh</span>
                <span className="flex items-center gap-2"><Shield size={16}/> Secure</span>
            </div>

            {/* Simple Credit Section */}
            <footer className="w-full mt-24 mb-12 text-center text-gray-500">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-2 text-gray-400">About This Project</h3>
                <p className="text-sm mb-2 max-w-md mx-auto leading-relaxed">
                    This decentralized emergency mesh communication platform was developed by Naitik Goyal.
                </p>
                <a 
                    href="https://github.com/Naitik-goyal-1" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-emergency-500 hover:text-emergency-400 text-sm hover:underline font-medium transition-colors"
                >
                    https://github.com/Naitik-goyal-1
                </a>
            </footer>

        </MotionDiv>
      </div>
    </div>
  );
};

export default Landing;