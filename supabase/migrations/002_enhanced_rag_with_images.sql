-- ============================================================================
-- MIGRATION: Enhanced RAG with Images Support
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add new columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS original_filename TEXT,
ADD COLUMN IF NOT EXISTS total_pages INT,
ADD COLUMN IF NOT EXISTS processing_method TEXT DEFAULT 'assistants';

-- 2. Add new columns to document_chunks table
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS chunk_index INT,
ADD COLUMN IF NOT EXISTS has_diagram BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS diagram_description TEXT;

-- 3. Add new columns to document_images table (if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_images' AND column_name = 'ai_caption') THEN
    ALTER TABLE document_images ADD COLUMN ai_caption TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_images' AND column_name = 'image_type') THEN
    ALTER TABLE document_images ADD COLUMN image_type TEXT DEFAULT 'diagram';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_images' AND column_name = 'width') THEN
    ALTER TABLE document_images ADD COLUMN width INT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_images' AND column_name = 'height') THEN
    ALTER TABLE document_images ADD COLUMN height INT;
  END IF;
END $$;

-- 4. Update match_documents RPC function to include new fields
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
  has_diagram BOOLEAN,
  diagram_description TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.page_number,
    COALESCE(dc.has_diagram, FALSE) AS has_diagram,
    dc.diagram_description,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.user_id = p_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Update match_images RPC function to include new fields
CREATE OR REPLACE FUNCTION match_images(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  id BIGINT,
  image_url TEXT,
  ai_caption TEXT,
  image_type TEXT,
  page_number INT,
  context TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.id,
    di.image_url,
    COALESCE(di.ai_caption, di.context, 'Imagen del documento') AS ai_caption,
    COALESCE(di.image_type, 'diagram') AS image_type,
    di.page_number,
    di.context,
    1 - (di.embedding <=> query_embedding) AS similarity
  FROM document_images di
  WHERE di.user_id = p_user_id
    AND di.embedding IS NOT NULL
    AND 1 - (di.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Create index on new columns for better performance
CREATE INDEX IF NOT EXISTS idx_chunks_page_number ON document_chunks(page_number);
CREATE INDEX IF NOT EXISTS idx_images_page_number ON document_images(page_number);
CREATE INDEX IF NOT EXISTS idx_chunks_has_diagram ON document_chunks(has_diagram) WHERE has_diagram = TRUE;

-- 7. Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION match_documents TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_images TO anon, authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify the migration worked)
-- ============================================================================

-- Check documents table structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'documents';

-- Check document_chunks table structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'document_chunks';

-- Check document_images table structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'document_images';

-- Test match_documents function:
-- SELECT * FROM match_documents(
--   '[0.1, 0.2, ...]'::vector,  -- 1536-dimensional vector
--   0.3,
--   5,
--   'your-user-id'::uuid
-- );
