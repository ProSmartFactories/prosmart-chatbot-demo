'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Phone, Video, MoreVertical, LogOut, User } from 'lucide-react';

interface ChatHeaderProps {
  onBack?: () => void;
  onLogout?: () => void;
  userName?: string;
}

export function ChatHeader({ onBack, onLogout, userName }: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Calculate fixed position from button
  const openMenu = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setShowMenu(true);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

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
      <div className="flex-1 ml-2 min-w-0">
        <div className="font-semibold text-[16px] leading-tight truncate">Encargado Digital</div>
        <div className="text-[12px] text-white/80">en línea</div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Video size={22} />
        </button>
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Phone size={20} />
        </button>
        <button
          ref={buttonRef}
          onClick={() => showMenu ? setShowMenu(false) : openMenu()}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <MoreVertical size={22} />
        </button>
      </div>

      {/* Dropdown menu rendered via Portal to escape overflow-hidden parents */}
      {showMenu && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-xl py-1 z-[9999]"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            minWidth: 200,
          }}
        >
          {userName && (
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2 text-gray-700">
                <User size={16} className="flex-shrink-0" />
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
        </div>,
        document.body
      )}
    </div>
  );
}
