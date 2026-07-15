import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CredentialService } from "./credential.service";
import type { McpServerRecord } from "./mcp.types";

@Injectable()
export class McpClientService {
  private readonly allowPrivate: boolean; private readonly timeout: number;
  constructor(private readonly credentials: CredentialService, config: ConfigService) {
    this.allowPrivate = config.get<string>("MCP_ALLOW_PRIVATE_NETWORKS") === "true" || (config.get<string>("MCP_ALLOW_PRIVATE_NETWORKS") == null && config.get<string>("NODE_ENV") !== "production");
    this.timeout = Number(config.get<string>("MCP_CALL_TIMEOUT_MS") ?? 30000);
  }
  async withClient<T>(server: McpServerRecord, action: (client: Client) => Promise<T>): Promise<T> {
    this.validateEndpoint(server.endpoint);
    const auth = this.credentials.decrypt(server.encryptedCredentials); const headers = { ...(auth.headers ?? {}), ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) };
    const client = new Client({ name: "flowmind-studio", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(server.endpoint), { requestInit: { headers }, fetch: this.timedFetch.bind(this) });
    try { await client.connect(transport); return await action(client); } finally { await client.close().catch(() => undefined); }
  }
  async test(server: McpServerRecord) { return this.withClient(server, async client => ({ protocolVersion: client.getServerVersion()?.version, capabilities: client.getServerCapabilities() ?? {} })); }
  async listTools(server: McpServerRecord) { return this.withClient(server, client => client.listTools()); }
  async callTool(server: McpServerRecord, name: string, args: Record<string, unknown>) { return this.withClient(server, client => client.callTool({ name, arguments: args })); }
  hash(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
  private async timedFetch(input: string | URL | Request, init?: RequestInit) { const signal = AbortSignal.timeout(this.timeout); return fetch(input, { ...init, signal }); }
  private validateEndpoint(endpoint: string) {
    const url = new URL(endpoint); if (!['https:', 'http:'].includes(url.protocol)) throw new Error("MCP endpoint must use HTTP(S)");
    if (url.protocol !== 'https:' && !this.allowPrivate) throw new Error("MCP endpoint must use HTTPS");
    const host = url.hostname.toLowerCase(); const privateHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (privateHost && !this.allowPrivate) throw new Error("Private MCP endpoints are disabled");
  }
}
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`; return JSON.stringify(value); }
