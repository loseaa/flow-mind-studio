import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import type { McpServerRecord, McpToolRecord } from "./mcp.types";

const SERVER_COLUMNS = `id, organization_id AS "organizationId", name, description, transport, endpoint, auth_type AS "authType", encrypted_credentials AS "encryptedCredentials", enabled, health_status AS "healthStatus", protocol_version AS "protocolVersion", server_capabilities AS "serverCapabilities", last_synced_at AS "lastSyncedAt", last_checked_at AS "lastCheckedAt", last_error_code AS "lastErrorCode", last_error_message AS "lastErrorMessage", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`;
const TOOL_COLUMNS = `id, server_id AS "serverId", remote_name AS "remoteName", display_name AS "displayName", description, input_schema AS "inputSchema", output_schema AS "outputSchema", annotations, schema_hash AS "schemaHash", enabled, availability, risk_level AS "riskLevel", risk_source AS "riskSource", requires_confirmation AS "requiresConfirmation"`;

@Injectable()
export class McpRepository {
  constructor(private readonly db: DatabaseService) {}
  async createServer(input: { organizationId: string; name: string; description?: string; endpoint: string; authType: string; encryptedCredentials: string | null; createdBy: string }) {
    const result = await this.db.query<McpServerRecord>(`INSERT INTO mcp_servers (id,organization_id,name,description,endpoint,auth_type,encrypted_credentials,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${SERVER_COLUMNS}`,
      [`mcp_srv_${randomUUID()}`, input.organizationId, input.name, input.description ?? null, input.endpoint, input.authType, input.encryptedCredentials, input.createdBy]);
    return result.rows[0];
  }
  async listServers(org: string) { return (await this.db.query<McpServerRecord>(`SELECT ${SERVER_COLUMNS} FROM mcp_servers WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, [org])).rows; }
  async getServer(id: string, org: string) { return (await this.db.query<McpServerRecord>(`SELECT ${SERVER_COLUMNS} FROM mcp_servers WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [id, org])).rows[0] ?? null; }
  async updateServer(id: string, org: string, patch: { name?: string; description?: string; endpoint?: string; authType?: string; encryptedCredentials?: string | null; enabled?: boolean }) {
    const current = await this.getServer(id, org); if (!current) return null;
    const result = await this.db.query<McpServerRecord>(`UPDATE mcp_servers SET name=$3,description=$4,endpoint=$5,auth_type=$6,encrypted_credentials=$7,enabled=$8,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING ${SERVER_COLUMNS}`,
      [id, org, patch.name ?? current.name, patch.description ?? current.description, patch.endpoint ?? current.endpoint, patch.authType ?? current.authType, patch.encryptedCredentials === undefined ? current.encryptedCredentials : patch.encryptedCredentials, patch.enabled ?? current.enabled]);
    return result.rows[0];
  }
  async deleteServer(id: string, org: string) { await this.db.query("UPDATE mcp_servers SET deleted_at=now(),enabled=false,updated_at=now() WHERE id=$1 AND organization_id=$2", [id, org]); }
  async setHealth(id: string, ok: boolean, detail: { protocolVersion?: string; capabilities?: unknown; code?: string; message?: string } = {}) {
    await this.db.query(`UPDATE mcp_servers SET health_status=$2,last_checked_at=now(),protocol_version=COALESCE($3,protocol_version),server_capabilities=COALESCE($4,server_capabilities),last_error_code=$5,last_error_message=$6,updated_at=now() WHERE id=$1`, [id, ok ? "online" : "error", detail.protocolVersion ?? null, detail.capabilities ? JSON.stringify(detail.capabilities) : null, detail.code ?? null, detail.message?.slice(0, 1000) ?? null]);
  }
  async listTools(serverId: string) { return (await this.db.query<McpToolRecord>(`SELECT ${TOOL_COLUMNS} FROM mcp_tools WHERE server_id=$1 ORDER BY remote_name`, [serverId])).rows; }
  async listRegistry(org: string) { return (await this.db.query<McpToolRecord & { serverName: string }>(`SELECT t.id, t.server_id AS "serverId", t.remote_name AS "remoteName", t.display_name AS "displayName", t.description, t.input_schema AS "inputSchema", t.output_schema AS "outputSchema", t.annotations, t.schema_hash AS "schemaHash", t.enabled, t.availability, t.risk_level AS "riskLevel", t.risk_source AS "riskSource", t.requires_confirmation AS "requiresConfirmation", s.name AS "serverName" FROM mcp_tools t JOIN mcp_servers s ON s.id=t.server_id WHERE s.organization_id=$1 AND s.deleted_at IS NULL AND s.enabled AND s.health_status='online' AND t.enabled AND t.availability='available'`, [org])).rows; }
  async getTool(id: string, org: string) { return (await this.db.query<McpToolRecord & { server: McpServerRecord }>(`SELECT t.id, t.server_id AS "serverId", t.remote_name AS "remoteName", t.display_name AS "displayName", t.description, t.input_schema AS "inputSchema", t.output_schema AS "outputSchema", t.annotations, t.schema_hash AS "schemaHash", t.enabled, t.availability, t.risk_level AS "riskLevel", t.risk_source AS "riskSource", t.requires_confirmation AS "requiresConfirmation", row_to_json(s.*) AS server FROM mcp_tools t JOIN mcp_servers s ON s.id=t.server_id WHERE t.id=$1 AND s.organization_id=$2 AND s.deleted_at IS NULL`, [id, org])).rows[0] ?? null; }
  async updateTool(id: string, org: string, patch: { enabled?: boolean; riskLevel?: string; requiresConfirmation?: boolean }) {
    const result = await this.db.query<McpToolRecord>(`UPDATE mcp_tools t SET enabled=COALESCE($3,enabled),risk_level=COALESCE($4,risk_level),risk_source=CASE WHEN $4 IS NULL THEN risk_source ELSE 'manual' END,requires_confirmation=COALESCE($5,requires_confirmation),updated_at=now() FROM mcp_servers s WHERE t.id=$1 AND s.id=t.server_id AND s.organization_id=$2 RETURNING ${TOOL_COLUMNS.replace(/^id,/, 't.id,')}`, [id, org, patch.enabled ?? null, patch.riskLevel ?? null, patch.requiresConfirmation ?? null]); return result.rows[0] ?? null;
  }
  async syncTools(serverId: string, tools: Array<{ name: string; description?: string; inputSchema: unknown; outputSchema?: unknown; annotations?: unknown; hash: string; risk: "low"|"medium"|"high"; confirm: boolean }>) {
    const names = tools.map(t => t.name); await this.db.query("UPDATE mcp_tools SET availability='missing',updated_at=now() WHERE server_id=$1 AND NOT (remote_name = ANY($2::text[]))", [serverId, names]);
    for (const tool of tools) await this.db.query(`INSERT INTO mcp_tools (id,server_id,remote_name,display_name,description,input_schema,output_schema,annotations,schema_hash,risk_level,requires_confirmation) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (server_id,remote_name) DO UPDATE SET description=EXCLUDED.description,input_schema=EXCLUDED.input_schema,output_schema=EXCLUDED.output_schema,annotations=EXCLUDED.annotations,schema_hash=EXCLUDED.schema_hash,availability='available',risk_level=CASE WHEN mcp_tools.risk_source='manual' THEN mcp_tools.risk_level ELSE EXCLUDED.risk_level END,requires_confirmation=CASE WHEN mcp_tools.risk_source='manual' THEN mcp_tools.requires_confirmation ELSE EXCLUDED.requires_confirmation END,last_discovered_at=now(),updated_at=now()`, [`mcp_tool_${randomUUID()}`,serverId,tool.name,tool.description??null,JSON.stringify(tool.inputSchema),tool.outputSchema?JSON.stringify(tool.outputSchema):null,JSON.stringify(tool.annotations??{}),tool.hash,tool.risk,tool.confirm]);
    await this.db.query("UPDATE mcp_servers SET last_synced_at=now(),updated_at=now() WHERE id=$1", [serverId]);
  }
  dbService() { return this.db; }
}
