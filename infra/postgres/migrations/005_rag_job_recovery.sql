ALTER TABLE rag_jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE rag_jobs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);

CREATE INDEX IF NOT EXISTS idx_rag_jobs_stale_running
  ON rag_jobs (heartbeat_at) WHERE status = 'running';
