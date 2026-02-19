'use client';

import { motion } from 'framer-motion';
import { Filter, UserPlus, UserCheck, MessageCircle } from 'lucide-react';
import { FunnelData } from '@/lib/admin';

interface FunnelChartProps {
  data: FunnelData;
}

const stages = [
  { key: 'registered', label: 'Registrados', icon: UserPlus, color: 'from-orange-500 to-orange-600' },
  { key: 'completed_profile', label: 'Perfil Completo', icon: UserCheck, color: 'from-orange-400 to-orange-500' },
  { key: 'sent_first_message', label: '1er Mensaje', icon: MessageCircle, color: 'from-amber-300 to-amber-400' },
] as const;

export function FunnelChart({ data }: FunnelChartProps) {
  const maxValue = Math.max(data.registered, 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Filter className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Embudo de Conversión</h3>
          <p className="text-slate-500 text-xs">Registro → Primera interacción</p>
        </div>
      </div>

      <div className="space-y-4">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const value = data[stage.key as keyof FunnelData];
          const percentage = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
          const widthPercent = Math.max(percentage, 8); // Min 8% width for visibility

          return (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              className="flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-orange-400" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-300 text-sm font-medium">{stage.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm">{value}</span>
                    <span className="text-slate-500 text-xs">({percentage}%)</span>
                  </div>
                </div>
                <div className="h-3 bg-slate-700/40 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPercent}%` }}
                    transition={{ delay: 0.8 + index * 0.15, duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full bg-gradient-to-r ${stage.color}`}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Drop-off summary */}
      {data.registered > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-700/30">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs">Conversión total</span>
            <span className="text-orange-400 font-bold text-sm">
              {Math.round((data.sent_first_message / Math.max(data.registered, 1)) * 100)}%
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
