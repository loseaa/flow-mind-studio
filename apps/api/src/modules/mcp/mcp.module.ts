import { Module } from "@nestjs/common";
import { McpController } from "./mcp.controller";
import { CredentialService } from "./credential.service";
import { McpClientService } from "./mcp-client.service";
import { McpRepository } from "./mcp.repository";
import { McpService } from "./mcp.service";
import { ToolRegistryService } from "./tool-registry.service";
import { ToolExecutorService } from "./tool-executor.service";

@Module({ controllers: [McpController], providers: [CredentialService, McpClientService, McpRepository, McpService, ToolRegistryService, ToolExecutorService], exports: [McpRepository, McpClientService, ToolRegistryService, ToolExecutorService] })
export class McpModule {}
