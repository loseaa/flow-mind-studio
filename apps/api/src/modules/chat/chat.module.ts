import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";
import { LlmClient } from "./llm-client";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { McpModule } from "../mcp/mcp.module";

@Module({
  imports: [KnowledgeModule, McpModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, LlmClient]
})
export class ChatModule {}
