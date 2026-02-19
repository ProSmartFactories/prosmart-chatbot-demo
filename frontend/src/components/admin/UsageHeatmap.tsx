'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Grid3X3 } from 'lucide-react';
import { HeatmapCell } from '@/lib/admin';

interface UsageHeatmapProps {
  data: HeatmapCell[];
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'bg-slate-900/40';
  const ratio = count / max;
  if (ratio < 0.2) return 'bg-orange-500/10';
  if (ratio < 0.4) return 'bg-orange-500/20';
  if (ratio < 0.6) return 'bg-orange-500/40';
  if (ratio < 0.8) return 'bg-orange-500/60';
  return 'bg-orange-500/80';
}

export function UsageHeatmap({ data }: UsageHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ day: number; hour: number; count: number; x: number; y: number } | null>(null);

  // Build lookup map
  const cellMap = new Map<string, number>();
  let maxCount = 0;
  for (const cell of data) {
    const key = `${cell.day_of_week}-${cell.hour}`;
    cellMap.set(key, cell.count);
    if (cell.count > maxCount) maxCount = cell.count;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 relative"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Grid3X3 className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Mapa de Uso</h3>
          <p className="text-slate-500 text-xs">Actividad por hora y dia de la semana</p>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex mb-1 ml-10">
            {HOURS.filter((h) => h % 3 === 0).map((h) => (
              <div
                key={h}
                className="text-slate-500 text-[10px] text-center"
                style={{ width: `${(100 / 24) * 3}%` }}
              >
                {h.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Rows: one per day */}
          {DAYS.map((dayLabel, dayIndex) => (
            <div key={dayIndex} className="flex items-center gap-1 mb-1">
              <div className="w-9 text-slate-500 text-xs text-right pr-1 flex-shrink-0">
                {dayLabel}
              </div>
              <div className="flex-1 grid grid-cols-24 gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
                {HOURS.map((hour) => {
                  const count = cellMap.get(`${dayIndex}-${hour}`) || 0;
                  const colorClass = getColor(count, maxCount);
                  return (
                    <div
                      key={hour}
                      className={`aspect-square rounded-sm ${colorClass} cursor-pointer transition-all hover:ring-1 hover:ring-orange-400/50`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ day: dayIndex, hour, count, x: rect.left, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4">
        <span className="text-slate-500 text-[10px]">Menos</span>
        <div className="flex gap-[2px]">
          {['bg-slate-900/40', 'bg-orange-500/10', 'bg-orange-500/20', 'bg-orange-500/40', 'bg-orange-500/60', 'bg-orange-500/80'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
        </div>
        <span className="text-slate-500 text-[10px]">Mas</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
          style={{
            left: tooltip.x + 20,
            top: tooltip.y - 10,
          }}
        >
          <p className="text-white text-xs font-medium">
            {DAYS[tooltip.day]} {tooltip.hour.toString().padStart(2, '0')}:00
          </p>
          <p className="text-orange-400 text-xs">
            {tooltip.count} {tooltip.count === 1 ? 'mensaje' : 'mensajes'}
          </p>
        </div>
      )}
    </motion.div>
  );
}
