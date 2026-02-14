import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Camera, X } from 'lucide-react';
import QRScanner from './QRScanner';
import { motion } from 'framer-motion';

interface SignalingModalProps {
  isOpen: boolean;
  onClose: () => void;
  generatedSignal: string | null;
  onScan: (data: string) => void;
  step: 'INIT' | 'SHOW_OFFER' | 'SCAN_ANSWER' | 'SHOW_ANSWER';
  setStep: (s: any) => void;
}

const SignalingModal: React.FC<SignalingModalProps> = ({ 
  isOpen, onClose, generatedSignal, onScan, step, setStep 
}) => {
  const [showScanner, setShowScanner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const MotionDiv = motion.div as any;

  if (!isOpen) return null;

  const handleCopy = () => {
    if (generatedSignal) {
      navigator.clipboard.writeText(generatedSignal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleManualSubmit = () => {
    if(manualInput) {
        onScan(manualInput);
        setManualInput('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <MotionDiv 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-dark-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white">Connect Device</h2>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white" /></button>
        </div>

        <div className="p-6 flex flex-col items-center space-y-6">
            
            {/* Visual Guide */}
            <div className="text-center text-gray-300">
                {step === 'INIT' && "Choose 'Add Device' to start connection."}
                {step === 'SHOW_OFFER' && "Ask your peer to scan this QR Code."}
                {step === 'SCAN_ANSWER' && "Now scan the QR Code on your peer's screen."}
            </div>

            {/* QR Display Area */}
            {generatedSignal ? (
                <div className="bg-white p-4 rounded-xl">
                    <QRCodeSVG value={generatedSignal} size={200} level="L" />
                </div>
            ) : (
                <div className="w-full flex justify-center py-8">
                     <button 
                        onClick={() => setShowScanner(true)}
                        className="bg-emergency-600 hover:bg-emergency-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-semibold shadow-lg shadow-emergency-900/20"
                     >
                        <Camera />
                        Scan Peer QR
                     </button>
                </div>
            )}

            {/* Manual Fallback */}
            <div className="w-full space-y-3">
                {generatedSignal && (
                    <button 
                        onClick={handleCopy}
                        className="w-full flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-700 border border-gray-600 text-sm py-2 rounded-lg transition-colors"
                    >
                        {copied ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}
                        {copied ? 'Copied to Clipboard' : 'Copy Code manually'}
                    </button>
                )}
                
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Or paste code here..."
                        className="w-full bg-dark-950 border border-gray-700 rounded-lg py-2 px-3 text-sm text-white focus:ring-1 focus:ring-emergency-500 outline-none"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                    />
                    {manualInput && (
                        <button 
                            onClick={handleManualSubmit}
                            className="absolute right-2 top-2 text-emergency-500 hover:text-emergency-400 text-xs font-bold"
                        >
                            SUBMIT
                        </button>
                    )}
                </div>
            </div>
        </div>
      </MotionDiv>

      {showScanner && (
        <QRScanner 
            onScan={(data) => {
                setShowScanner(false);
                onScan(data);
            }} 
            onClose={() => setShowScanner(false)} 
        />
      )}
    </div>
  );
};

export default SignalingModal;