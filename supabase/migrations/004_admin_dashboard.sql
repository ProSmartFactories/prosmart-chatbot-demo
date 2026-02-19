-- ============================================================================
-- ADMIN DASHBOARD MIGRATION
-- Creates admin infrastructure: admin_users, user_sessions, chat_interactions
-- Plus RPC functions for admin analytics
-- ============================================================================

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read admin_users" ON admin_users;
CREATE POLICY "Admins can read admin_users" ON admin_users
  FOR SELECT USING (auth.uid() = id);

-- 2. User Sessions Table (tracks every login for analytics)
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON user_sessions(started_at);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own sessions
DROP POLICY IF EXISTS "Users can insert own sessions" ON user_sessions;
CREATE POLICY "Users can insert own sessions" ON user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions (for ending sessions)
DROP POLICY IF EXISTS "Users can update own sessions" ON user_sessions;
CREATE POLICY "Users can update own sessions" ON user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can read all sessions
DROP POLICY IF EXISTS "Admins can read all sessions" ON user_sessions;
CREATE POLICY "Admins can read all sessions" ON user_sessions
  FOR SELECT USING (auth.uid() IN (SELECT id FROM admin_users));

-- 3. Chat Interactions Table (logs every chat message for analytics)
CREATE TABLE IF NOT EXISTS chat_interactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  message_text TEXT NOT NULL,
  response_text TEXT,
  chunks_used INT DEFAULT 0,
  images_returned INT DEFAULT 0,
  response_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON chat_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON chat_interactions(created_at);

ALTER TABLE chat_interactions ENABLE ROW LEVEL SECURITY;

-- Admins can read all interactions
DROP POLICY IF EXISTS "Admins can read interactions" ON chat_interactions;
CREATE POLICY "Admins can read interactions" ON chat_interactions
  FOR SELECT USING (auth.uid() IN (SELECT id FROM admin_users));

-- Service role can insert (from edge functions)
DROP POLICY IF EXISTS "Service can insert interactions" ON chat_interactions;
CREATE POLICY "Service can insert interactions" ON chat_interactions
  FOR INSERT WITH CHECK (true);

-- 4. RPC Function: Get Admin User Stats
CREATE OR REPLACE FUNCTION get_admin_user_stats()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  company TEXT,
  registered_at TIMESTAMPTZ,
  login_count BIGINT,
  total_interaction_time_seconds BIGINT,
  total_messages BIGINT,
  last_active TIMESTAMPTZ,
  has_document BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::TEXT,
    COALESCE(p.name, 'Sin perfil')::TEXT AS name,
    COALESCE(p.company, 'N/A')::TEXT AS company,
    au.created_at AS registered_at,
    COALESCE((SELECT COUNT(*) FROM user_sessions us WHERE us.user_id = au.id), 0)::BIGINT AS login_count,
    COALESCE((SELECT SUM(us.duration_seconds) FROM user_sessions us WHERE us.user_id = au.id), 0)::BIGINT AS total_interaction_time_seconds,
    COALESCE((SELECT COUNT(*) FROM chat_interactions ci WHERE ci.user_id = au.id), 0)::BIGINT AS total_messages,
    COALESCE(
      GREATEST(
        (SELECT MAX(us.started_at) FROM user_sessions us WHERE us.user_id = au.id),
        (SELECT MAX(ci.created_at) FROM chat_interactions ci WHERE ci.user_id = au.id)
      ),
      au.created_at
    ) AS last_active,
    EXISTS(SELECT 1 FROM documents d WHERE d.user_id = au.id AND d.processed = true) AS has_document
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  ORDER BY au.created_at DESC;
END;
$$;

-- 5. RPC Function: Get Admin KPIs
CREATE OR REPLACE FUNCTION get_admin_kpis()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM auth.users),
    'active_users_7d', (SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE started_at > NOW() - INTERVAL '7 days'),
    'active_users_30d', (SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE started_at > NOW() - INTERVAL '30 days'),
    'new_users_7d', (SELECT COUNT(*) FROM auth.users WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM auth.users WHERE created_at > NOW() - INTERVAL '30 days'),
    'total_conversations', (SELECT COUNT(*) FROM chat_interactions),
    'conversations_7d', (SELECT COUNT(*) FROM chat_interactions WHERE created_at > NOW() - INTERVAL '7 days'),
    'total_documents', (SELECT COUNT(*) FROM documents WHERE processed = true),
    'avg_messages_per_user', COALESCE((SELECT ROUND(AVG(cnt)::numeric, 1) FROM (SELECT COUNT(*) cnt FROM chat_interactions GROUP BY user_id) sub), 0),
    'avg_session_duration_seconds', COALESCE((SELECT ROUND(AVG(duration_seconds)::numeric) FROM user_sessions WHERE duration_seconds IS NOT NULL AND duration_seconds > 0), 0),
    'avg_response_time_ms', COALESCE((SELECT ROUND(AVG(response_time_ms)::numeric) FROM chat_interactions WHERE response_time_ms IS NOT NULL AND response_time_ms > 0), 0),
    'total_chunks', (SELECT COUNT(*) FROM document_chunks),
    'total_images_extracted', (SELECT COUNT(*) FROM document_images),
    'companies', COALESCE(
      (SELECT json_agg(row_to_json(sub)) FROM (
        SELECT company, COUNT(*)::INT AS count
        FROM profiles
        WHERE company IS NOT NULL AND company != ''
        GROUP BY company
        ORDER BY count DESC
        LIMIT 10
      ) sub),
      '[]'::json
    ),
    'daily_activity', COALESCE(
      (SELECT json_agg(row_to_json(sub) ORDER BY sub.date) FROM (
        SELECT
          d::DATE AS date,
          COALESCE(sl.login_count, 0)::INT AS logins,
          COALESCE(sm.msg_count, 0)::INT AS messages
        FROM generate_series(
          (NOW() - INTERVAL '30 days')::DATE,
          NOW()::DATE,
          '1 day'::INTERVAL
        ) AS d
        LEFT JOIN (
          SELECT DATE(started_at) AS sd, COUNT(*)::INT AS login_count
          FROM user_sessions
          WHERE started_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE(started_at)
        ) sl ON d::DATE = sl.sd
        LEFT JOIN (
          SELECT DATE(created_at) AS cd, COUNT(*)::INT AS msg_count
          FROM chat_interactions
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at)
        ) sm ON d::DATE = sm.cd
      ) sub),
      '[]'::json
    ),
    'funnel', json_build_object(
      'registered', (SELECT COUNT(*) FROM auth.users),
      'completed_profile', (SELECT COUNT(*) FROM profiles),
      'uploaded_pdf', (SELECT COUNT(DISTINCT user_id) FROM documents WHERE processed = true),
      'sent_first_message', (SELECT COUNT(DISTINCT user_id) FROM chat_interactions)
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION get_admin_user_stats TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_kpis TO authenticated, service_role;

-- 7. Verify setup
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('admin_users', 'user_sessions', 'chat_interactions');

  IF v_count = 3 THEN
    RAISE NOTICE 'Admin dashboard: All 3 new tables created successfully';
  ELSE
    RAISE WARNING 'Admin dashboard: Only % of 3 tables found', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM pg_proc
  WHERE proname IN ('get_admin_user_stats', 'get_admin_kpis');

  IF v_count >= 2 THEN
    RAISE NOTICE 'Admin dashboard: RPC functions created successfully';
  ELSE
    RAISE WARNING 'Admin dashboard: RPC functions missing';
  END IF;
END $$;
