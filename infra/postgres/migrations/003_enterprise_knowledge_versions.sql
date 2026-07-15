CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  file_content bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('uploaded', 'parsing', 'indexed', 'failed')),
  error_message text,
  embedding_model text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  page_number integer,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS rag_jobs (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('document.index', 'evaluation.run')),
  resource_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_traces (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  conversation_id text,
  question text NOT NULL,
  knowledge_base_ids text[] NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieval_latency_ms integer NOT NULL,
  answer_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_datasets (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_cases (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dataset_id text NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
  question text NOT NULL,
  reference_answer text NOT NULL,
  knowledge_base_ids text[] NOT NULL,
  evidence jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  dataset_id text NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  metrics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  run_id text NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  case_id text NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
  question text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer text NOT NULL,
  retrieved_expected_rank integer,
  groundedness double precision,
  answer_correctness double precision
);

ALTER TABLE evaluation_cases ADD COLUMN IF NOT EXISTS organization_id text;
UPDATE evaluation_cases c SET organization_id = d.organization_id
FROM evaluation_datasets d WHERE c.dataset_id = d.id AND c.organization_id IS NULL;
ALTER TABLE evaluation_cases ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS organization_id text;
UPDATE evaluation_results r SET organization_id = u.organization_id
FROM evaluation_runs u WHERE r.run_id = u.id AND r.organization_id IS NULL;
ALTER TABLE evaluation_results ALTER COLUMN organization_id SET NOT NULL;

DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'knowledge_chunks' AND column_name = 'embedding') <> 'vector' THEN
    ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536) USING embedding::text::vector(1536);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_document_versions (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  document_id text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('uploaded', 'indexing', 'ready', 'active', 'failed', 'archived')),
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  file_content bytea NOT NULL,
  content_hash text NOT NULL,
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  parser_version text,
  chunker_version text,
  embedding_model text,
  index_version text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,
  activated_at timestamptz,
  UNIQUE (document_id, version)
);

ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS active_version_id text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS latest_version integer NOT NULL DEFAULT 1;

INSERT INTO knowledge_document_versions
  (id, organization_id, document_id, version, status, mime_type, size_bytes, file_content, content_hash,
   chunk_count, parser_version, chunker_version, embedding_model, index_version, error_message, created_at, indexed_at, activated_at)
SELECT
  'ver_migrated_' || md5(d.id), d.organization_id, d.id, 1,
  CASE d.status WHEN 'indexed' THEN 'active' WHEN 'parsing' THEN 'indexing' WHEN 'failed' THEN 'failed' ELSE 'uploaded' END,
  d.mime_type, d.size_bytes, d.file_content, md5(encode(d.file_content, 'hex')),
  count(c.id)::integer, 'legacy', 'char-800-overlap-120', d.embedding_model,
  CASE WHEN d.status = 'indexed' THEN 'idx_migrated_' || md5(d.id) ELSE NULL END,
  d.error_message, d.uploaded_at, d.indexed_at, d.indexed_at
FROM knowledge_documents d
LEFT JOIN knowledge_chunks c ON c.document_id = d.id
GROUP BY d.id
ON CONFLICT (document_id, version) DO NOTHING;

UPDATE knowledge_documents d
SET active_version_id = v.id,
    latest_version = GREATEST(d.latest_version, v.version)
FROM knowledge_document_versions v
WHERE v.document_id = d.id AND v.status = 'active' AND d.active_version_id IS NULL;

DO $$ BEGIN
  ALTER TABLE knowledge_documents
    ADD CONSTRAINT fk_knowledge_documents_active_version
    FOREIGN KEY (active_version_id) REFERENCES knowledge_document_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS document_version_id text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS index_version text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

UPDATE knowledge_chunks c
SET document_version_id = v.id,
    index_version = COALESCE(v.index_version, 'idx_migrated_' || md5(v.document_id))
FROM knowledge_document_versions v
WHERE v.document_id = c.document_id AND v.version = 1 AND c.document_version_id IS NULL;

ALTER TABLE knowledge_chunks ALTER COLUMN document_version_id SET NOT NULL;
ALTER TABLE knowledge_chunks ALTER COLUMN index_version SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE knowledge_chunks
    ADD CONSTRAINT fk_knowledge_chunks_document_version
    FOREIGN KEY (document_version_id) REFERENCES knowledge_document_versions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_document_id_chunk_index_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_version_index
  ON knowledge_chunks (document_version_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_document
  ON knowledge_document_versions (organization_id, document_id, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_versions_active
  ON knowledge_document_versions (document_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_active_scope
  ON knowledge_chunks (organization_id, knowledge_base_id, document_version_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector
  ON knowledge_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_trgm
  ON knowledge_chunks USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_base
  ON knowledge_documents (organization_id, knowledge_base_id, uploaded_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chunks_scope
  ON knowledge_chunks (organization_id, knowledge_base_id, document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_resource
  ON rag_jobs (organization_id, resource_id, created_at DESC);

ALTER TABLE rag_traces ADD COLUMN IF NOT EXISTS retrieval_mode text NOT NULL DEFAULT 'hybrid';
ALTER TABLE rag_traces ADD COLUMN IF NOT EXISTS retrieval_debug jsonb;
ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS retrieval_mode text NOT NULL DEFAULT 'hybrid';

CREATE INDEX IF NOT EXISTS idx_rag_jobs_active_resource
  ON rag_jobs (organization_id, type, resource_id, created_at DESC)
  WHERE status IN ('queued', 'running');
