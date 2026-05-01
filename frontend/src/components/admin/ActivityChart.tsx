'use client';

import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailyActivity } from '@/lib/admin';

interface ActivityChartProps {
  data: DailyActivity[];
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string; payload?: { fullDate?: string } }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;

  const fullDate = payload[0]?.payload?.fullDate;
  const date = fullDate ? parseLocalDate(fullDate) : null;
  const formatted = date && !isNaN(date.getTime())
    ? date.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 shadow-xl">
      <p className="text-slate-400 text-xs mb-2">{formatted}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-300">
            {entry.dataKey === 'logins' ? 'Sesiones' : 'Mensajes'}:
          </span>
          <span className="text-white font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityChart({ data }: ActivityChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    date: parseLocalDate(d.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    fullDate: d.date,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Actividad Diaria</h3>
          <p className="text-slate-500 text-xs">Últimos 30 días</p>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradientLogins" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradientMessages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00A884" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00A884" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(51, 65, 85, 0.3)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span className="text-slate-400 text-xs">
                  {value === 'logins' ? 'Sesiones' : 'Mensajes'}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="logins"
              stroke="#F97316"
              strokeWidth={2}
              fill="url(#gradientLogins)"
              dot={false}
              activeDot={{ r: 4, fill: '#F97316', stroke: '#1E293B', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="messages"
              stroke="#00A884"
              strokeWidth={2}
              fill="url(#gradientMessages)"
              dot={false}
              activeDot={{ r: 4, fill: '#00A884', stroke: '#1E293B', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
