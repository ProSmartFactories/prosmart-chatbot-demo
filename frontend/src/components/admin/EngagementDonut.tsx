'use client';

import { motion } from 'framer-motion';
import { PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { UserStat } from '@/lib/admin';

interface EngagementDonutProps {
  users: UserStat[];
}

const SEGMENTS = [
  { key: 'power', label: 'Power Users', range: '10+ msgs', color: '#F97316', minMessages: 10 },
  { key: 'regular', label: 'Regulares', range: '3-9 msgs', color: '#FB923C', minMessages: 3 },
  { key: 'light', label: 'Ligeros', range: '1-2 msgs', color: '#FDBA74', minMessages: 1 },
  { key: 'inactive', label: 'Inactivos', range: '0 msgs', color: '#475569', minMessages: 0 },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; range: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const item = payload[0].payload;

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 shadow-xl">
      <p className="text-white font-medium text-sm">{item.name}</p>
      <p className="text-slate-400 text-xs mt-0.5">{item.range}</p>
      <p className="text-orange-400 font-semibold text-sm mt-1">{item.value} usuario{item.value !== 1 ? 's' : ''}</p>
    </div>
  );
}

export function EngagementDonut({ users }: EngagementDonutProps) {
  const categorized = {
    power: users.filter((u) => u.total_messages >= 10).length,
    regular: users.filter((u) => u.total_messages >= 3 && u.total_messages < 10).length,
    light: users.filter((u) => u.total_messages >= 1 && u.total_messages < 3).length,
    inactive: users.filter((u) => u.total_messages === 0).length,
  };

  const chartData = SEGMENTS.map((seg) => ({
    name: seg.label,
    value: categorized[seg.key as keyof typeof categorized],
    range: seg.range,
    color: seg.color,
  })).filter((d) => d.value > 0);

  // If no data, show all as inactive
  if (chartData.length === 0) {
    chartData.push({
      name: 'Sin usuarios',
      value: 1,
      range: 'N/A',
      color: '#334155',
    });
  }

  const totalUsers = users.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <PieChartIcon className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Engagement</h3>
          <p className="text-slate-500 text-xs">Distribución por actividad</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Donut Chart */}
        <div className="relative w-[180px] h-[180px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                paddingAngle={2}
                strokeWidth={0}
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-white">{totalUsers}</span>
            <span className="text-slate-500 text-[10px]">usuarios</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {SEGMENTS.map((seg) => {
            const count = categorized[seg.key as keyof typeof categorized];
            const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
            return (
              <div key={seg.key} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-sm">{seg.label}</span>
                    <span className="text-white font-medium text-sm">{count}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: seg.color }}
                      />
                    </div>
                    <span className="text-slate-500 text-[10px] w-8 text-right">{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
