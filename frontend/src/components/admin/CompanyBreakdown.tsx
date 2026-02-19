'use client';

import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CompanyData } from '@/lib/admin';

interface CompanyBreakdownProps {
  data: CompanyData[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CompanyData }> }) {
  if (!active || !payload?.[0]) return null;
  const item = payload[0].payload;

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 shadow-xl">
      <p className="text-white font-medium text-sm">{item.company}</p>
      <p className="text-orange-400 text-sm mt-1">{item.count} usuario{item.count !== 1 ? 's' : ''}</p>
    </div>
  );
}

const COLORS = [
  '#F97316', '#FB923C', '#FDBA74', '#FED7AA', '#FFEDD5',
  '#EA580C', '#C2410C', '#9A3412', '#7C2D12', '#431407',
];

export function CompanyBreakdown({ data }: CompanyBreakdownProps) {
  const chartData = (data || []).slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Empresas</h3>
          <p className="text-slate-500 text-xs">Usuarios por empresa</p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center">
          <p className="text-slate-500 text-sm">Sin datos de empresas aún</p>
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#64748B', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="company"
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(249, 115, 22, 0.05)' }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
