import type { ChatStreamEvent, DataModel, DocumentIndexJob, KnowledgeBase, KnowledgeDocument, LowCodePage, McpInvocation, McpServer, RagMetrics } from "@flowmind/shared";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}/api${path}`);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function apiPost<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}


export async function apiPostStrict<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API request failed with ${response.status}`);
  return (await response.json()) as T;
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`API request failed with ${response.status}`);
}

export async function apiCreate<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API request failed with ${response.status}`);
  return (await response.json()) as T;
}

export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  Object.entries(fields).forEach(([key, value]) => body.append(key, value));
  const response = await fetch(`${API_BASE_URL}/api${path}`, { method: "POST", body });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

export function streamJob(jobId: string, onEvent: (job: DocumentIndexJob) => void): () => void {
  const stream = new EventSource(`${API_BASE_URL}/api/tasks/${jobId}/stream`);
  stream.onmessage = (event) => {
    const parsed = JSON.parse(event.data) as { payload: DocumentIndexJob };
    onEvent(parsed.payload);
    if (parsed.payload.status === "completed" || parsed.payload.status === "failed") stream.close();
  };
  stream.onerror = () => stream.close();
  return () => stream.close();
}

export async function streamChatMessage(
  conversationId: string,
  content: string,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });

  if (!response.ok) throw new Error(`API request failed with ${response.status}`);
  if (!response.body) throw new Error("浏览器没有收到流式响应。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";
    events.map(parseSseEvent).filter(Boolean).forEach((event) => onEvent(event as ChatStreamEvent));
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event) onEvent(event);
  }
}

export function parseSseEvent(raw: string): ChatStreamEvent | null {
  const dataLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return null;

  try {
    return JSON.parse(dataLine.slice(5).trim()) as ChatStreamEvent;
  } catch {
    return null;
  }
}

async function readError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message ?? `API request failed with ${response.status}`;
  } catch {
    return `API request failed with ${response.status}`;
  }
}

export const fallbackDashboard = {
  metrics: [
    { label: "知识文档", value: "12,840", delta: "索引完成 98.2%" },
    { label: "MCP 工具", value: "47", delta: "高风险 5 个" },
    { label: "低代码页面", value: "28", delta: "已发布 19 个" },
    { label: "Agent 执行", value: "3,216", delta: "今日成功率 99.1%" }
  ],
  recentTasks: [
    { id: "task_1", name: "生成客户续约风险报告", status: "done" },
    { id: "task_2", name: "索引《售后知识库 Q2》", status: "running" },
    { id: "task_3", name: "发布客户管理页 v1.4", status: "draft" }
  ]
};

export const fallbackDocuments: KnowledgeDocument[] = [
  {
    id: "doc_1",
    organizationId: "org_1",
    knowledgeBaseId: "kb_1",
    name: "产品需求说明.md",
    mimeType: "text/markdown",
    sizeBytes: 18432,
    status: "indexed",
    chunkCount: 24,
    errorMessage: null,
    embeddingModel: "text-embedding-3-small",
    uploadedAt: new Date().toISOString(),
    indexedAt: new Date().toISOString()
  },
  {
    id: "doc_2",
    organizationId: "org_1",
    knowledgeBaseId: "kb_1",
    name: "MCP 工具安全策略.pdf",
    mimeType: "application/pdf",
    sizeBytes: 824320,
    status: "parsing",
    chunkCount: 0,
    errorMessage: null,
    embeddingModel: null,
    uploadedAt: new Date().toISOString(),
    indexedAt: null
  },
  {
    id: "doc_3",
    organizationId: "org_1",
    knowledgeBaseId: "kb_1",
    name: "售后知识库 Q2.txt",
    mimeType: "text/plain",
    sizeBytes: 642880,
    status: "uploaded",
    chunkCount: 0,
    errorMessage: null,
    embeddingModel: null,
    uploadedAt: new Date().toISOString(),
    indexedAt: null
  }
];

export const fallbackKnowledgeBases: KnowledgeBase[] = [
  {
    id: "kb_1",
    organizationId: "org_1",
    name: "产品文档",
    description: "默认知识库",
    documentCount: fallbackDocuments.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const emptyRagMetrics: RagMetrics = {
  indexedDocuments: 0,
  failedDocuments: 0,
  indexSuccessRate: 0,
  averageIndexLatencyMs: 0,
  p95IndexLatencyMs: 0,
  recallAt5: null,
  mrrAt5: null,
  citationCoverage: null,
  citationCorrectness: null,
  groundedness: null,
  answerCorrectness: null,
  p95RetrievalLatencyMs: null,
  p95AnswerLatencyMs: null
};

export const fallbackMcpServers: Array<McpServer & { tools: Array<{ id: string; name: string; description: string; risk: string; requiresConfirmation: boolean }> }> = [
  {
    id: "mcp_1",
    organizationId: "org_1",
    name: "CRM 工具服务",
    transport: "sse",
    endpoint: "https://mcp.example.com/sse",
    enabled: true,
    tools: [
      { id: "tool_1", name: "search_customer", description: "按姓名、邮箱或公司检索客户档案。", risk: "low", requiresConfirmation: false },
      { id: "tool_2", name: "update_customer_stage", description: "更新客户销售阶段。", risk: "high", requiresConfirmation: true }
    ]
  },
  {
    id: "mcp_2",
    organizationId: "org_1",
    name: "工单系统",
    transport: "http",
    endpoint: "https://tickets.example.com/mcp",
    enabled: true,
    tools: [
      { id: "tool_3", name: "create_ticket", description: "按对话结论创建售后工单。", risk: "medium", requiresConfirmation: true }
    ]
  }
];

export const fallbackInvocations: McpInvocation[] = [
  {
    id: "inv_1",
    organizationId: "org_1",
    toolId: "tool_2",
    requestedBy: "user_1",
    status: "pending_confirmation",
    inputPreview: "{\"customerId\":\"cus_1024\",\"stage\":\"Qualified\"}",
    createdAt: new Date().toISOString()
  }
];

export const fallbackModels: DataModel[] = [
  {
    id: "model_customer",
    organizationId: "org_1",
    name: "customer",
    label: "客户",
    fields: [
      { id: "field_name", name: "name", label: "客户名称", type: "text", required: true, options: [] },
      { id: "field_stage", name: "stage", label: "阶段", type: "select", required: true, options: ["线索", "已沟通", "方案中", "成交"] },
      { id: "field_owner", name: "owner", label: "负责人", type: "text", required: false, options: [] },
      { id: "field_health", name: "health", label: "健康度", type: "select", required: false, options: ["健康", "关注", "风险"] }
    ]
  }
];

export const fallbackPages: LowCodePage[] = [
  {
    id: "page_customers",
    organizationId: "org_1",
    name: "客户管理",
    slug: "customers",
    dataModelId: "model_customer",
    version: 1,
    status: "draft",
    layout: [
      { id: "cmp_filter", type: "filter", label: "筛选区", props: { fields: ["stage", "owner"] }, children: [] },
      { id: "cmp_table", type: "table", label: "客户列表", props: { columns: ["name", "stage", "owner", "health"] }, children: [] },
      { id: "cmp_button", type: "button", label: "新建客户", props: { action: "openForm" }, children: [] },
      { id: "cmp_form", type: "form", label: "客户表单", props: { mode: "drawer" }, children: [] }
    ]
  }
];
