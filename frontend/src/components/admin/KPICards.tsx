'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Users,
  UserCheck,
  UserPlus,
  MessageSquare,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
} from 'lucide-react';
import { AdminKPIs, KPITrends, formatDuration } from '@/lib/admin';

interface KPICardsProps {
  kpis: AdminKPIs;
  trends?: KPITrends;
}

interface KPICardData {
  label: string;
  value: number;
  format: 'number' | 'duration' | 'percent' | 'ms';
  icon: React.ElementType;
  color: string;
  bgColor: string;
  trend?: number; // percentage change
  invertTrend?: boolean; // true = lower is better (e.g. response time)
}

function AnimatedCounter({ target, format }: { target: number; format: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    const duration = 1500;
    const start = 0;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (target - start) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, isInView]);

  const formatValue = () => {
    switch (format) {
      case 'duration':
        return formatDuration(count);
      case 'percent':
        return `${count}%`;
      case 'ms':
        return count > 1000 ? `${(count / 1000).toFixed(1)}s` : `${count}ms`;
      default:
        return count.toLocaleString('es-ES');
    }
  };

  return <span ref={ref}>{formatValue()}</span>;
}

export function KPICards({ kpis, trends }: KPICardsProps) {
  const conversionRate =
    kpis.total_users > 0
      ? Math.round((kpis.funnel.sent_first_message / kpis.total_users) * 100)
      : 0;

  const cards: KPICardData[] = [
    {
      label: 'Usuarios Totales',
      value: kpis.total_users,
      format: 'number',
      icon: Users,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      trend: trends?.users_trend,
    },
    {
      label: 'Activos (7 días)',
      value: kpis.active_users_7d,
      format: 'number',
      icon: UserCheck,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      trend: trends?.sessions_trend,
    },
    {
      label: 'Total Conversaciones',
      value: kpis.total_conversations,
      format: 'number',
      icon: MessageSquare,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      trend: trends?.messages_trend,
    },
    {
      label: 'Duración Promedio',
      value: kpis.avg_session_duration_seconds,
      format: 'duration',
      icon: Clock,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Nuevos (7 días)',
      value: kpis.new_users_7d,
      format: 'number',
      icon: UserPlus,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      trend: trends?.users_trend,
    },
    {
      label: 'Tasa Conversión',
      value: conversionRate,
      format: 'percent',
      icon: TrendingUp,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
    },
    {
      label: 'Mensajes (7 días)',
      value: kpis.conversations_7d,
      format: 'number',
      icon: BarChart3,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      trend: trends?.messages_trend,
    },
    {
      label: 'Tiempo Respuesta IA',
      value: kpis.avg_response_time_ms,
      format: 'ms',
      icon: Zap,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      trend: trends?.response_time_trend,
      invertTrend: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
            className="group relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-800/70 hover:border-slate-600/50 transition-all duration-300"
          >
            {/* Hover glow effect */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none" />

            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl lg:text-3xl font-bold text-white mb-1">
                <AnimatedCounter target={card.value} format={card.format} />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-slate-400 text-sm">{card.label}</p>
                {card.trend != null && card.trend !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                    (card.invertTrend ? card.trend < 0 : card.trend > 0)
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {(card.invertTrend ? card.trend < 0 : card.trend > 0)
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(card.trend)}%
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
