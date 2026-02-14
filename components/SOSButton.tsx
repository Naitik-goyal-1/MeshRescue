import React from 'react';
import { AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface SOSButtonProps {
  onTrigger: () => void;
}

const SOSButton: React.FC<SOSButtonProps> = ({ onTrigger }) => {
  const MotionButton = motion.button as any;
  return (
    <MotionButton
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onTrigger}
      className="fixed bottom-6 right-6 z-50 bg-emergency-600 text-white rounded-full p-6 shadow-lg shadow-emergency-900/50 flex items-center justify-center border-4 border-emergency-500 animate-pulse-fast hover:animate-none transition-colors"
      aria-label="SOS Emergency Broadcast"
    >
      <AlertCircle size={42} strokeWidth={2.5} />
      <span className="sr-only">SOS</span>
      <div className="absolute inset-0 rounded-full border border-emergency-400 opacity-50 animate-ping"></div>
    </MotionButton>
  );
};

export default SOSButton;