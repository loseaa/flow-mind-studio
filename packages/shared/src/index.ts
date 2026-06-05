import { z } from "zod";

export const organizationRoles = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

export const permissions = [
  "organization.manage",
  "members.manage",
  "knowledge.manage",
  "knowledge.read",
  "chat.use",
  "mcp.manage",
  "mcp.invoke",
  "lowcode.manage",
  "dataModels.manage"
] as const;
export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<OrganizationRole, Permission[]> = {
  owner: [...permissions],
  admin: [
    "members.manage",
    "knowledge.manage",
    "knowledge.read",
    "chat.use",
    "mcp.manage",
    "mcp.invoke",
    "lowcode.manage",
    "dataModels.manage"
  ],
  member: ["knowledge.read", "chat.use", "mcp.invoke"]
};

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email()
});
export type User = z.infer<typeof userSchema>;

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: z.literal("mvp")
});
export type Organization = z.infer<typeof organizationSchema>;

export const membershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  role: z.enum(organizationRoles)
});
export type Membership = z.infer<typeof membershipSchema>;

export const ragCitationSchema = z.object({
  documentId: z.string(),
  documentName: z.string(),
  chunkId: z.string(),
  score: z.number(),
  quote: z.string()
});
export type RagCitation = z.infer<typeof ragCitationSchema>;

export const chatTextPartSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  text: z.string()
});

export const chatCardPartSchema = z.object({
  id: z.string(),
  type: z.literal("card"),
  props: z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(600).optional(),
    tone: z.enum(["default", "success", "warning", "danger"]).default("default"),
    meta: z
      .array(
        z.object({
          label: z.string().max(40),
          value: z.string().max(120)
        })
      )
      .max(8)
      .default([])
  })
});

export const chatTablePartSchema = z.object({
  id: z.string(),
  type: z.literal("table"),
  props: z.object({
    caption: z.string().max(120).optional(),
    columns: z
      .array(
        z.object({
          key: z.string().regex(/^[a-zA-Z0-9_]+$/),
          label: z.string().max(40),
          align: z.enum(["left", "center", "right"]).default("left")
        })
      )
      .min(1)
      .max(8),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(30)
  })
});

export const chatRagAnswerPartSchema = z.object({
  id: z.string(),
  type: z.literal("rag_answer"),
  props: z.object({
    answer: z.string(),
    sources: z.array(ragCitationSchema).min(1).max(8)
  })
});

export const chatPartPlaceholderSchema = z.object({
  id: z.string(),
  type: z.literal("placeholder"),
  props: z.object({
    kind: z.enum(["structured"]).default("structured")
  })
});

export const chatPartSchema = z.discriminatedUnion("type", [
  chatTextPartSchema,
  chatCardPartSchema,
  chatTablePartSchema,
  chatRagAnswerPartSchema,
  chatPartPlaceholderSchema
]);
export type ChatPart = z.infer<typeof chatPartSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  parts: z.array(chatPartSchema).default([]),
  citations: z.array(ragCitationSchema).default([]),
  createdAt: z.string()
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatConversationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  title: z.string(),
  model: z.string(),
  knowledgeBaseIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ChatConversation = z.infer<typeof chatConversationSchema>;

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.created"),
    payload: z.object({ message: chatMessageSchema })
  }),
  z.object({
    type: z.literal("chat.token"),
    payload: z.object({ token: z.string() })
  }),
  z.object({
    type: z.literal("chat.part"),
    payload: z.object({ part: chatPartSchema })
  }),
  z.object({
    type: z.literal("chat.part.placeholder"),
    payload: z.object({ part: chatPartPlaceholderSchema })
  }),
  z.object({
    type: z.literal("chat.done"),
    payload: z.object({ message: chatMessageSchema })
  }),
  z.object({
    type: z.literal("chat.error"),
    payload: z.object({ message: z.string() })
  })
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

export const documentStatusSchema = z.enum(["uploaded", "parsing", "indexed", "failed"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const knowledgeBaseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  documentCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;

export const knowledgeDocumentSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  knowledgeBaseId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  status: documentStatusSchema,
  chunkCount: z.number().default(0),
  errorMessage: z.string().nullable().default(null),
  embeddingModel: z.string().nullable().default(null),
  uploadedAt: z.string(),
  indexedAt: z.string().nullable().default(null)
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const knowledgeChunkSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  knowledgeBaseId: z.string(),
  documentId: z.string(),
  documentName: z.string(),
  chunkIndex: z.number(),
  content: z.string(),
  pageNumber: z.number().nullable().default(null),
  startOffset: z.number(),
  endOffset: z.number()
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export const jobStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export const documentIndexJobSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  type: z.enum(["document.index", "evaluation.run"]),
  resourceId: z.string(),
  status: jobStatusSchema,
  progress: z.number(),
  label: z.string(),
  errorMessage: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DocumentIndexJob = z.infer<typeof documentIndexJobSchema>;

export const ragTraceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  conversationId: z.string().nullable(),
  question: z.string(),
  knowledgeBaseIds: z.array(z.string()),
  citations: z.array(ragCitationSchema),
  retrievalLatencyMs: z.number(),
  answerLatencyMs: z.number().nullable(),
  createdAt: z.string()
});
export type RagTrace = z.infer<typeof ragTraceSchema>;

export const evaluationEvidenceSchema = z.object({
  documentId: z.string(),
  expectedQuote: z.string()
});
export type EvaluationEvidence = z.infer<typeof evaluationEvidenceSchema>;

export const evaluationCaseSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  question: z.string(),
  referenceAnswer: z.string(),
  knowledgeBaseIds: z.array(z.string()),
  evidence: z.array(evaluationEvidenceSchema).min(1)
});
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export const evaluationDatasetSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  caseCount: z.number(),
  createdAt: z.string()
});
export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;

export const ragMetricsSchema = z.object({
  indexedDocuments: z.number(),
  failedDocuments: z.number(),
  indexSuccessRate: z.number(),
  averageIndexLatencyMs: z.number(),
  p95IndexLatencyMs: z.number(),
  recallAt5: z.number().nullable(),
  mrrAt5: z.number().nullable(),
  citationCoverage: z.number().nullable(),
  citationCorrectness: z.number().nullable(),
  groundedness: z.number().nullable(),
  answerCorrectness: z.number().nullable(),
  p95RetrievalLatencyMs: z.number().nullable(),
  p95AnswerLatencyMs: z.number().nullable()
});
export type RagMetrics = z.infer<typeof ragMetricsSchema>;

export const evaluationResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  caseId: z.string(),
  question: z.string(),
  citations: z.array(ragCitationSchema),
  answer: z.string(),
  retrievedExpectedRank: z.number().nullable(),
  groundedness: z.number().nullable(),
  answerCorrectness: z.number().nullable()
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export const evaluationRunSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  datasetId: z.string(),
  status: jobStatusSchema,
  metrics: ragMetricsSchema.nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  results: z.array(evaluationResultSchema).default([])
});
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

export const mcpToolRiskSchema = z.enum(["low", "medium", "high"]);
export type McpToolRisk = z.infer<typeof mcpToolRiskSchema>;

export const mcpServerSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  transport: z.enum(["stdio", "http", "sse"]),
  endpoint: z.string(),
  enabled: z.boolean()
});
export type McpServer = z.infer<typeof mcpServerSchema>;

export const mcpToolSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  name: z.string(),
  description: z.string(),
  risk: mcpToolRiskSchema,
  requiresConfirmation: z.boolean()
});
export type McpTool = z.infer<typeof mcpToolSchema>;

export const mcpInvocationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  toolId: z.string(),
  requestedBy: z.string(),
  status: z.enum(["pending_confirmation", "running", "succeeded", "failed", "rejected"]),
  inputPreview: z.string(),
  outputPreview: z.string().optional(),
  createdAt: z.string()
});
export type McpInvocation = z.infer<typeof mcpInvocationSchema>;

export const dataFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "boolean", "date", "select", "relation"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([])
});
export type DataField = z.infer<typeof dataFieldSchema>;

export const dataModelSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  label: z.string(),
  fields: z.array(dataFieldSchema)
});
export type DataModel = z.infer<typeof dataModelSchema>;

export const lowCodeComponentSchema: z.ZodType<LowCodeComponent, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(["text", "table", "form", "filter", "button", "section", "grid"]),
    label: z.string(),
    props: z.record(z.unknown()).default({}),
    children: z.array(lowCodeComponentSchema).default([])
  })
);
export type LowCodeComponent = {
  id: string;
  type: "text" | "table" | "form" | "filter" | "button" | "section" | "grid";
  label: string;
  props: Record<string, unknown>;
  children: LowCodeComponent[];
};

export const lowCodePageSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  dataModelId: z.string(),
  version: z.number(),
  status: z.enum(["draft", "published"]),
  layout: z.array(lowCodeComponentSchema)
});
export type LowCodePage = z.infer<typeof lowCodePageSchema>;

export const designElementTypes = ["page", "section", "stack", "text", "image", "button", "input", "badge", "divider", "stat", "filter", "table", "form"] as const;
export type DesignElementType = (typeof designElementTypes)[number];

export const designSpacingValues = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const designToneValues = ["default", "muted", "brand", "success", "warning", "danger"] as const;

export type DesignTreeNode = {
  id: string;
  children?: DesignTreeNode[];
};

export const designTreeNodeSchema: z.ZodType<DesignTreeNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    children: z.array(designTreeNodeSchema).default([])
  }).strict()
);

export const designLayoutSchema = z.object({
  display: z.literal("flex").optional(),
  direction: z.enum(["vertical", "horizontal"]).optional(),
  gap: z.enum(designSpacingValues).optional(),
  padding: z.enum(designSpacingValues).optional(),
  width: z.enum(["fill", "hug", "fixed"]).optional(),
  height: z.enum(["fill", "hug", "fixed"]).optional(),
  fixedWidth: z.number().int().positive().optional(),
  fixedHeight: z.number().int().positive().optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  justify: z.enum(["start", "center", "end", "between"]).optional(),
  wrap: z.boolean().optional(),
  grow: z.enum(["none", "fill"]).optional()
}).strict();
export type DesignLayout = z.infer<typeof designLayoutSchema>;

export const designAppearanceSchema = z.object({
  tone: z.enum(designToneValues).optional(),
  variant: z.enum(["plain", "outlined", "filled", "soft"]).optional(),
  density: z.enum(["compact", "default", "comfortable"]).optional(),
  radius: z.enum(["none", "sm", "md", "lg"]).optional()
}).strict();
export type DesignAppearance = z.infer<typeof designAppearanceSchema>;

export const designElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(designElementTypes),
  name: z.string().min(1),
  layout: designLayoutSchema.optional(),
  appearance: designAppearanceSchema.optional(),
  props: z.record(z.unknown()).default({})
}).strict();
export type DesignElement = z.infer<typeof designElementSchema>;

export const designDocumentSchema = z.object({
  schemaVersion: z.literal("fm-design/v1"),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: z.object({
    viewport: z.literal("desktop"),
    width: z.number().int().positive(),
    background: z.enum(["surface", "muted", "white"])
  }).strict(),
  tree: designTreeNodeSchema,
  elements: z.array(designElementSchema).min(1)
}).strict().superRefine((document, context) => {
  const elementIds = new Set<string>();
  for (const element of document.elements) {
    if (elementIds.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `重复的元素 id：${element.id}`,
        path: ["elements"]
      });
    }
    elementIds.add(element.id);
  }

  const treeOccurrences = new Map<string, number>();
  const visit = (node: DesignTreeNode) => {
    treeOccurrences.set(node.id, (treeOccurrences.get(node.id) ?? 0) + 1);
    if (!elementIds.has(node.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `tree 引用了不存在的元素 id：${node.id}`,
        path: ["tree"]
      });
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(document.tree);

  for (const [id, count] of treeOccurrences) {
    if (count > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `tree 中重复出现元素 id：${id}`,
        path: ["tree"]
      });
    }
  }

  for (const id of elementIds) {
    if (!treeOccurrences.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `elements 中的元素没有出现在 tree：${id}`,
        path: ["elements"]
      });
    }
  }
});
export type DesignDocument = z.infer<typeof designDocumentSchema>;

export const sseEventSchema = z.object({
  type: z.enum([
    "message.created",
    "chat.token",
    "chat.part",
    "chat.part.placeholder",
    "chat.done",
    "chat.error",
    "rag.citation",
    "mcp.tool_call",
    "task.progress",
    "agent.node",
    "done"
  ]),
  payload: z.record(z.unknown())
});
export type SseEvent = z.infer<typeof sseEventSchema>;

export const dashboardMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
  delta: z.string()
});
export type DashboardMetric = z.infer<typeof dashboardMetricSchema>;

export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
