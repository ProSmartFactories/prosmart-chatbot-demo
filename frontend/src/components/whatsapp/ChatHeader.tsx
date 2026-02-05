'use client';

import { ChevronLeft, Phone, Video, MoreVertical } from 'lucide-react';

interface ChatHeaderProps {
  onBack?: () => void;
}

export function ChatHeader({ onBack }: ChatHeaderProps) {
  return (
    <div className="bg-[#075E54] text-white px-2 py-2 flex items-center gap-1 shadow-md">
      {/* Back button */}
      <button onClick={onBack} className="p-1 hover:bg-white/10 rounded-full transition-colors">
        <ChevronLeft size={28} strokeWidth={2.5} />
      </button>

      {/* Avatar with logo */}
      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
        <img
          src="/logo-psf.png"
          alt="Encargado Digital"
          className="w-8 h-8 object-contain"
        />
      </div>

      {/* Contact info */}
      <div className="flex-1 ml-2">
        <div className="font-semibold text-[16px] leading-tight">Encargado Digital</div>
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
