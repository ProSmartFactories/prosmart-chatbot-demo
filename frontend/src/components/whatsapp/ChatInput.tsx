'use client';

import { useState, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Paperclip, Camera, Mic, Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, onAttach, disabled }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="bg-[#F0F2F5] px-2 py-2 flex items-end gap-2">
      {/* Left actions */}
      <div className="flex items-center">
        <button className="p-2 text-[#54656F] hover:text-[#3B4A54] transition-colors">
          <Smile size={24} />
        </button>
      </div>

      {/* Attach button */}
      <button
        onClick={onAttach}
        className="p-2 text-[#54656F] hover:text-[#3B4A54] transition-colors"
      >
        <Paperclip size={24} className="rotate-45" />
      </button>

      {/* Input field */}
      <div className="flex-1 relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Mensaje"
          className="w-full bg-white rounded-[25px] px-4 py-[10px] text-[15px] text-[#3B4A54] placeholder-[#667781] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Camera button (when no text) */}
      {!hasText && (
        <button className="p-2 text-[#54656F] hover:text-[#3B4A54] transition-colors">
          <Camera size={24} />
        </button>
      )}

      {/* Send/Mic button */}
      <AnimatePresence mode="wait">
        {hasText ? (
          <motion.button
            key="send"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={handleSend}
            disabled={disabled}
            className="w-[48px] h-[48px] rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-md hover:bg-[#008F72] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={22} className="ml-[2px]" />
          </motion.button>
        ) : (
          <motion.button
            key="mic"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="w-[48px] h-[48px] rounded-full bg-[#00A884] flex items-center justify-center text-white shadow-md hover:bg-[#008F72] transition-colors"
          >
            <Mic size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
