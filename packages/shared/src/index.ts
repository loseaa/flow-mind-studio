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

export const chatToolCallPartSchema = z.object({
  id: z.string(),
  type: z.literal("tool_call"),
  props: z.object({
    invocationId: z.string(),
    toolName: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    status: z.enum(["proposed", "approval_required", "started", "completed", "failed", "rejected", "expired"]),
    input: z.record(z.unknown()),
    output: z.unknown().optional(),
    message: z.string().optional()
  })
});

export const chatPartSchema = z.discriminatedUnion("type", [
  chatTextPartSchema,
  chatCardPartSchema,
  chatTablePartSchema,
  chatRagAnswerPartSchema,
  chatToolCallPartSchema,
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
  }),
  z.object({ type: z.literal("tool.proposed"), payload: z.object({ invocationId: z.string(), toolName: z.string(), riskLevel: z.enum(["low","medium","high"]), input: z.record(z.unknown()) }) }),
  z.object({ type: z.literal("tool.approval_required"), payload: z.object({ invocationId: z.string(), toolName: z.string(), riskLevel: z.enum(["low","medium","high"]), input: z.record(z.unknown()) }) }),
  z.object({ type: z.literal("tool.started"), payload: z.object({ invocationId: z.string() }) }),
  z.object({ type: z.literal("tool.completed"), payload: z.object({ invocationId: z.string(), output: z.unknown() }) }),
  z.object({ type: z.literal("tool.failed"), payload: z.object({ invocationId: z.string(), message: z.string() }) }),
  z.object({ type: z.literal("tool.rejected"), payload: z.object({ invocationId: z.string() }) })
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

export const documentStatusSchema = z.enum(["uploaded", "parsing", "indexed", "failed"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export const documentVersionStatusSchema = z.enum(["uploaded", "indexing", "ready", "active", "failed", "archived"]);
export type DocumentVersionStatus = z.infer<typeof documentVersionStatusSchema>;

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
  activeVersionId: z.string().nullable().default(null),
  activeVersion: z.number().nullable().default(null),
  latestVersion: z.number().default(1),
  uploadedAt: z.string(),
  indexedAt: z.string().nullable().default(null)
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const knowledgeDocumentVersionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  version: z.number(),
  status: documentVersionStatusSchema,
  sizeBytes: z.number(),
  contentHash: z.string(),
  chunkCount: z.number(),
  parserVersion: z.string().nullable(),
  chunkerVersion: z.string().nullable(),
  embeddingModel: z.string().nullable(),
  indexVersion: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  indexedAt: z.string().nullable(),
  activatedAt: z.string().nullable()
});
export type KnowledgeDocumentVersion = z.infer<typeof knowledgeDocumentVersionSchema>;

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

export const retrievalCandidateSchema = ragCitationSchema.extend({
  vectorRank: z.number().nullable(),
  keywordRank: z.number().nullable(),
  vectorScore: z.number().nullable(),
  keywordScore: z.number().nullable(),
  fusedScore: z.number(),
  documentVersion: z.number().nullable()
});
export type RetrievalCandidate = z.infer<typeof retrievalCandidateSchema>;

export const retrievalDebugSchema = z.object({
  question: z.string(),
  mode: z.enum(["vector", "hybrid"]),
  profile: z.object({ vectorTopK: z.number(), keywordTopK: z.number(), finalTopK: z.number(), minScore: z.number(), rrfK: z.number() }),
  vectorCandidates: z.array(retrievalCandidateSchema),
  keywordCandidates: z.array(retrievalCandidateSchema),
  finalCandidates: z.array(retrievalCandidateSchema),
  latencyMs: z.number()
});
export type RetrievalDebug = z.infer<typeof retrievalDebugSchema>;

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
  retrievalMode: z.enum(["vector", "hybrid"]).default("hybrid"),
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

export const dataSourceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  type: z.literal("postgresql"),
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  username: z.string(),
  sslMode: z.enum(["disable", "prefer", "require", "verify-full"]),
  enabled: z.boolean(),
  status: z.enum(["unknown", "online", "error"]),
  hasCredentials: z.boolean(),
  lastCheckedAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DataSource = z.infer<typeof dataSourceSchema>;

export const databaseColumnSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  defaultValue: z.string().nullable()
});
export const databaseTableSchema = z.object({
  schema: z.string(),
  name: z.string(),
  type: z.enum(["table", "view"]),
  columns: z.array(databaseColumnSchema)
});
export type DatabaseTable = z.infer<typeof databaseTableSchema>;

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

export const lowCodeImageAssetSchema = z.object({
  url: z.string().url(),
  key: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative()
});
export type LowCodeImageAsset = z.infer<typeof lowCodeImageAssetSchema>;

export const designElementTypes = ["page", "section", "stack", "text", "image", "button", "input", "badge", "divider", "shape", "stat", "filter", "table", "form"] as const;
export type DesignElementType = (typeof designElementTypes)[number];

export const designSpacingValues = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const designToneValues = ["default", "muted", "brand", "success", "warning", "danger"] as const;
export const designColorTokenValues = ["transparent", "surface", "muted", "white", "brand", "success", "warning", "danger", "textPrimary", "textSecondary", "border"] as const;
export const designRadiusValues = ["none", "xs", "sm", "md", "lg", "xl", "full"] as const;
export const designBorderWidthValues = ["none", "sm", "md", "lg"] as const;
export const designFontFamilyValues = ["sans", "serif", "mono"] as const;
export const designFontSizeValues = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const;
export const designFontWeightValues = ["regular", "medium", "semibold", "bold"] as const;
export const designLineHeightValues = ["tight", "normal", "relaxed"] as const;
export const designTextAlignValues = ["left", "center", "right"] as const;

const designImageSlotHeightRanges = {
  hero: { min: 360, max: 560 },
  section: { min: 240, max: 420 },
  card: { min: 160, max: 280 },
  gallery: { min: 180, max: 360 }
} as const;

export const designImageSlotSchema = z
  .object({
    id: z.string().trim().min(1),
    parentId: z.string().trim().min(1),
    role: z.enum(["hero", "section", "card", "gallery"]),
    placement: z.enum(["background", "inline"]),
    display: z
      .object({
        aspectRatio: z.enum(["16:9", "4:3", "3:2", "1:1", "3:4"]),
        width: z.enum(["fill", "half", "third"]),
        minHeight: z.number().int().positive().optional(),
        maxHeight: z.number().int().positive(),
        objectFit: z.enum(["cover", "contain"]),
        focalPoint: z.enum(["center", "top", "left", "right"])
      })
      .strict(),
    generation: z
      .object({
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
        safeArea: z.enum(["left", "right", "center", "none"])
      })
      .strict()
  })
  .strict()
  .superRefine((slot, context) => {
    const range = designImageSlotHeightRanges[slot.role];
    if (slot.display.maxHeight < range.min || slot.display.maxHeight > range.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${slot.role} image slot maxHeight must be between ${range.min} and ${range.max}`,
        path: ["display", "maxHeight"]
      });
    }

    if (slot.display.minHeight !== undefined && slot.display.minHeight > slot.display.maxHeight) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image slot minHeight must not exceed maxHeight",
        path: ["display", "minHeight"]
      });
    }
  });
export type DesignImageSlot = z.infer<typeof designImageSlotSchema>;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
);

const legacyDesignVariableSchema = z.object({
  key: z.string().min(1),
  defaultValue: z.string().default("")
}).passthrough();

export const designVariablesSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  const variables: Record<string, JsonValue> = {};
  for (const item of value) {
    const parsed = legacyDesignVariableSchema.safeParse(item);
    if (parsed.success) variables[parsed.data.key] = parsed.data.defaultValue;
  }
  return variables;
}, z.record(jsonValueSchema)).default({});
export type DesignVariables = z.infer<typeof designVariablesSchema>;

export const dataQueryParameterSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  position: z.number().int().positive(),
  type: z.enum(["string", "number", "boolean", "date"]),
  required: z.boolean().default(false),
  defaultValue: jsonValueSchema.optional()
});

export const dataQuerySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  pageId: z.string(),
  dataSourceId: z.string(),
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  name: z.string(),
  statement: z.string(),
  parameters: z.array(dataQueryParameterSchema),
  outputSchema: z.record(z.unknown()),
  trigger: z.enum(["pageLoad", "manual"]),
  timeoutMs: z.number().int().min(100).max(30000),
  maxRows: z.number().int().min(1).max(1000),
  revision: z.number().int().positive(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DataQuery = z.infer<typeof dataQuerySchema>;

export const dataQueryResultSchema = z.object({
  rows: z.array(z.record(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  fields: z.array(z.object({ name: z.string(), dataTypeId: z.number().int().optional() })),
  durationMs: z.number().nonnegative(),
  truncated: z.boolean()
});
export type DataQueryResult = z.infer<typeof dataQueryResultSchema>;

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

export const designBorderStyleSchema = z.object({
  width: z.enum(designBorderWidthValues),
  style: z.enum(["solid", "dashed", "none"]),
  color: z.enum(designColorTokenValues)
}).strict();
export type DesignBorderStyle = z.infer<typeof designBorderStyleSchema>;

export const designTextStyleSchema = z.object({
  color: z.enum(designColorTokenValues),
  fontFamily: z.enum(designFontFamilyValues),
  fontSize: z.enum(designFontSizeValues),
  fontWeight: z.enum(designFontWeightValues),
  lineHeight: z.enum(designLineHeightValues),
  align: z.enum(designTextAlignValues)
}).strict();
export type DesignTextStyle = z.infer<typeof designTextStyleSchema>;

export const designBaseStyleSchema = z.object({
  backgroundColor: z.enum(designColorTokenValues),
  backgroundImage: z.string().url().optional(),
  radius: z.enum(designRadiusValues),
  border: designBorderStyleSchema,
  text: designTextStyleSchema
}).strict();
export type DesignBaseStyle = z.infer<typeof designBaseStyleSchema>;

export const designContainerStyleSchema = z.object({
  base: designBaseStyleSchema,
  container: z.object({
    shadow: z.enum(["none", "sm", "md", "lg"]),
    overflow: z.enum(["visible", "hidden", "auto"]),
    surface: z.enum(["flat", "card", "panel"])
  }).strict()
}).strict();

export const designTextElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  text: z.object({
    role: z.enum(["heading", "subheading", "body", "caption"]),
    decoration: z.enum(["none", "underline", "lineThrough"]),
    transform: z.enum(["none", "uppercase", "lowercase", "capitalize"])
  }).strict()
}).strict();

export const designImageElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  image: z.object({
    aspectRatio: z.enum(["wide", "square", "portrait"]),
    objectFit: z.enum(["cover", "contain", "fill"])
  }).strict()
}).strict();

export const designButtonElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  button: z.object({
    size: z.enum(["sm", "md", "lg"]),
    emphasis: z.enum(["primary", "secondary", "ghost"])
  }).strict()
}).strict();

export const designControlElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  control: z.object({
    size: z.enum(["sm", "md", "lg"]),
    labelPosition: z.enum(["top", "left", "hidden"]),
    fieldGap: z.enum(designSpacingValues)
  }).strict()
}).strict();

export const designBadgeElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  badge: z.object({
    size: z.enum(["sm", "md", "lg"]),
    shape: z.enum(["square", "pill"]),
    emphasis: z.enum(["soft", "solid", "outline"])
  }).strict()
}).strict();

export const designDividerElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  divider: z.object({
    direction: z.enum(["horizontal", "vertical"]),
    thickness: z.enum(["sm", "md", "lg"]),
    labelPosition: z.enum(["start", "center", "end"])
  }).strict()
}).strict();

export const designShapeElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  shape: z.object({
    kind: z.enum(["rectangle", "circle", "line"]),
    direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
    thickness: z.enum(["sm", "md", "lg"])
  }).strict()
}).strict();

export const designStatElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  stat: z.object({
    valueSize: z.enum(["md", "lg", "xl"]),
    trendPosition: z.enum(["inline", "below"])
  }).strict()
}).strict();

export const designTableElementStyleSchema = z.object({
  base: designBaseStyleSchema,
  table: z.object({
    density: z.enum(["compact", "default", "comfortable"]),
    zebra: z.boolean(),
    headerBackground: z.enum(designColorTokenValues),
    borderMode: z.enum(["none", "rows", "grid"])
  }).strict()
}).strict();

export type DesignElementStyle =
  | z.infer<typeof designContainerStyleSchema>
  | z.infer<typeof designTextElementStyleSchema>
  | z.infer<typeof designImageElementStyleSchema>
  | z.infer<typeof designButtonElementStyleSchema>
  | z.infer<typeof designControlElementStyleSchema>
  | z.infer<typeof designBadgeElementStyleSchema>
  | z.infer<typeof designDividerElementStyleSchema>
  | z.infer<typeof designShapeElementStyleSchema>
  | z.infer<typeof designStatElementStyleSchema>
  | z.infer<typeof designTableElementStyleSchema>;

export const designTemplateSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }).strict(),
  z.object({ kind: z.literal("variable"), path: z.string().min(1) }).strict()
]);
export type DesignTemplateSegment = z.infer<typeof designTemplateSegmentSchema>;

export const designBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: jsonValueSchema }).strict(),
  z.object({ kind: z.literal("variable"), path: z.string().min(1), fallback: jsonValueSchema.optional() }).strict(),
  z.object({ kind: z.literal("template"), segments: z.array(designTemplateSegmentSchema).min(1) }).strict()
]);
export type DesignBinding = z.infer<typeof designBindingSchema>;

const designElementBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layout: designLayoutSchema.optional(),
  props: z.record(z.unknown()).default({}),
  bindings: z.record(designBindingSchema).optional()
}).strict();

export const designElementSchema = z.discriminatedUnion("type", [
  designElementBaseSchema.extend({ type: z.literal("page"), style: designContainerStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("section"), style: designContainerStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("stack"), style: designContainerStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("text"), style: designTextElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("image"), style: designImageElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("button"), style: designButtonElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("input"), style: designControlElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("filter"), style: designControlElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("form"), style: designControlElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("badge"), style: designBadgeElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("divider"), style: designDividerElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("shape"), style: designShapeElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("stat"), style: designStatElementStyleSchema }),
  designElementBaseSchema.extend({ type: z.literal("table"), style: designTableElementStyleSchema })
]);
export type DesignElement = z.infer<typeof designElementSchema>;

export const designDocumentSchema = z.object({
  schemaVersion: z.literal("fm-design/v1"),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: z.object({
    viewport: z.enum(["mobile", "tablet", "desktop"]),
    width: z.number().int().positive(),
    background: z.enum(["surface", "muted", "white"])
  }).strict(),
  tree: designTreeNodeSchema,
  elements: z.array(designElementSchema).min(1),
  variables: designVariablesSchema
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
