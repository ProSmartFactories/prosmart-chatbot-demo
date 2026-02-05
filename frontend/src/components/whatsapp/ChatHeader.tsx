'use client';

import { ChevronLeft, Phone, Video, MoreVertical } from 'lucide-react';

interface ChatHeaderProps {
  userName?: string;
  onBack?: () => void;
}

export function ChatHeader({ userName = 'Asistente Técnico', onBack }: ChatHeaderProps) {
  return (
    <div className="bg-[#075E54] text-white px-2 py-2 flex items-center gap-1 shadow-md">
      {/* Back button */}
      <button onClick={onBack} className="p-1 hover:bg-white/10 rounded-full transition-colors">
        <ChevronLeft size={28} strokeWidth={2.5} />
      </button>

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center overflow-hidden flex-shrink-0">
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      </div>

      {/* Contact info */}
      <div className="flex-1 ml-2">
        <div className="font-semibold text-[16px] leading-tight">{userName}</div>
        <div className="text-[12px] text-white/80">en línea</div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Video size={22} />
        </button>
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Phone size={20} />
        </button>
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <MoreVertical size={22} />
        </button>
      </div>
    </div>
  );
}
