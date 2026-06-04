import { z } from "zod";
export const organizationRoles = ["owner", "admin", "member"];
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
];
export const rolePermissions = {
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
export const organizationSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    plan: z.literal("mvp")
});
export const membershipSchema = z.object({
    id: z.string(),
    userId: z.string(),
    organizationId: z.string(),
    role: z.enum(organizationRoles)
});
export const ragCitationSchema = z.object({
    documentId: z.string(),
    documentName: z.string(),
    chunkId: z.string(),
    score: z.number(),
    quote: z.string()
});
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
            .array(z.object({
            label: z.string().max(40),
            value: z.string().max(120)
        }))
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
            .array(z.object({
            key: z.string().regex(/^[a-zA-Z0-9_]+$/),
            label: z.string().max(40),
            align: z.enum(["left", "center", "right"]).default("left")
        }))
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
export const chatMessageSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    role: z.enum(["user", "assistant", "tool", "system"]),
    content: z.string(),
    parts: z.array(chatPartSchema).default([]),
    citations: z.array(ragCitationSchema).default([]),
    createdAt: z.string()
});
export const documentStatusSchema = z.enum(["uploaded", "parsing", "indexed", "failed"]);
export const knowledgeDocumentSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    knowledgeBaseId: z.string(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    status: documentStatusSchema,
    uploadedAt: z.string()
});
export const mcpToolRiskSchema = z.enum(["low", "medium", "high"]);
export const mcpServerSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    transport: z.enum(["stdio", "http", "sse"]),
    endpoint: z.string(),
    enabled: z.boolean()
});
export const mcpToolSchema = z.object({
    id: z.string(),
    serverId: z.string(),
    name: z.string(),
    description: z.string(),
    risk: mcpToolRiskSchema,
    requiresConfirmation: z.boolean()
});
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
export const dataFieldSchema = z.object({
    id: z.string(),
    name: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "boolean", "date", "select", "relation"]),
    required: z.boolean().default(false),
    options: z.array(z.string()).default([])
});
export const dataModelSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    label: z.string(),
    fields: z.array(dataFieldSchema)
});
export const lowCodeComponentSchema = z.lazy(() => z.object({
    id: z.string(),
    type: z.enum(["text", "table", "form", "filter", "button", "section", "grid"]),
    label: z.string(),
    props: z.record(z.unknown()).default({}),
    children: z.array(lowCodeComponentSchema).default([])
}));
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
export const sseEventSchema = z.object({
    type: z.enum(["chat.token", "rag.citation", "mcp.tool_call", "task.progress", "agent.node", "done"]),
    payload: z.record(z.unknown())
});
export const dashboardMetricSchema = z.object({
    label: z.string(),
    value: z.string(),
    delta: z.string()
});
export function hasPermission(role, permission) {
    return rolePermissions[role].includes(permission);
}
