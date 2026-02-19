import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Extract user token - prefer x-user-token custom header (bypasses gateway ES256 issue),
    // fallback to Authorization header for backward compatibility
    const userToken = req.headers.get("x-user-token") || req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!userToken) {
      return new Response(
        JSON.stringify({ error: "No authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with service role for admin queries
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authenticated user using their token
    const token = userToken;
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin stats request from: ${user.email}`);

    // Verify admin status
    const { data: adminRecord, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (adminError || !adminRecord) {
      console.warn(`Unauthorized admin access attempt: ${user.email}`);
      return new Response(
        JSON.stringify({ error: "Forbidden: not an admin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin verified: ${adminRecord.email} (${adminRecord.role})`);

    // Fetch KPIs
    const { data: kpis, error: kpisError } = await supabaseAdmin.rpc("get_admin_kpis");
    if (kpisError) {
      console.error("Error fetching KPIs:", kpisError);
      throw new Error(`KPIs error: ${kpisError.message}`);
    }

    // Fetch user stats
    const { data: userStats, error: statsError } = await supabaseAdmin.rpc("get_admin_user_stats");
    if (statsError) {
      console.error("Error fetching user stats:", statsError);
      throw new Error(`User stats error: ${statsError.message}`);
    }

    // Fetch recent activity (last 20 events)
    const { data: recentSessions } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id, started_at")
      .order("started_at", { ascending: false })
      .limit(10);

    const { data: recentMessages } = await supabaseAdmin
      .from("chat_interactions")
      .select("user_id, message_text, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    // Merge and sort recent activity
    const recentActivity = [
      ...(recentSessions || []).map((s: { user_id: string; started_at: string }) => ({
        type: "login" as const,
        user_id: s.user_id,
        timestamp: s.started_at,
        detail: "Inició sesión",
      })),
      ...(recentMessages || []).map((m: { user_id: string; message_text: string; created_at: string }) => ({
        type: "message" as const,
        user_id: m.user_id,
        timestamp: m.created_at,
        detail: m.message_text?.slice(0, 80) || "Envió un mensaje",
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);

    // Enrich recent activity with user names
    const userIds = [...new Set(recentActivity.map((a) => a.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, name, company")
      .in("id", userIds);

    const profileMap = new Map(
      (profiles || []).map((p: { id: string; name: string; company: string }) => [p.id, p])
    );

    const enrichedActivity = recentActivity.map((a) => {
      const profile = profileMap.get(a.user_id);
      return {
        ...a,
        user_name: profile?.name || "Usuario",
        user_company: profile?.company || "N/A",
      };
    });

    // ========================================================================
    // CHAT LOGS - Last 50 conversations with profile enrichment
    // ========================================================================
    const { data: rawChatLogs } = await supabaseAdmin
      .from("chat_interactions")
      .select("id, user_id, message_text, response_text, chunks_used, images_returned, response_time_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const chatLogUserIds = [...new Set((rawChatLogs || []).map((c: { user_id: string }) => c.user_id))];
    const { data: chatProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, name, company")
      .in("id", chatLogUserIds.length > 0 ? chatLogUserIds : ["00000000-0000-0000-0000-000000000000"]);

    const chatProfileMap = new Map(
      (chatProfiles || []).map((p: { id: string; name: string; company: string }) => [p.id, p])
    );

    const chatLogs = (rawChatLogs || []).map((c: {
      id: number; user_id: string; message_text: string; response_text: string;
      chunks_used: number; images_returned: number; response_time_ms: number; created_at: string;
    }) => {
      const prof = chatProfileMap.get(c.user_id);
      return {
        id: c.id,
        user_id: c.user_id,
        user_name: prof?.name || "Usuario",
        user_company: prof?.company || "N/A",
        message_text: c.message_text,
        response_text: c.response_text,
        chunks_used: c.chunks_used || 0,
        images_returned: c.images_returned || 0,
        response_time_ms: c.response_time_ms || 0,
        created_at: c.created_at,
      };
    });

    // ========================================================================
    // TOP QUESTIONS - Top 10 most frequent questions
    // ========================================================================
    const { data: allMessages } = await supabaseAdmin
      .from("chat_interactions")
      .select("message_text")
      .not("message_text", "is", null);

    // Normalize and group questions client-side (Supabase doesn't support GROUP BY directly)
    const questionCounts = new Map<string, number>();
    for (const msg of (allMessages || [])) {
      const normalized = (msg.message_text || "")
        .trim()
        .toLowerCase()
        .replace(/[¿?]/g, "")
        .slice(0, 100);
      if (normalized.length < 5) continue;
      questionCounts.set(normalized, (questionCounts.get(normalized) || 0) + 1);
    }

    const topQuestions = [...questionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([question, count]) => ({ question, count }));

    // ========================================================================
    // USAGE HEATMAP - Messages by day of week + hour
    // ========================================================================
    const { data: allTimestamps } = await supabaseAdmin
      .from("chat_interactions")
      .select("created_at");

    const heatmapMap = new Map<string, number>();
    for (const row of (allTimestamps || [])) {
      const d = new Date(row.created_at);
      const dow = d.getUTCDay(); // 0=Sunday
      const hour = d.getUTCHours();
      const key = `${dow}-${hour}`;
      heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
    }

    const usageHeatmap = [...heatmapMap.entries()].map(([key, count]) => {
      const [dow, hour] = key.split("-").map(Number);
      return { day_of_week: dow, hour, count };
    });

    // ========================================================================
    // AI PERFORMANCE - Response time distribution and metrics
    // ========================================================================
    const { data: perfData } = await supabaseAdmin
      .from("chat_interactions")
      .select("response_time_ms, chunks_used, images_returned, created_at");

    const perfRows = perfData || [];
    const totalInteractions = perfRows.length;

    let sumResponseTime = 0;
    let sumChunks = 0;
    let withImages = 0;
    let fast = 0, medium = 0, slow = 0, very_slow = 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    let sumThis7d = 0, countThis7d = 0;
    let sumPrev7d = 0, countPrev7d = 0;

    for (const row of perfRows) {
      const rt = row.response_time_ms || 0;
      sumResponseTime += rt;
      sumChunks += (row.chunks_used || 0);
      if ((row.images_returned || 0) > 0) withImages++;

      if (rt < 2000) fast++;
      else if (rt < 5000) medium++;
      else if (rt < 10000) slow++;
      else very_slow++;

      const created = new Date(row.created_at);
      if (created >= sevenDaysAgo) {
        sumThis7d += rt;
        countThis7d++;
      } else if (created >= fourteenDaysAgo) {
        sumPrev7d += rt;
        countPrev7d++;
      }
    }

    const avgThis7d = countThis7d > 0 ? sumThis7d / countThis7d : 0;
    const avgPrev7d = countPrev7d > 0 ? sumPrev7d / countPrev7d : 0;
    const trend7d = avgPrev7d > 0 ? ((avgThis7d - avgPrev7d) / avgPrev7d) * 100 : 0;

    const aiPerformance = {
      avg_response_time_ms: totalInteractions > 0 ? Math.round(sumResponseTime / totalInteractions) : 0,
      total_interactions: totalInteractions,
      fast,
      medium,
      slow,
      very_slow,
      avg_chunks_per_response: totalInteractions > 0 ? Math.round((sumChunks / totalInteractions) * 10) / 10 : 0,
      image_delivery_rate: totalInteractions > 0 ? Math.round((withImages / totalInteractions) * 100) : 0,
      trend_7d: Math.round(trend7d * 10) / 10,
    };

    // ========================================================================
    // KPI TRENDS - This week vs last week comparisons
    // ========================================================================
    const thisWeekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const lastWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString();

    // Users trend
    const { count: newUsersThisWeek } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thisWeekStart);

    const { count: newUsersLastWeek } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", lastWeekStart)
      .lt("created_at", thisWeekStart);

    // Messages trend
    const { count: msgsThisWeek } = await supabaseAdmin
      .from("chat_interactions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thisWeekStart);

    const { count: msgsLastWeek } = await supabaseAdmin
      .from("chat_interactions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", lastWeekStart)
      .lt("created_at", thisWeekStart);

    // Sessions trend
    const { count: sessionsThisWeek } = await supabaseAdmin
      .from("user_sessions")
      .select("*", { count: "exact", head: true })
      .gte("started_at", thisWeekStart);

    const { count: sessionsLastWeek } = await supabaseAdmin
      .from("user_sessions")
      .select("*", { count: "exact", head: true })
      .gte("started_at", lastWeekStart)
      .lt("started_at", thisWeekStart);

    const calcTrend = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const kpiTrends = {
      users_trend: calcTrend(newUsersThisWeek || 0, newUsersLastWeek || 0),
      messages_trend: calcTrend(msgsThisWeek || 0, msgsLastWeek || 0),
      sessions_trend: calcTrend(sessionsThisWeek || 0, sessionsLastWeek || 0),
      response_time_trend: Math.round(trend7d * 10) / 10,
    };

    return new Response(
      JSON.stringify({
        kpis,
        userStats,
        recentActivity: enrichedActivity,
        chatLogs,
        topQuestions,
        usageHeatmap,
        aiPerformance,
        kpiTrends,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in admin-stats:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
