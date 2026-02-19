'use client';

import { motion } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, Layers, Image, ArrowRight } from 'lucide-react';
import { AIPerformance } from '@/lib/admin';

interface AIPerformanceCardProps {
  performance: AIPerformance;
}

export function AIPerformanceCard({ performance }: AIPerformanceCardProps) {
  const {
    avg_response_time_ms,
    total_interactions,
    fast,
    medium,
    slow,
    very_slow,
    avg_chunks_per_response,
    image_delivery_rate,
    trend_7d,
  } = performance;

  const total = fast + medium + slow + very_slow || 1;
  const bars = [
    { label: '<2s', count: fast, color: 'bg-emerald-500', pct: Math.round((fast / total) * 100) },
    { label: '2-5s', count: medium, color: 'bg-amber-500', pct: Math.round((medium / total) * 100) },
    { label: '5-10s', count: slow, color: 'bg-orange-500', pct: Math.round((slow / total) * 100) },
    { label: '>10s', count: very_slow, color: 'bg-red-500', pct: Math.round((very_slow / total) * 100) },
  ];

  const avgSeconds = avg_response_time_ms / 1000;
  const isGoodTrend = trend_7d <= 0; // Lower response time is better

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Rendimiento IA</h3>
          <p className="text-slate-500 text-xs">{total_interactions} interacciones totales</p>
        </div>
      </div>

      {/* Main metric: avg response time */}
      <div className="text-center mb-6">
        <div className="text-4xl font-bold text-white mb-1">
          {avgSeconds.toFixed(1)}<span className="text-lg text-slate-400 ml-1">s</span>
        </div>
        <p className="text-slate-500 text-xs mb-2">Tiempo de respuesta promedio</p>
        {trend_7d !== 0 && (
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
            isGoodTrend ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {isGoodTrend ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {Math.abs(trend_7d).toFixed(1)}% vs semana anterior
          </div>
        )}
      </div>

      {/* Stacked bar: response time distribution */}
      <div className="mb-4">
        <p className="text-slate-400 text-xs mb-2">Distribucion de tiempos</p>
        <div className="flex rounded-full overflow-hidden h-3 bg-slate-900/60">
          {bars.map((bar) => (
            bar.pct > 0 && (
              <motion.div
                key={bar.label}
                initial={{ width: 0 }}
                animate={{ width: `${bar.pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`${bar.color} h-full`}
                title={`${bar.label}: ${bar.count} (${bar.pct}%)`}
              />
            )
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {bars.map((bar) => (
            <div key={bar.label} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${bar.color}`} />
              <span className="text-slate-500 text-[10px]">{bar.label}</span>
              <span className="text-slate-400 text-[10px] font-medium">{bar.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-700/30">
        <div className="bg-slate-900/40 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-500 text-xs">Chunks/respuesta</span>
          </div>
          <p className="text-white text-lg font-semibold">{avg_chunks_per_response}</p>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Image className="w-4 h-4 text-purple-400" />
            <span className="text-slate-500 text-xs">Con imagenes</span>
          </div>
          <p className="text-white text-lg font-semibold">{image_delivery_rate}%</p>
        </div>
      </div>
    </motion.div>
  );
}
