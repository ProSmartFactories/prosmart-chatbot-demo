'use client';

import { motion } from 'framer-motion';

interface SuggestedChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export function SuggestedChips({ suggestions, onSelect }: SuggestedChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-3 py-2">
      {suggestions.map((suggestion, index) => (
        <motion.button
          key={suggestion}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => onSelect(suggestion)}
          className="bg-white border border-[#00A884] text-[#00A884] px-3 py-1.5 rounded-full text-[13px] font-medium hover:bg-[#00A884] hover:text-white transition-colors shadow-sm"
        >
          {suggestion}
        </motion.button>
      ))}
    </div>
  );
}
