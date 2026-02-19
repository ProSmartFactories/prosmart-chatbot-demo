'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ChevronDown, ChevronUp, Clock, Layers, Image, User } from 'lucide-react';
import { ChatLogItem, formatRelativeDate } from '@/lib/admin';

interface ChatLogViewerProps {
  logs: ChatLogItem[];
}

export function ChatLogViewer({ logs }: ChatLogViewerProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [page, setPage] = useState(0);
  const perPage = 10;

  const uniqueUsers = [...new Map(logs.map((l) => [l.user_id, { id: l.user_id, name: l.user_name }])).values()];

  const filtered = filterUser === 'all' ? logs : logs.filter((l) => l.user_id === filterUser);
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Conversaciones Recientes</h3>
            <p className="text-slate-500 text-xs">{filtered.length} interacciones</p>
          </div>
        </div>

        {/* Filter */}
        <select
          value={filterUser}
          onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
          className="bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
        >
          <option value="all">Todos los usuarios</option>
          {uniqueUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Chat logs */}
      <div className="space-y-3">
        {paginated.map((log) => {
          const isExpanded = expandedId === log.id;
          return (
            <motion.div
              key={log.id}
              layout
              className="bg-slate-900/40 border border-slate-700/30 rounded-xl overflow-hidden hover:border-slate-600/50 transition-colors"
            >
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-medium truncate">{log.user_name}</span>
                    <span className="text-slate-600 text-xs">|</span>
                    <span className="text-slate-500 text-xs truncate">{log.user_company}</span>
                  </div>
                  {/* User question bubble */}
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 mb-1">
                    <p className="text-emerald-300 text-sm line-clamp-2">{log.message_text}</p>
                  </div>
                  {/* Bot response preview */}
                  {!isExpanded && (
                    <p className="text-slate-400 text-xs line-clamp-1 mt-1">
                      {log.response_text?.slice(0, 150)}...
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-slate-500 text-xs">{formatRelativeDate(log.created_at)}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1 border-t border-slate-700/30">
                      {/* Full bot response */}
                      <div className="bg-slate-800/60 rounded-lg px-3 py-2 mb-3">
                        <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                          {log.response_text}
                        </p>
                      </div>
                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {log.response_time_ms > 1000
                            ? `${(log.response_time_ms / 1000).toFixed(1)}s`
                            : `${log.response_time_ms}ms`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          {log.chunks_used} chunks
                        </span>
                        <span className="flex items-center gap-1">
                          <Image className="w-3.5 h-3.5" />
                          {log.images_returned} imgs
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {paginated.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No hay conversaciones registradas
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-700/30">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Anterior
          </button>
          <span className="text-slate-400 text-xs">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}
    </motion.div>
  );
}
