-- ============================================================================
-- FIX SCHEMA MIGRATION
-- Run this in Supabase SQL Editor to fix any schema issues
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ensure profiles table exists
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Ensure documents table exists with all columns
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS total_pages INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_method TEXT DEFAULT 'assistants';

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own documents" ON documents;
CREATE POLICY "Users can manage own documents" ON documents FOR ALL USING (auth.uid() = user_id);

-- 4. Ensure document_chunks table exists with all columns
CREATE TABLE IF NOT EXISTS document_chunks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  page_number INT DEFAULT 1,
  chunk_index INT,
  has_diagram BOOLEAN DEFAULT FALSE,
  diagram_description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page_number INT DEFAULT 1;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunk_index INT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS has_diagram BOOLEAN DEFAULT FALSE;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS diagram_description TEXT;

-- Create index for vector search if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'document_chunks_embedding_idx'
  ) THEN
    CREATE INDEX document_chunks_embedding_idx ON document_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Index might fail if not enough data, that's OK
  RAISE NOTICE 'Could not create IVF index, will use default: %', SQLERRM;
END $$;

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chunks" ON document_chunks;
CREATE POLICY "Users can view own chunks" ON document_chunks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chunks" ON document_chunks;
CREATE POLICY "Users can insert own chunks" ON document_chunks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own chunks" ON document_chunks;
CREATE POLICY "Users can delete own chunks" ON document_chunks FOR DELETE USING (auth.uid() = user_id);

-- 5. Ensure document_images table exists with all columns
CREATE TABLE IF NOT EXISTS document_images (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  page_number INT NOT NULL,
  image_url TEXT NOT NULL,
  context TEXT,
  embedding VECTOR(1536),
  ai_caption TEXT,
  image_type TEXT DEFAULT 'diagram',
  width INT,
  height INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add columns if they don't exist
ALTER TABLE document_images ADD COLUMN IF NOT EXISTS ai_caption TEXT;
ALTER TABLE document_images ADD COLUMN IF NOT EXISTS image_type TEXT DEFAULT 'diagram';
ALTER TABLE document_images ADD COLUMN IF NOT EXISTS width INT;
ALTER TABLE document_images ADD COLUMN IF NOT EXISTS height INT;

-- Create index for vector search if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'document_images_embedding_idx'
  ) THEN
    CREATE INDEX document_images_embedding_idx ON document_images
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create IVF index for images: %', SQLERRM;
END $$;

ALTER TABLE document_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own images" ON document_images;
CREATE POLICY "Users can view own images" ON document_images FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own images" ON document_images;
CREATE POLICY "Users can insert own images" ON document_images FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own images" ON document_images;
CREATE POLICY "Users can delete own images" ON document_images FOR DELETE USING (auth.uid() = user_id);

-- 6. Create/Update match_documents function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  page_number INT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    COALESCE(dc.page_number, 1) AS page_number,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.user_id = p_user_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Create/Update match_images function
CREATE OR REPLACE FUNCTION match_images(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  id BIGINT,
  image_url TEXT,
  context TEXT,
  page_number INT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.id,
    di.image_url,
    COALESCE(di.context, di.ai_caption, 'Imagen del documento') AS context,
    di.page_number,
    1 - (di.embedding <=> query_embedding) AS similarity
  FROM document_images di
  WHERE di.user_id = p_user_id
    AND di.embedding IS NOT NULL
    AND 1 - (di.embedding <=> query_embedding) > match_threshold
  ORDER BY di.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 8. Grant permissions
GRANT EXECUTE ON FUNCTION match_documents TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_images TO anon, authenticated, service_role;

-- 9. Create additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_images_user_id ON document_images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_document_id ON document_images(document_id);

-- 10. Verify everything is set up correctly
DO $$
DECLARE
  v_count INT;
BEGIN
  -- Check tables exist
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('profiles', 'documents', 'document_chunks', 'document_images');

  IF v_count = 4 THEN
    RAISE NOTICE 'All 4 tables exist correctly';
  ELSE
    RAISE WARNING 'Only % tables found, expected 4', v_count;
  END IF;

  -- Check functions exist
  SELECT COUNT(*) INTO v_count FROM pg_proc
  WHERE proname IN ('match_documents', 'match_images');

  IF v_count >= 2 THEN
    RAISE NOTICE 'RPC functions exist correctly';
  ELSE
    RAISE WARNING 'RPC functions missing';
  END IF;
END $$;
