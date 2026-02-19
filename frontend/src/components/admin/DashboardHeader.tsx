'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, MessageSquare, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';

interface DashboardHeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function DashboardHeader({ onRefresh, isRefreshing }: DashboardHeaderProps) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    sessionStorage.removeItem('psf_admin_verified');
    await signOut();
    router.push('/login');
  };

  return (
    <div className="relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900" />
      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-transparent to-orange-500/5" />

      <div className="relative px-6 lg:px-10 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Welcome + Logo */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
                <img
                  src="/logo-psf.png"
                  alt="PSF"
                  className="w-10 h-10 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
            </div>
            <div>
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-2xl lg:text-3xl font-bold text-white"
              >
                Bienvenido, Victor
              </motion.h1>
              <p className="text-orange-400 font-medium text-sm mt-0.5">
                CEO - Pro Smart Factories
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {currentTime.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {' · '}
                {currentTime.toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl text-sm text-orange-400 hover:text-orange-300 transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              Ir al Chatbot
            </button>
            <button
              onClick={handleLogout}
              className="p-2.5 bg-slate-800/80 hover:bg-red-500/20 border border-slate-700/50 hover:border-red-500/30 rounded-xl text-slate-400 hover:text-red-400 transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom border accent */}
      <div className="h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
    </div>
  );
}
