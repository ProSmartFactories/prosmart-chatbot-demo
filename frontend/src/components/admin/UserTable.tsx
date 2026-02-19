'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Table,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { UserStat, formatDuration, formatDate, exportToCSV } from '@/lib/admin';

interface UserTableProps {
  users: UserStat[];
}

type SortKey = 'name' | 'company' | 'email' | 'registered_at' | 'login_count' | 'total_messages' | 'total_interaction_time_seconds' | 'last_active';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 10;

export function UserTable({ users }: UserTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('registered_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.company.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [filtered, sortKey, sortOrder]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-orange-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-orange-400" />
    );
  };

  const isActive = (user: UserStat) => {
    const lastActive = new Date(user.last_active);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return lastActive > sevenDaysAgo;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-700/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Table className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Usuarios</h3>
              <p className="text-slate-500 text-xs">{users.length} registrados</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Buscar usuario..."
                className="bg-slate-900/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50 w-60"
              />
            </div>
            <button
              onClick={() => exportToCSV(users)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-900/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                #
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('registered_at')}
              >
                <div className="flex items-center gap-1.5">
                  Fecha <SortIcon columnKey="registered_at" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('name')}
              >
                <div className="flex items-center gap-1.5">
                  Nombre <SortIcon columnKey="name" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('company')}
              >
                <div className="flex items-center gap-1.5">
                  Empresa <SortIcon columnKey="company" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('email')}
              >
                <div className="flex items-center gap-1.5">
                  Email <SortIcon columnKey="email" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('total_interaction_time_seconds')}
              >
                <div className="flex items-center gap-1.5">
                  Tiempo Bot <SortIcon columnKey="total_interaction_time_seconds" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('login_count')}
              >
                <div className="flex items-center gap-1.5">
                  Logins <SortIcon columnKey="login_count" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort('total_messages')}
              >
                <div className="flex items-center gap-1.5">
                  Mensajes <SortIcon columnKey="total_messages" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/20">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500 text-sm">
                  {search ? 'No se encontraron usuarios' : 'Sin usuarios registrados'}
                </td>
              </tr>
            ) : (
              paginated.map((user, idx) => (
                <tr
                  key={user.user_id}
                  className="hover:bg-slate-800/40 transition-colors group"
                >
                  <td className="px-4 py-3.5 text-slate-600 text-sm">
                    {page * PAGE_SIZE + idx + 1}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-sm whitespace-nowrap">
                    {formatDate(user.registered_at)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-white text-sm font-medium group-hover:text-orange-300 transition-colors">
                      {user.name}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 text-sm">
                    {user.company}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-sm">
                    {user.email}
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 text-sm font-mono">
                    {formatDuration(user.total_interaction_time_seconds)}
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 text-sm text-center">
                    {user.login_count}
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 text-sm text-center">
                    {user.total_messages}
                  </td>
                  <td className="px-4 py-3.5">
                    {isActive(user) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-600/20 text-slate-500 border border-slate-600/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        Inactivo
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-700/30 flex items-center justify-between">
          <p className="text-slate-500 text-sm">
            {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  page === i
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
