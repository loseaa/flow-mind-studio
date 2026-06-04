import {
  type ChatMessage,
  type DataModel,
  type KnowledgeDocument,
  type LowCodePage,
  type McpInvocation,
  type McpServer,
  type McpTool,
  type Membership,
  type Organization,
  type User
} from "@flowmind/shared";

const now = () => new Date().toISOString();

export const mockStore = {
  users: [
    {
      id: "user_1",
      name: "宋小云",
      email: "owner@flowmind.local"
    }
  ] satisfies User[],
  organizations: [
    {
      id: "org_1",
      name: "FlowMind 演示组织",
      slug: "demo",
      plan: "mvp"
    }
  ] satisfies Organization[],
  memberships: [
    {
      id: "mem_1",
      userId: "user_1",
      organizationId: "org_1",
      role: "owner"
    }
  ] satisfies Membership[],
  documents: [
    {
      id: "doc_1",
      organizationId: "org_1",
      knowledgeBaseId: "kb_1",
      name: "产品需求说明.md",
      mimeType: "text/markdown",
      sizeBytes: 18432,
      status: "indexed",
      uploadedAt: now()
    },
    {
      id: "doc_2",
      organizationId: "org_1",
      knowledgeBaseId: "kb_1",
      name: "MCP工具安全策略.pdf",
      mimeType: "application/pdf",
      sizeBytes: 824320,
      status: "parsing",
      uploadedAt: now()
    }
  ] as KnowledgeDocument[],
  messages: [
    {
      id: "msg_1",
      conversationId: "conv_1",
      role: "assistant",
      content: "你好，我可以基于组织知识库回答问题，也可以在确认后调用 MCP 工具。",
      parts: [],
      citations: [],
      createdAt: now()
    }
  ] as ChatMessage[],
  mcpServers: [
    {
      id: "mcp_1",
      organizationId: "org_1",
      name: "CRM 工具服务",
      transport: "sse",
      endpoint: "https://mcp.example.com/sse",
      enabled: true
    }
  ] satisfies McpServer[],
  mcpTools: [
    {
      id: "tool_1",
      serverId: "mcp_1",
      name: "search_customer",
      description: "按姓名、邮箱或公司检索客户档案。",
      risk: "low",
      requiresConfirmation: false
    },
    {
      id: "tool_2",
      serverId: "mcp_1",
      name: "update_customer_stage",
      description: "更新客户销售阶段，高风险操作需要用户确认。",
      risk: "high",
      requiresConfirmation: true
    }
  ] satisfies McpTool[],
  mcpInvocations: [
    {
      id: "inv_1",
      organizationId: "org_1",
      toolId: "tool_2",
      requestedBy: "user_1",
      status: "pending_confirmation",
      inputPreview: "{\"customerId\":\"cus_1024\",\"stage\":\"Qualified\"}",
      createdAt: now()
    }
  ] as McpInvocation[],
  dataModels: [
    {
      id: "model_customer",
      organizationId: "org_1",
      name: "customer",
      label: "客户",
      fields: [
        { id: "field_name", name: "name", label: "客户名称", type: "text", required: true, options: [] },
        { id: "field_stage", name: "stage", label: "阶段", type: "select", required: true, options: ["线索", "已沟通", "方案中", "成交"] },
        { id: "field_owner", name: "owner", label: "负责人", type: "text", required: false, options: [] }
      ]
    }
  ] satisfies DataModel[],
  lowCodePages: [
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
        { id: "cmp_table", type: "table", label: "客户列表", props: { columns: ["name", "stage", "owner"] }, children: [] },
        { id: "cmp_form", type: "form", label: "客户表单", props: { mode: "drawer" }, children: [] }
      ]
    }
  ] as LowCodePage[]
};
