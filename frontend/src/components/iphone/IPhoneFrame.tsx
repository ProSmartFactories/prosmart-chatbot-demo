'use client';

import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useEffect, useState, ReactNode } from 'react';

interface IPhoneFrameProps {
  children: ReactNode;
}

function useCurrentTime() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const madridTime = now.toLocaleTimeString('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setTime(madridTime);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

export function IPhoneFrame({ children }: IPhoneFrameProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const currentTime = useCurrentTime();

  // Smooth spring animation for the rotation
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), {
    stiffness: 100,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), {
    stiffness: 100,
    damping: 20,
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      mouseX.set(clientX / innerWidth - 0.5);
      mouseY.set(clientY / innerHeight - 0.5);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className="perspective-[1500px] flex items-center justify-center">
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative"
      >
        {/* iPhone Frame - Titanium Design */}
        <div className="relative w-[375px] h-[812px] bg-gradient-to-br from-[#2a2a2e] via-[#1f1f23] to-[#18181b] rounded-[55px] p-[12px] shadow-2xl">
          {/* Titanium edge highlight */}
          <div className="absolute inset-0 rounded-[55px] bg-gradient-to-br from-[#4a4a50] via-transparent to-transparent opacity-30 pointer-events-none" />

          {/* Dynamic Island */}
          <div className="absolute top-[12px] left-1/2 -translate-x-1/2 w-[126px] h-[37px] bg-black rounded-[20px] z-20 flex items-center justify-center gap-3">
            {/* Front camera */}
            <div className="w-[10px] h-[10px] rounded-full bg-[#1a1a1a] ring-1 ring-[#333]" />
            {/* Face ID sensors */}
            <div className="w-[8px] h-[8px] rounded-full bg-[#1a1a1a] ring-1 ring-[#333]" />
          </div>

          {/* Screen bezel */}
          <div className="relative w-full h-full bg-black rounded-[44px] overflow-hidden">
            {/* Status bar area */}
            <div className="absolute top-0 left-0 right-0 h-[54px] z-10 flex items-end justify-between px-8 pb-1">
              <span className="text-white text-[14px] font-semibold">{currentTime || '9:41'}</span>
              <div className="flex items-center gap-1">
                {/* Signal bars - smallest left, largest right */}
                <div className="flex items-end gap-[1px]">
                  <div className="w-[3px] h-[3px] bg-white rounded-[1px]" />
                  <div className="w-[3px] h-[5px] bg-white rounded-[1px]" />
                  <div className="w-[3px] h-[7px] bg-white rounded-[1px]" />
                  <div className="w-[3px] h-[10px] bg-white rounded-[1px]" />
                </div>
                {/* WiFi */}
                <svg className="w-[15px] h-[11px] text-white ml-1" fill="currentColor" viewBox="0 0 16 12">
                  <path d="M8 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM3.5 7a.5.5 0 0 1 .354.146l.062.072a6.5 6.5 0 0 1 8.168 0l.062-.072a.5.5 0 0 1 .708.708l-.072.062a5.5 5.5 0 0 0-8.564 0l-.072-.062A.5.5 0 0 1 3.5 7zM1 4.5a.5.5 0 0 1 .354.146l.062.072a9.5 9.5 0 0 1 13.168 0l.062-.072a.5.5 0 0 1 .708.708l-.072.062a10.5 10.5 0 0 0-13.564 0l-.072-.062A.5.5 0 0 1 1 4.5z"/>
                </svg>
                {/* Battery */}
                <div className="flex items-center ml-1">
                  <div className="w-[22px] h-[11px] border border-white rounded-[3px] p-[1px]">
                    <div className="w-full h-full bg-white rounded-[1px]" />
                  </div>
                  <div className="w-[1px] h-[4px] bg-white rounded-r-sm ml-[1px]" />
                </div>
              </div>
            </div>

            {/* Screen content */}
            <div className="w-full h-full pt-[54px]">
              {children}
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white/30 rounded-full" />
          </div>

          {/* Side buttons - Volume */}
          <div className="absolute left-[-3px] top-[160px] w-[3px] h-[32px] bg-[#3a3a3e] rounded-l-sm" />
          <div className="absolute left-[-3px] top-[200px] w-[3px] h-[32px] bg-[#3a3a3e] rounded-l-sm" />

          {/* Side buttons - Silence toggle */}
          <div className="absolute left-[-3px] top-[110px] w-[3px] h-[20px] bg-[#3a3a3e] rounded-l-sm" />

          {/* Side buttons - Power */}
          <div className="absolute right-[-3px] top-[180px] w-[3px] h-[65px] bg-[#3a3a3e] rounded-r-sm" />
        </div>

        {/* 3D Shadow effect */}
        <div
          className="absolute inset-0 -z-10 blur-3xl opacity-40 rounded-[55px]"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.8) 100%)',
            transform: 'translateY(30px) scale(0.9)',
          }}
        />

        {/* Reflection on the frame */}
        <div className="absolute inset-0 rounded-[55px] pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
