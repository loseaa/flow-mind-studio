import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CredentialService } from "./credential.service";
import { McpClientService } from "./mcp-client.service";
import { McpRepository } from "./mcp.repository";

const ORG = "org_1", USER = "user_1";
@Injectable()
export class McpService {
  constructor(private readonly repo: McpRepository, private readonly credentials: CredentialService, private readonly client: McpClientService) {}
  listServers() { return this.repo.listServers(ORG).then(items => Promise.all(items.map(async s => ({ ...publicServer(s), tools: await this.repo.listTools(s.id) })))); }
  async getServer(id: string) { const server = await this.repo.getServer(id, ORG); if (!server) throw new NotFoundException("MCP server not found"); return { ...publicServer(server), tools: await this.repo.listTools(id) }; }
  async create(input: { name: string; description?: string; endpoint: string; authType?: "none"|"bearer"|"headers"; credentials?: { token?: string; headers?: Record<string,string> } }) {
    if (!input.name?.trim() || !input.endpoint) throw new BadRequestException("name and endpoint are required");
    const server = await this.repo.createServer({ organizationId: ORG, name: input.name.trim(), description: input.description, endpoint: input.endpoint, authType: input.authType ?? "none", encryptedCredentials: this.credentials.encrypt(input.credentials), createdBy: USER });
    try { await this.test(server.id); await this.sync(server.id); } catch { /* keep failed configuration for diagnosis */ }
    return this.getServer(server.id);
  }
  async update(id: string, input: { name?: string; description?: string; endpoint?: string; authType?: "none"|"bearer"|"headers"; credentials?: { token?: string; headers?: Record<string,string> }; enabled?: boolean }) { const updated = await this.repo.updateServer(id, ORG, { ...input, encryptedCredentials: input.credentials === undefined ? undefined : this.credentials.encrypt(input.credentials) }); if (!updated) throw new NotFoundException("MCP server not found"); return publicServer(updated); }
  async remove(id: string) { await this.repo.deleteServer(id, ORG); return { ok: true }; }
  async test(id: string) { const server = await this.requireServer(id); try { const result = await this.client.test(server); await this.repo.setHealth(id, true, result); return { ok: true, ...result }; } catch (error) { await this.repo.setHealth(id, false, { code: "MCP_CONNECTION_FAILED", message: errorMessage(error) }); throw new BadRequestException(errorMessage(error)); } }
  async sync(id: string) { const server = await this.requireServer(id); try { const response = await this.client.listTools(server); const tools = response.tools.map(tool => { const risk = inferRisk(tool.name, tool.annotations as Record<string,unknown>|undefined); return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, annotations: tool.annotations, hash: this.client.hash({ input: tool.inputSchema, output: tool.outputSchema }), risk, confirm: risk !== "low" }; }); await this.repo.syncTools(id, tools); await this.repo.setHealth(id, true); return { tools: await this.repo.listTools(id) }; } catch (error) { await this.repo.setHealth(id, false, { code: "MCP_SYNC_FAILED", message: errorMessage(error) }); throw new BadRequestException(errorMessage(error)); } }
  listInvocations() { return this.repo.dbService().query("SELECT * FROM mcp_invocations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200", [ORG]).then(r=>r.rows); }
  async invocation(id: string) { const result = await this.repo.dbService().query("SELECT * FROM mcp_invocations WHERE id=$1 AND organization_id=$2", [id, ORG]); if (!result.rows[0]) throw new NotFoundException(); const events = await this.repo.dbService().query("SELECT * FROM mcp_invocation_events WHERE invocation_id=$1 ORDER BY created_at", [id]); return { ...(result.rows[0] as object), events: events.rows }; }
  listTools(id: string) { return this.requireServer(id).then(() => this.repo.listTools(id)); }
  async updateTool(id: string, patch: { enabled?: boolean; riskLevel?: "low"|"medium"|"high"; requiresConfirmation?: boolean }) { const tool = await this.repo.updateTool(id, ORG, patch); if (!tool) throw new NotFoundException(); return tool; }
  private async requireServer(id: string) { const server = await this.repo.getServer(id, ORG); if (!server) throw new NotFoundException("MCP server not found"); return server; }
}
function publicServer<T extends { encryptedCredentials: string|null }>(server: T) { const { encryptedCredentials, ...safe } = server; return { ...safe, hasCredentials: Boolean(encryptedCredentials) }; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function inferRisk(name: string, annotations?: Record<string,unknown>): "low"|"medium"|"high" { if (annotations?.readOnlyHint === true) return "low"; if (annotations?.destructiveHint === true || /delete|remove|destroy|pay|transfer/i.test(name)) return "high"; if (/get|list|search|read|find|query/i.test(name)) return "low"; return "medium"; }
