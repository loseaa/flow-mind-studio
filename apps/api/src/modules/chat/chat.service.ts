import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { chatPartSchema, type ChatConversation, type ChatMessage, type ChatPart, type ChatStreamEvent } from "@flowmind/shared";
import { ChatRepository } from "./chat.repository";
import { LlmClient, type LlmMessage } from "./llm-client";
import { NO_EVIDENCE_ANSWER, RetrievalService } from "../knowledge/rag.service";

const ORGANIZATION_ID = "org_1";
const PART_OPEN_TAG = "<fm-part>";
const PART_CLOSE_TAG = "</fm-part>";
const SYSTEM_PROMPT =
  "你是 FlowMindStudio 的 AI 工作台助手。请用简洁、可靠的中文回答用户问题；如果信息不足，请说明需要的上下文。不要编造知识库引用。" +
  "使用 Markdown 格式输出，适当使用标题、列表、代码块、加粗等格式让回答更清晰易读。" +
  "涉及数学公式时，行内公式用 $...$ 包裹，块级公式用 $$...$$ 包裹。" +
  "如果需要输出结构化卡片或表格，只能使用 <fm-part>...</fm-part> 包裹一个 JSON 对象。" +
  "允许的 type 只有 card 和 table。card.props 包含 title、description、tone(default/success/warning/danger)、meta(label/value 数组)。" +
  "table.props 包含 caption、columns(key/label/align 数组)、rows(对象数组)。RAG 引用组件由系统生成，模型不要输出 rag_answer。不要输出 HTML、JavaScript 或 className。";

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly llmClient: LlmClient,
    private readonly retrievalService: RetrievalService
  ) {}

  async onModuleInit() {
    await this.chatRepository.ensureSchema();
  }

  listConversations(): Promise<ChatConversation[]> {
    return this.chatRepository.listConversations(ORGANIZATION_ID);
  }

  createConversation(knowledgeBaseIds: string[] = []): Promise<ChatConversation> {
    return this.chatRepository.createConversation(ORGANIZATION_ID, this.llmClient.model, "新对话", knowledgeBaseIds);
  }

  async renameConversation(id: string, title: string): Promise<ChatConversation> {
    const trimmed = title.trim();
    if (!trimmed) throw new NotFoundException("Conversation title cannot be empty.");

    const conversation = await this.chatRepository.renameConversation(id, ORGANIZATION_ID, trimmed.slice(0, 80));
    if (!conversation) throw new NotFoundException("Conversation not found.");
    return conversation;
  }

  async updateKnowledgeBases(id: string, knowledgeBaseIds: string[]): Promise<ChatConversation> {
    const conversation = await this.chatRepository.updateKnowledgeBases(id, ORGANIZATION_ID, [...new Set(knowledgeBaseIds)]);
    if (!conversation) throw new NotFoundException("Conversation not found.");
    return conversation;
  }

  async deleteConversation(id: string) {
    await this.chatRepository.deleteConversation(id, ORGANIZATION_ID);
    return { ok: true };
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const conversation = await this.chatRepository.getConversation(conversationId, ORGANIZATION_ID);
    if (!conversation) throw new NotFoundException("Conversation not found.");
    return this.chatRepository.listMessages(conversationId);
  }

  async streamMessage(conversationId: string, content: string, emit: (event: ChatStreamEvent) => void): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) {
      emit({ type: "chat.error", payload: { message: "消息内容不能为空。" } });
      return;
    }

    const conversation = await this.chatRepository.getConversation(conversationId, ORGANIZATION_ID);
    if (!conversation) {
      emit({ type: "chat.error", payload: { message: "会话不存在或已被删除。" } });
      return;
    }

    const existingMessages = await this.chatRepository.listMessages(conversationId);
    const userMessage = await this.chatRepository.insertMessage({
      conversationId,
      role: "user",
      content: trimmed
    });
    emit({ type: "message.created", payload: { message: userMessage } });

    if (conversation.title === "新对话" && existingMessages.length === 0) {
      await this.chatRepository.renameConversation(conversationId, ORGANIZATION_ID, createTitle(trimmed));
    }

    let answer = "";
    const parts: ChatPart[] = [];
    const parser = new ChatPartStreamParser();

    try {
      const answerStartedAt = Date.now();
      const retrieval = await this.retrievalService.retrieve(trimmed, conversation.knowledgeBaseIds, conversationId);
      if (conversation.knowledgeBaseIds.length > 0 && retrieval.citations.length === 0) {
        const assistantMessage = await this.chatRepository.insertMessage({
          conversationId,
          role: "assistant",
          content: NO_EVIDENCE_ANSWER,
          citations: []
        });
        emit({ type: "chat.token", payload: { token: NO_EVIDENCE_ANSWER } });
        emit({ type: "chat.done", payload: { message: assistantMessage } });
        await this.retrievalService.updateAnswerLatency(retrieval.trace?.id, Date.now() - answerStartedAt);
        return;
      }

      const ragAnswerPart = createRagAnswerPart("", retrieval.citations);
      if (ragAnswerPart) {
        emit({ type: "chat.part", payload: { part: cloneRagAnswerPart(ragAnswerPart) } });
      }

      const modelMessages = toModelMessages([...existingMessages, userMessage], retrieval.citations);
      for await (const token of this.llmClient.streamChat(modelMessages)) {
        const events = parser.push(token);
        for (const event of events) {
          if (event.kind === "text") {
            answer += event.text;
            if (ragAnswerPart) {
              ragAnswerPart.props.answer = answer;
              emit({ type: "chat.part", payload: { part: cloneRagAnswerPart(ragAnswerPart) } });
            } else {
              emit({ type: "chat.token", payload: { token: event.text } });
            }
          } else if (event.kind === "part") {
            parts.push(event.part);
            emit({ type: "chat.part", payload: { part: event.part } });
          } else {
            emit({ type: "chat.part.placeholder", payload: { part: event.part } });
          }
        }
      }

      const remaining = parser.flush();
      if (remaining) {
        answer += remaining;
        if (ragAnswerPart) {
          ragAnswerPart.props.answer = answer;
          emit({ type: "chat.part", payload: { part: cloneRagAnswerPart(ragAnswerPart) } });
        } else {
          emit({ type: "chat.token", payload: { token: remaining } });
        }
      }

      const finalContent = answer.trim() || "模型没有返回可显示的内容。";
      if (ragAnswerPart) {
        ragAnswerPart.props.answer = finalContent;
      }
      const finalParts = ragAnswerPart ? [cloneRagAnswerPart(ragAnswerPart), ...parts] : parts;

      const assistantMessage = await this.chatRepository.insertMessage({
        conversationId,
        role: "assistant",
        content: finalContent,
        parts: finalParts,
        citations: retrieval.citations
      });
      emit({ type: "chat.done", payload: { message: assistantMessage } });
      await this.retrievalService.updateAnswerLatency(retrieval.trace?.id, Date.now() - answerStartedAt);
    } catch (error) {
      emit({
        type: "chat.error",
        payload: { message: error instanceof Error ? error.message : "模型响应失败，请稍后重试。" }
      });
    }
  }
}

function toModelMessages(messages: ChatMessage[], citations: ChatMessage["citations"] = []): LlmMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...(citations.length > 0
      ? [{
          role: "system" as const,
          content: `以下内容来自已检索的知识库片段。回答必须基于这些内容，并在无法确认时明确说明。\n\n${citations
            .map((citation, index) => `[${index + 1}] ${citation.documentName}\n${citation.quote}`)
            .join("\n\n")}`
        }]
      : []),
    ...messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content }))
  ];
}

function createTitle(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || "新对话";
}

function createRagAnswerPart(answer: string, citations: ChatMessage["citations"]): Extract<ChatPart, { type: "rag_answer" }> | null {
  if (citations.length === 0) return null;
  return {
    id: `part_rag_${Date.now()}`,
    type: "rag_answer",
    props: {
      answer,
      sources: citations.slice(0, 8)
    }
  };
}

function cloneRagAnswerPart(part: Extract<ChatPart, { type: "rag_answer" }>): Extract<ChatPart, { type: "rag_answer" }> {
  return {
    ...part,
    props: {
      answer: part.props.answer,
      sources: [...part.props.sources]
    }
  };
}

type ParserEvent =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; part: Extract<ChatPart, { type: "placeholder" }> }
  | { kind: "part"; part: Exclude<ChatPart, { type: "placeholder" }> };

export class ChatPartStreamParser {
  private buffer = "";
  private partIndex = 0;
  private activePartId: string | null = null;
  private placeholderEmitted = false;

  push(token: string): ParserEvent[] {
    this.buffer += token;
    return this.drain(false);
  }

  flush(): string {
    const events = this.drain(true);
    return events
      .map((event) => (event.kind === "text" ? event.text : ""))
      .join("");
  }

  private drain(isFinal: boolean): ParserEvent[] {
    const events: ParserEvent[] = [];

    while (this.buffer.length > 0) {
      const openIndex = this.buffer.indexOf(PART_OPEN_TAG);
      if (openIndex === -1) {
        if (isFinal) {
          events.push({ kind: "text", text: this.buffer });
          this.buffer = "";
          break;
        }

        const keepLength = PART_OPEN_TAG.length - 1;
        if (this.buffer.length <= keepLength) break;

        const safeText = this.buffer.slice(0, this.buffer.length - keepLength);
        events.push({ kind: "text", text: safeText });
        this.buffer = this.buffer.slice(-keepLength);
        break;
      }

      if (openIndex > 0) {
        events.push({ kind: "text", text: this.buffer.slice(0, openIndex) });
        this.buffer = this.buffer.slice(openIndex);
        continue;
      }

      this.activePartId ??= `part_${++this.partIndex}`;
      if (!this.placeholderEmitted && !this.buffer.includes(PART_CLOSE_TAG, PART_OPEN_TAG.length)) {
        events.push({
          kind: "placeholder",
          part: { id: this.activePartId, type: "placeholder", props: { kind: "structured" } }
        });
        this.placeholderEmitted = true;
      }

      const closeIndex = this.buffer.indexOf(PART_CLOSE_TAG, PART_OPEN_TAG.length);
      if (closeIndex === -1) {
        if (isFinal) {
          events.push({ kind: "text", text: this.buffer });
          this.buffer = "";
          this.activePartId = null;
          this.placeholderEmitted = false;
        }
        break;
      }

      const rawJson = this.buffer.slice(PART_OPEN_TAG.length, closeIndex).trim();
      const parsedPart = this.parsePart(rawJson);
      if (parsedPart && parsedPart.type !== "placeholder") {
        events.push({ kind: "part", part: parsedPart });
      } else {
        events.push({ kind: "text", text: this.buffer.slice(0, closeIndex + PART_CLOSE_TAG.length) });
      }
      this.buffer = this.buffer.slice(closeIndex + PART_CLOSE_TAG.length);
      this.activePartId = null;
      this.placeholderEmitted = false;
    }

    return events;
  }

  private parsePart(rawJson: string): ChatPart | null {
    try {
      const raw = JSON.parse(rawJson) as unknown;
      const candidate = typeof raw === "object" && raw !== null ? { ...raw, id: this.activePartId ?? `part_${++this.partIndex}` } : raw;
      const part = chatPartSchema.parse(candidate);
      return part.type === "rag_answer" ? null : part;
    } catch {
      return null;
    }
  }
}
