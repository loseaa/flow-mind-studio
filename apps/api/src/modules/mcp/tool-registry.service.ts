import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { McpRepository } from "./mcp.repository";

@Injectable()
export class ToolRegistryService {
  constructor(private readonly repository: McpRepository) {}
  async forModel(organizationId: string) {
    const tools = await this.repository.listRegistry(organizationId);
    return tools.map(tool => ({ type: "function" as const, function: { name: this.modelName(tool.serverId, tool.remoteName), description: tool.description ?? undefined, parameters: tool.inputSchema }, metadata: { toolId: tool.id } }));
  }
  async resolve(organizationId: string, modelName: string) {
    const tools = await this.repository.listRegistry(organizationId); return tools.find(tool => this.modelName(tool.serverId, tool.remoteName) === modelName) ?? null;
  }
  modelName(serverId: string, remoteName: string) { const serverKey=createHash("sha256").update(serverId).digest("hex").slice(0,8);return `mcp__${serverKey}__${remoteName.replace(/[^a-zA-Z0-9_]/g,"_")}`.slice(0,64); }
}
