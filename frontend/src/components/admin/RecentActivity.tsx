'use client';

import { motion } from 'framer-motion';
import { Clock, LogIn, MessageSquare } from 'lucide-react';
import { RecentActivityItem, formatRelativeDate } from '@/lib/admin';

interface RecentActivityProps {
  activities: RecentActivityItem[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Actividad Reciente</h3>
          <p className="text-slate-500 text-xs">Últimos eventos del sistema</p>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-slate-500 text-sm">Sin actividad reciente</p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((activity, index) => (
            <motion.div
              key={`${activity.type}-${activity.timestamp}-${index}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + index * 0.05 }}
              className="flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-slate-700/20 transition-colors group"
            >
              {/* Icon */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activity.type === 'login'
                    ? 'bg-emerald-500/10'
                    : 'bg-blue-500/10'
                }`}
              >
                {activity.type === 'login' ? (
                  <LogIn className="w-4 h-4 text-emerald-400" />
                ) : (
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium group-hover:text-orange-300 transition-colors">
                    {activity.user_name}
                  </span>
                  <span className="text-slate-600 text-xs">
                    {activity.user_company}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5 truncate">
                  {activity.type === 'login' ? 'Inició sesión' : activity.detail}
                </p>
              </div>

              {/* Timestamp */}
              <span className="text-slate-600 text-[11px] flex-shrink-0 mt-0.5">
                {formatRelativeDate(activity.timestamp)}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
