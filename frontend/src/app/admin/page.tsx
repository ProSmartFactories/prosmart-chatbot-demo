'use client';

import { AdminGuard } from '@/components/admin/AdminGuard';
import { DashboardHeader } from '@/components/admin/DashboardHeader';
import { KPICards } from '@/components/admin/KPICards';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { CompanyBreakdown } from '@/components/admin/CompanyBreakdown';
import { FunnelChart } from '@/components/admin/FunnelChart';
import { EngagementDonut } from '@/components/admin/EngagementDonut';
import { UserTable } from '@/components/admin/UserTable';
import { RecentActivity } from '@/components/admin/RecentActivity';
import { ChatLogViewer } from '@/components/admin/ChatLogViewer';
import { TopQuestions } from '@/components/admin/TopQuestions';
import { UsageHeatmap } from '@/components/admin/UsageHeatmap';
import { AIPerformanceCard } from '@/components/admin/AIPerformanceCard';
import { useAdminData } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';

function DashboardContent() {
  const { session } = useAuth();
  const { data, loading, error, refresh } = useAdminData(session?.access_token);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 border-2 border-orange-500/30 rounded-full" />
            <div className="absolute inset-0 w-14 h-14 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 text-sm">Cargando panel de administración...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-red-500/20 p-8 max-w-md w-full text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Error al cargar datos</h3>
          <p className="text-slate-400 text-sm mb-6">
            {error === 'FORBIDDEN'
              ? 'No tienes permisos de administrador. Asegúrate de estar registrado como admin en la base de datos.'
              : error}
          </p>
          <button
            onClick={refresh}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        </motion.div>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, userStats, recentActivity, chatLogs, topQuestions, usageHeatmap, aiPerformance, kpiTrends } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-orange-500/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-orange-600/[0.02] rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <DashboardHeader onRefresh={refresh} isRefreshing={loading} />

        {/* Content */}
        <div className="px-4 lg:px-10 pb-12 space-y-6 mt-6">
          {/* Fila 1: KPI Cards con tendencias */}
          <section>
            <KPICards kpis={kpis} trends={kpiTrends} />
          </section>

          {/* Fila 2: Actividad 30d (2/3) + Rendimiento IA (1/3) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ActivityChart data={kpis.daily_activity || []} />
            </div>
            <div>
              <AIPerformanceCard performance={aiPerformance} />
            </div>
          </section>

          {/* Fila 3: Heatmap de Uso (1/2) + Top Preguntas (1/2) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UsageHeatmap data={usageHeatmap || []} />
            <TopQuestions questions={topQuestions || []} />
          </section>

          {/* Fila 4: Funnel (1/2) + Empresas (1/2) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FunnelChart data={kpis.funnel} />
            <CompanyBreakdown data={kpis.companies || []} />
          </section>

          {/* Fila 5: Engagement Donut (1/3) + Chat Logs (2/3) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <EngagementDonut users={userStats} />
            </div>
            <div className="lg:col-span-2">
              <ChatLogViewer logs={chatLogs || []} />
            </div>
          </section>

          {/* Fila 6: Tabla de Usuarios */}
          <section>
            <UserTable users={userStats} />
          </section>

          {/* Fila 7: Actividad Reciente */}
          <section>
            <RecentActivity activities={recentActivity} />
          </section>

          {/* Footer */}
          <div className="text-center pt-4 pb-2">
            <p className="text-slate-600 text-xs">
              Panel de Administración - Pro Smart Factories &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminGuard>
      <DashboardContent />
    </AdminGuard>
  );
}
