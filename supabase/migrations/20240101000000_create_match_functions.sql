-- Add page_number column to document_chunks if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_chunks' AND column_name = 'page_number'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN page_number int DEFAULT 1;
  END IF;
END $$;

-- Function to match document chunks by embedding similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id bigint,
  content text,
  page_number int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.page_number,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE dc.user_id = p_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to match document images by embedding similarity
CREATE OR REPLACE FUNCTION match_images(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id bigint,
  image_url text,
  context text,
  page_number int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.id,
    di.image_url,
    di.context,
    di.page_number,
    1 - (di.embedding <=> query_embedding) as similarity
  FROM document_images di
  WHERE di.user_id = p_user_id
    AND 1 - (di.embedding <=> query_embedding) > match_threshold
  ORDER BY di.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
