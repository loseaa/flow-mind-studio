import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { ChatConversation, ChatMessage } from "@flowmind/shared";
import { ChatPartStreamParser, ChatService } from "./chat.service";
import type { ChatRepository } from "./chat.repository";
import { LlmClient, parseOpenAIStreamLine } from "./llm-client";
import type { RetrievalService } from "../knowledge/rag.service";

describe("LlmClient", () => {
  it("builds an OpenAI-compatible streaming request with configured model and history", () => {
    const client = new LlmClient({
      get: (key: string) => {
        const values: Record<string, string> = {
          DEEPSEEK_BASE_URL: "https://api.deepseek.com",
          DEEPSEEK_MODEL: "deepseek-v4-flash"
        };
        return values[key];
      }
    } as ConfigService);

    expect(client.buildRequest([{ role: "user", content: "你好" }])).toEqual({
      model: "deepseek-v4-flash",
      stream: true,
      temperature: 0.2,
      messages: [{ role: "user", content: "你好" }]
    });
  });

  it("parses OpenAI-compatible SSE chunks into tokens", () => {
    expect(parseOpenAIStreamLine('data: {"choices":[{"delta":{"content":"你好"}}]}')).toBe("你好");
    expect(parseOpenAIStreamLine("data: [DONE]")).toBeNull();
    expect(parseOpenAIStreamLine(": keepalive")).toBeNull();
  });
});

describe("ChatPartStreamParser", () => {
  it("extracts validated card parts while preserving surrounding text", () => {
    const parser = new ChatPartStreamParser();
    const events = parser.push(
      '摘要：<fm-part>{"type":"card","props":{"title":"高风险客户","tone":"warning","meta":[{"label":"等级","value":"高"}]}}</fm-part>继续说明。'
    );

    expect(events).toEqual([
      { kind: "text", text: "摘要：" },
      {
        kind: "part",
        part: {
          id: "part_1",
          type: "card",
          props: {
            title: "高风险客户",
            tone: "warning",
            meta: [{ label: "等级", value: "高" }]
          }
      }
      }
    ]);
    expect(parser.flush()).toBe("继续说明。");
  });

  it("falls invalid part markup back to text", () => {
    const parser = new ChatPartStreamParser();
    const events = parser.push('<fm-part>{"type":"unknown"}</fm-part>');

    expect(events).toEqual([{ kind: "text", text: '<fm-part>{"type":"unknown"}</fm-part>' }]);
  });

  it("rejects model-supplied RAG answer parts", () => {
    const parser = new ChatPartStreamParser();
    const rawPart =
      '<fm-part>{"type":"rag_answer","props":{"answer":"伪造引用","sources":[{"documentId":"doc_1","documentName":"文档.md","chunkId":"chunk_1","score":1,"quote":"引用"}]}}</fm-part>';

    expect(parser.push(rawPart)).toEqual([{ kind: "text", text: rawPart }]);
  });

  it("emits one placeholder for a structured part before the closing tag arrives", () => {
    const parser = new ChatPartStreamParser();

    expect(parser.push("分析：<fm-part>")).toEqual([
      { kind: "text", text: "分析：" },
      { kind: "placeholder", part: { id: "part_1", type: "placeholder", props: { kind: "structured" } } }
    ]);
    expect(parser.push('{"type":"card","props":{"title":"风险摘要","tone":"warning","meta":[]}}')).toEqual([]);
    expect(parser.push("</fm-part>")).toEqual([
      {
        kind: "part",
        part: {
          id: "part_1",
          type: "card",
          props: {
            title: "风险摘要",
            tone: "warning",
            meta: []
          }
        }
      }
    ]);
  });
});

describe("ChatService streaming errors", () => {
  it("emits chat.error and does not save an assistant message when the model fails", async () => {
    const conversation: ChatConversation = {
      id: "conv_1",
      organizationId: "org_1",
      title: "新对话",
      model: "deepseek-v4-flash",
      knowledgeBaseIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const inserted: ChatMessage[] = [];
    const repository = {
      getConversation: async () => conversation,
      listMessages: async () => [],
      renameConversation: async () => conversation,
      insertMessage: async (input: { conversationId: string; role: ChatMessage["role"]; content: string }) => {
        const message: ChatMessage = {
          id: `msg_${inserted.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          parts: [],
          citations: [],
          createdAt: new Date().toISOString()
        };
        inserted.push(message);
        return message;
      }
    } as unknown as ChatRepository;
    const llmClient = {
      model: "deepseek-v4-flash",
      streamChat: async function* () {
        throw new Error("Ollama is offline");
      }
    } as unknown as LlmClient;
    const service = new ChatService(repository, llmClient, noRetrieval());
    const events: Array<{ type: string }> = [];

    await service.streamMessage("conv_1", "你好", (event) => events.push(event));

    expect(events.map((event) => event.type)).toEqual(["message.created", "chat.error"]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].role).toBe("user");
  });

  it("emits chat.part and stores validated structured parts", async () => {
    const conversation: ChatConversation = {
      id: "conv_1",
      organizationId: "org_1",
      title: "新对话",
      model: "deepseek-v4-flash",
      knowledgeBaseIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const inserted: ChatMessage[] = [];
    const repository = {
      getConversation: async () => conversation,
      listMessages: async () => [],
      renameConversation: async () => conversation,
      insertMessage: async (input: { conversationId: string; role: ChatMessage["role"]; content: string; parts?: ChatMessage["parts"] }) => {
        const message: ChatMessage = {
          id: `msg_${inserted.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          parts: input.parts ?? [],
          citations: [],
          createdAt: new Date().toISOString()
        };
        inserted.push(message);
        return message;
      }
    } as unknown as ChatRepository;
    const llmClient = {
      model: "deepseek-v4-flash",
      streamChat: async function* () {
        yield "客户摘要：";
        yield "<fm-part>";
        yield '{"type":"table","props":{"caption":"风险列表","columns":[{"key":"customer","label":"客户"}],"rows":[{"customer":"A 公司"}]}}';
        yield "</fm-part>";
      }
    } as unknown as LlmClient;
    const service = new ChatService(repository, llmClient, noRetrieval());
    const events: Array<{ type: string }> = [];

    await service.streamMessage("conv_1", "列出风险", (event) => events.push(event));

    expect(events.map((event) => event.type)).toEqual(["message.created", "chat.token", "chat.part.placeholder", "chat.part", "chat.done"]);
    expect(inserted).toHaveLength(2);
    expect(inserted[1].content).toBe("客户摘要：");
    expect(inserted[1].parts).toHaveLength(1);
    expect(inserted[1].parts[0].type).toBe("table");
  });

  it("returns a controlled answer without calling the model when scoped retrieval has no evidence", async () => {
    const conversation: ChatConversation = {
      id: "conv_1",
      organizationId: "org_1",
      title: "政策问答",
      model: "deepseek-v4-flash",
      knowledgeBaseIds: ["kb_1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const inserted: ChatMessage[] = [];
    const repository = {
      getConversation: async () => conversation,
      listMessages: async () => [],
      insertMessage: async (input: { conversationId: string; role: ChatMessage["role"]; content: string; citations?: ChatMessage["citations"] }) => {
        const message: ChatMessage = {
          id: `msg_${inserted.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          parts: [],
          citations: input.citations ?? [],
          createdAt: new Date().toISOString()
        };
        inserted.push(message);
        return message;
      }
    } as unknown as ChatRepository;
    let invoked = false;
    const llmClient = {
      model: "deepseek-v4-flash",
      streamChat: async function* () {
        invoked = true;
        yield "不应调用";
      }
    } as unknown as LlmClient;
    const service = new ChatService(repository, llmClient, noRetrieval());
    const events: Array<{ type: string }> = [];

    await service.streamMessage("conv_1", "合同期限是多少？", (event) => events.push(event));

    expect(invoked).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["message.created", "chat.token", "chat.done"]);
    expect(inserted[1].content).toContain("未从所选知识库找到");
  });

  it("stores retrieved answers as a RAG answer part with sources", async () => {
    const conversation: ChatConversation = {
      id: "conv_1",
      organizationId: "org_1",
      title: "政策问答",
      model: "deepseek-v4-flash",
      knowledgeBaseIds: ["kb_1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const citation: ChatMessage["citations"][number] = {
      documentId: "doc_1",
      documentName: "产品说明.md",
      chunkId: "chunk_1",
      score: 0.91,
      quote: "企业版按席位计费，包含知识库问答与引用追溯。"
    };
    const inserted: ChatMessage[] = [];
    const repository = {
      getConversation: async () => conversation,
      listMessages: async () => [],
      insertMessage: async (input: {
        conversationId: string;
        role: ChatMessage["role"];
        content: string;
        parts?: ChatMessage["parts"];
        citations?: ChatMessage["citations"];
      }) => {
        const message: ChatMessage = {
          id: `msg_${inserted.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          parts: input.parts ?? [],
          citations: input.citations ?? [],
          createdAt: new Date().toISOString()
        };
        inserted.push(message);
        return message;
      }
    } as unknown as ChatRepository;
    const llmClient = {
      model: "deepseek-v4-flash",
      streamChat: async function* () {
        yield "企业版按席位计费，并包含知识库问答。";
      }
    } as unknown as LlmClient;
    const retrieval = {
      retrieve: async () => ({ citations: [citation], retrievalLatencyMs: 8, trace: { id: "trace_1" } }),
      updateAnswerLatency: async () => undefined
    } as unknown as RetrievalService;
    const service = new ChatService(repository, llmClient, retrieval);
    const events: Array<{ type: string }> = [];

    await service.streamMessage("conv_1", "企业版怎么收费？", (event) => events.push(event));

    expect(events.map((event) => event.type)).toEqual(["message.created", "chat.part", "chat.part", "chat.part", "chat.done"]);
    expect(events[1]).toMatchObject({
      type: "chat.part",
      payload: {
        part: {
          type: "rag_answer",
          props: { answer: "", sources: [citation] }
        }
      }
    });
    expect(events[3]).toMatchObject({
      type: "chat.part",
      payload: {
        part: {
          type: "rag_answer",
          props: { answer: "企业版按席位计费，并包含知识库问答。", sources: [citation] }
        }
      }
    });
    expect(inserted[1].parts[0]).toMatchObject({
      type: "rag_answer",
      props: {
        answer: "企业版按席位计费，并包含知识库问答。",
        sources: [citation]
      }
    });
    expect(inserted[1].citations).toEqual([citation]);
  });
});

function noRetrieval() {
  return {
    retrieve: async () => ({ citations: [], retrievalLatencyMs: 0, trace: null }),
    updateAnswerLatency: async () => undefined
  } as unknown as RetrievalService;
}
