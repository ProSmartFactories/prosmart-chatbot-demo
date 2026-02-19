'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface DailyActivity {
  date: string;
  logins: number;
  messages: number;
}

export interface CompanyData {
  company: string;
  count: number;
}

export interface FunnelData {
  registered: number;
  completed_profile: number;
  sent_first_message: number;
}

export interface AdminKPIs {
  total_users: number;
  active_users_7d: number;
  active_users_30d: number;
  new_users_7d: number;
  new_users_30d: number;
  total_conversations: number;
  conversations_7d: number;
  avg_messages_per_user: number;
  avg_session_duration_seconds: number;
  avg_response_time_ms: number;
  companies: CompanyData[];
  daily_activity: DailyActivity[];
  funnel: FunnelData;
}

export interface UserStat {
  user_id: string;
  email: string;
  name: string;
  company: string;
  registered_at: string;
  login_count: number;
  total_interaction_time_seconds: number;
  total_messages: number;
  last_active: string;
}

export interface RecentActivityItem {
  type: 'login' | 'message';
  user_id: string;
  timestamp: string;
  detail: string;
  user_name: string;
  user_company: string;
}

export interface ChatLogItem {
  id: number;
  user_id: string;
  user_name: string;
  user_company: string;
  message_text: string;
  response_text: string;
  chunks_used: number;
  images_returned: number;
  response_time_ms: number;
  created_at: string;
}

export interface TopQuestion {
  question: string;
  count: number;
}

export interface HeatmapCell {
  day_of_week: number; // 0=Domingo, 1=Lunes ... 6=Sábado
  hour: number;        // 0-23
  count: number;
}

export interface AIPerformance {
  avg_response_time_ms: number;
  total_interactions: number;
  fast: number;      // <2s
  medium: number;    // 2-5s
  slow: number;      // 5-10s
  very_slow: number; // >10s
  avg_chunks_per_response: number;
  image_delivery_rate: number; // 0-100
  trend_7d: number; // % change
}

export interface KPITrends {
  users_trend: number;
  messages_trend: number;
  sessions_trend: number;
  response_time_trend: number;
}

export interface AdminData {
  kpis: AdminKPIs;
  userStats: UserStat[];
  recentActivity: RecentActivityItem[];
  chatLogs: ChatLogItem[];
  topQuestions: TopQuestion[];
  usageHeatmap: HeatmapCell[];
  aiPerformance: AIPerformance;
  kpiTrends: KPITrends;
}

// ============================================================================
// ADMIN EMAIL
// ============================================================================

export const ADMIN_EMAIL = 'victor@prosmartfactories.com';

export function isAdminEmail(email: string | undefined): boolean {
  return email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// ============================================================================
// DATA FETCHING
// ============================================================================

export async function fetchAdminData(accessToken: string): Promise<AdminData> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase configuration missing');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/admin-stats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey,
      'x-user-token': accessToken,
    },
  });

  if (response.status === 403) {
    throw new Error('FORBIDDEN');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// HOOKS
// ============================================================================

export function useAdminData(accessToken: string | undefined) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminData(accessToken);
      setData(result);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      refresh();
    }
  }, [accessToken, refresh]);

  return { data, loading, error, refresh };
}

// ============================================================================
// HELPERS
// ============================================================================

export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Ahora';
  if (diffMinutes < 60) return `Hace ${diffMinutes}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function getEngagementLevel(u: UserStat): string {
  // Score based on logins, messages, and interaction time
  let score = 0;
  if (u.login_count >= 5) score += 3;
  else if (u.login_count >= 2) score += 2;
  else if (u.login_count >= 1) score += 1;

  if (u.total_messages >= 10) score += 3;
  else if (u.total_messages >= 5) score += 2;
  else if (u.total_messages >= 1) score += 1;

  if (u.total_interaction_time_seconds >= 600) score += 3;
  else if (u.total_interaction_time_seconds >= 120) score += 2;
  else if (u.total_interaction_time_seconds >= 30) score += 1;

  if (score >= 7) return 'Alto';
  if (score >= 4) return 'Medio';
  if (score >= 1) return 'Bajo';
  return 'Sin actividad';
}

function getDaysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function getLeadStatus(u: UserStat): string {
  const daysSinceActive = getDaysSince(u.last_active);
  if (daysSinceActive <= 3) return 'Caliente';
  if (daysSinceActive <= 7) return 'Tibio';
  if (daysSinceActive <= 30) return 'Frio';
  return 'Inactivo';
}

function escapeCSV(val: string): string {
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  const escaped = val.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportToCSV(users: UserStat[], filename: string = 'leads_prosmart.csv'): void {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const headers = [
    'N°',
    'Nombre Completo',
    'Empresa',
    'Email',
    'Fecha Registro',
    'Dias desde Registro',
    'Ultima Actividad',
    'Dias Inactivo',
    'Total Sesiones',
    'Total Mensajes al Bot',
    'Tiempo de Interaccion',
    'Tiempo Interaccion (min)',
    'Nivel de Engagement',
    'Estado del Lead',
  ];

  const rows = users
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
    .map((u, idx) => [
      (idx + 1).toString(),
      u.name,
      u.company,
      u.email,
      new Date(u.registered_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      getDaysSince(u.registered_at).toString(),
      new Date(u.last_active).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      getDaysSince(u.last_active).toString(),
      u.login_count.toString(),
      u.total_messages.toString(),
      formatDuration(u.total_interaction_time_seconds),
      Math.round(u.total_interaction_time_seconds / 60).toString(),
      getEngagementLevel(u),
      getLeadStatus(u),
    ]);

  // Build CSV with title row
  const titleRow = `"Reporte de Leads - Pro Smart Factories - ${dateStr}"`;
  const emptyRow = '""';
  const headerRow = headers.map((h) => escapeCSV(h)).join(';');
  const dataRows = rows.map((r) => r.map((c) => escapeCSV(c)).join(';'));

  // Summary row
  const totalMessages = users.reduce((sum, u) => sum + u.total_messages, 0);
  const totalSessions = users.reduce((sum, u) => sum + u.login_count, 0);
  const activeUsers = users.filter((u) => getDaysSince(u.last_active) <= 7).length;
  const summaryRows = [
    emptyRow,
    `"RESUMEN"`,
    `"Total Leads";${escapeCSV(users.length.toString())}`,
    `"Leads Activos (7 dias)";${escapeCSV(activeUsers.toString())}`,
    `"Total Sesiones";${escapeCSV(totalSessions.toString())}`,
    `"Total Mensajes";${escapeCSV(totalMessages.toString())}`,
  ];

  const csv = [titleRow, emptyRow, headerRow, ...dataRows, ...summaryRows].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
