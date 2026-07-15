CREATE TABLE IF NOT EXISTS lowcode_design_documents (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL,
  draft_document jsonb NOT NULL,
  draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
  published_document jsonb,
  published_revision integer,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lowcode_documents_org_updated
  ON lowcode_design_documents (organization_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS data_sources (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('postgresql')),
  host text NOT NULL,
  port integer NOT NULL CHECK (port > 0 AND port <= 65535),
  database_name text NOT NULL,
  username text NOT NULL,
  ssl_mode text NOT NULL DEFAULT 'require' CHECK (ssl_mode IN ('disable', 'prefer', 'require', 'verify-full')),
  encrypted_credentials text,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'online', 'error')),
  last_checked_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_sources_org_name
  ON data_sources (organization_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS data_source_schema_snapshots (
  id bigserial PRIMARY KEY,
  data_source_id text NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  schema_hash text NOT NULL,
  schema_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_source_schema_latest
  ON data_source_schema_snapshots (data_source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_queries (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  page_id text NOT NULL,
  data_source_id text NOT NULL REFERENCES data_sources(id),
  query_key text NOT NULL,
  name text NOT NULL,
  statement text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('pageLoad', 'manual')),
  timeout_ms integer NOT NULL DEFAULT 5000 CHECK (timeout_ms BETWEEN 100 AND 30000),
  max_rows integer NOT NULL DEFAULT 100 CHECK (max_rows BETWEEN 1 AND 1000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, page_id, query_key)
);
CREATE INDEX IF NOT EXISTS idx_data_queries_page
  ON data_queries (organization_id, page_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS data_query_execution_logs (
  id bigserial PRIMARY KEY,
  organization_id text NOT NULL,
  query_id text NOT NULL REFERENCES data_queries(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  duration_ms integer NOT NULL,
  row_count integer,
  error_code text,
  error_message text,
  executed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_query_logs_query_created
  ON data_query_execution_logs (query_id, created_at DESC);
