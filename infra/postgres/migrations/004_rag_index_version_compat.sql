-- Follow-up compatibility migration for databases that applied the first
-- document-version migration while it was under local development.
ALTER TABLE knowledge_document_versions
  DROP CONSTRAINT IF EXISTS knowledge_document_versions_document_id_content_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_version_index
  ON knowledge_chunks (document_version_id, chunk_index);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_versions_active
  ON knowledge_document_versions (document_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector
  ON knowledge_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_trgm
  ON knowledge_chunks USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE rag_traces ADD COLUMN IF NOT EXISTS retrieval_mode text NOT NULL DEFAULT 'hybrid';
ALTER TABLE rag_traces ADD COLUMN IF NOT EXISTS retrieval_debug jsonb;
ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS retrieval_mode text NOT NULL DEFAULT 'hybrid';
