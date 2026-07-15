CREATE TABLE IF NOT EXISTS chat_conversations (
  id text PRIMARY KEY, organization_id text NOT NULL, title text NOT NULL, model text NOT NULL,
  knowledge_base_ids text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')), content text NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb, citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL,
  description text,
  transport text NOT NULL DEFAULT 'streamable_http' CHECK (transport = 'streamable_http'),
  endpoint text NOT NULL,
  auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'headers')),
  encrypted_credentials text,
  enabled boolean NOT NULL DEFAULT true,
  health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown', 'online', 'offline', 'error')),
  protocol_version text,
  server_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_checked_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcp_servers_org_name ON mcp_servers (organization_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcp_servers_health ON mcp_servers (organization_id, enabled, health_status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS mcp_tools (
  id text PRIMARY KEY,
  server_id text NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  remote_name text NOT NULL,
  display_name text,
  description text,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb,
  annotations jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'missing', 'invalid')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_source text NOT NULL DEFAULT 'inferred' CHECK (risk_source IN ('inferred', 'manual')),
  requires_confirmation boolean NOT NULL DEFAULT true,
  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, remote_name)
);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_registry ON mcp_tools (server_id, enabled, availability);

CREATE TABLE IF NOT EXISTS mcp_invocations (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  server_id text NOT NULL REFERENCES mcp_servers(id),
  tool_id text NOT NULL REFERENCES mcp_tools(id),
  source text NOT NULL CHECK (source IN ('chat', 'lowcode', 'design_agent', 'api')),
  conversation_id text REFERENCES chat_conversations(id) ON DELETE SET NULL,
  request_message_id text REFERENCES chat_messages(id) ON DELETE SET NULL,
  assistant_message_id text REFERENCES chat_messages(id) ON DELETE SET NULL,
  requested_by text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'pending_confirmation', 'running', 'succeeded', 'failed', 'rejected', 'expired')),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  requires_confirmation boolean NOT NULL,
  tool_name_snapshot text NOT NULL,
  schema_hash_snapshot text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  output_preview jsonb,
  error_code text,
  error_message text,
  idempotency_key text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_mcp_invocations_org_created ON mcp_invocations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_invocations_conversation ON mcp_invocations (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_mcp_invocations_pending ON mcp_invocations (organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS mcp_invocation_events (
  id bigserial PRIMARY KEY,
  invocation_id text NOT NULL REFERENCES mcp_invocations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system', 'agent')),
  actor_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_invocation_events_timeline ON mcp_invocation_events (invocation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS chat_tool_continuations (
  id text PRIMARY KEY,
  invocation_id text NOT NULL UNIQUE REFERENCES mcp_invocations(id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  model text NOT NULL,
  messages jsonb NOT NULL,
  remaining_tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'resumed', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_tool_continuations_waiting ON chat_tool_continuations (status, expires_at);
