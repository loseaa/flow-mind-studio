import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import type { ChatStreamEvent } from "@flowmind/shared";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get("conversations")
  conversations() {
    return this.chatService.listConversations();
  }

  @Post("conversations")
  createConversation(@Body() body: { knowledgeBaseIds?: string[] }) {
    return this.chatService.createConversation(body.knowledgeBaseIds ?? []);
  }

  @Patch("conversations/:id")
  renameConversation(@Param("id") id: string, @Body() body: { title: string }) {
    return this.chatService.renameConversation(id, body.title);
  }

  @Patch("conversations/:id/knowledge-bases")
  knowledgeBases(@Param("id") id: string, @Body() body: { knowledgeBaseIds?: string[] }) {
    return this.chatService.updateKnowledgeBases(id, body.knowledgeBaseIds ?? []);
  }

  @Delete("conversations/:id")
  deleteConversation(@Param("id") id: string) {
    return this.chatService.deleteConversation(id);
  }

  @Get("conversations/:id/messages")
  messages(@Param("id") id: string) {
    return this.chatService.listMessages(id);
  }

  @Post("conversations/:id/messages/stream")
  async streamMessage(@Param("id") id: string, @Body() body: { content: string }, @Res() response: Response) {
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    const emit = (event: ChatStreamEvent) => {
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    await this.chatService.streamMessage(id, body.content ?? "", emit);
    response.end();
  }
}
