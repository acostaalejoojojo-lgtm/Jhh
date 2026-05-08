import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smile, X, Play, Music } from 'lucide-react';
import { Emote } from '../types';

interface EmoteWheelProps {
  emotes: Emote[];
  onSelect: (emoteId: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const EmoteWheel: React.FC<EmoteWheelProps> = ({ emotes, onSelect, onClose, isOpen }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        className="relative w-80 h-80 rounded-full bg-[#1a1b1e]/90 border-4 border-blue-600/30 flex items-center justify-center p-4 shadow-[0_0_50px_rgba(37,99,235,0.2)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute inset-0 rounded-full border border-blue-400/20 animate-[spin_20s_linear_infinite]" />
        
        {/* Central Close Button */}
        <button 
          onClick={onClose}
          className="z-20 w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
        >
          <X className="text-white" size={24} />
        </button>

        {/* Emote Items */}
        {emotes.map((emote, i) => {
          const total = emotes.length;
          const angle = (i * 360) / total;
          const radius = 110; // Distance from center
          const x = Math.cos((angle - 90) * (Math.PI / 180)) * radius;
          const y = Math.sin((angle - 90) * (Math.PI / 180)) * radius;

          return (
            <motion.div
              key={emote.id}
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{ opacity: 1, x, y }}
              className="absolute z-10"
            >
              <button
                onClick={() => {
                  onSelect(emote.id);
                  onClose();
                }}
                className="group relative flex flex-col items-center justify-center w-20 h-20 bg-gray-800 hover:bg-blue-600 rounded-2xl border-2 border-gray-700 hover:border-blue-400 transition-all hover:scale-110 shadow-lg active:scale-95"
              >
                <div className="text-blue-400 group-hover:text-white mb-1">
                   {emote.soundUrl ? <Music size={20} /> : <Play size={20} />}
                </div>
                <span className="text-[9px] font-black uppercase text-gray-400 group-hover:text-white px-1 text-center leading-tight">
                  {emote.name}
                </span>
                
                {/* Tooltip */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap uppercase tracking-widest">
                  Reproducir
                </div>
              </button>
            </motion.div>
          );
        })}

        {emotes.length === 0 && (
          <div className="text-center text-gray-500 px-6">
            <Smile size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-[10px] font-bold uppercase">No tienes emotes configurados</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};
