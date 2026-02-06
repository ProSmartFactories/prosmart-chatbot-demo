'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Phone, Video, MoreVertical, LogOut, User } from 'lucide-react';

interface ChatHeaderProps {
  onBack?: () => void;
  onLogout?: () => void;
  userName?: string;
}

export function ChatHeader({ onBack, onLogout, userName }: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  return (
    <div className="bg-[#075E54] text-white px-2 py-2 flex items-center gap-1 shadow-md relative">
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
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <MoreVertical size={22} />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 min-w-[180px] z-50">
              {userName && (
                <div className="px-4 py-2 border-b border-gray-100">
                  <div className="flex items-center gap-2 text-gray-700">
                    <User size={16} />
                    <span className="text-sm font-medium truncate">{userName}</span>
                  </div>
                </div>
              )}
              {onLogout && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onLogout();
                  }}
                  className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                >
                  <LogOut size={18} />
                  <span className="text-[15px]">Cerrar sesión</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
