import { describe, expect, it } from "vitest";
import { chatPartSchema, designDocumentSchema, hasPermission, lowCodePageSchema } from "./index.ts";
import type { DesignDocument } from "./index.ts";

describe("shared contracts", () => {
  it("keeps member permissions scoped", () => {
    expect(hasPermission("member", "chat.use")).toBe(true);
    expect(hasPermission("member", "organization.manage")).toBe(false);
  });

  it("validates low-code page schema", () => {
    expect(() =>
      lowCodePageSchema.parse({
        id: "page_1",
        organizationId: "org_1",
        name: "客户管理",
        slug: "customers",
        dataModelId: "model_customer",
        version: 1,
        status: "draft",
        layout: [
          {
            id: "cmp_1",
            type: "table",
            label: "客户列表",
            props: {},
            children: []
          }
        ]
      })
    ).not.toThrow();
  });

  it("validates RAG answer parts with explicit sources", () => {
    const part = chatPartSchema.parse({
      id: "part_rag_1",
      type: "rag_answer",
      props: {
        answer: "FlowMind Enterprise Copilot 支持按知识库回答。",
        sources: [
          {
            documentId: "doc_1",
            documentName: "产品说明.md",
            chunkId: "chunk_1",
            score: 0.87,
            quote: "企业版支持知识库约束回答，并在回答中展示来源引用。"
          }
        ]
      }
    });

    expect(part.type).toBe("rag_answer");
  });

  it("validates design documents with tree and flat elements", () => {
    expect(() => designDocumentSchema.parse(validDesignDocument())).not.toThrow();
  });

  it("validates enhanced flex layout settings without breaking old documents", () => {
    const document = validDesignDocument();
    document.elements[1].layout = {
      display: "flex",
      direction: "horizontal",
      gap: "md",
      padding: "lg",
      align: "stretch",
      justify: "between",
      wrap: true,
      width: "fixed",
      height: "fill",
      fixedWidth: 360,
      grow: "fill"
    };

    const parsed = designDocumentSchema.parse(document);

    expect(parsed.elements[1].layout).toMatchObject({
      justify: "between",
      wrap: true,
      fixedWidth: 360,
      grow: "fill"
    });
    expect(() => designDocumentSchema.parse(validDesignDocument())).not.toThrow();
  });

  it("rejects design documents when tree references missing elements", () => {
    const document = validDesignDocument();
    document.tree.children!.push({ id: "missing_node", children: [] });

    expect(() => designDocumentSchema.parse(document)).toThrow(/不存在的元素 id/);
  });

  it("rejects design documents with duplicated element ids", () => {
    const document = validDesignDocument();
    document.elements.push({ ...document.elements[1] });

    expect(() => designDocumentSchema.parse(document)).toThrow(/重复的元素 id/);
  });

  it("rejects design documents when a node appears twice in tree", () => {
    const document = validDesignDocument();
    document.tree.children!.push({ id: "title_text", children: [] });

    expect(() => designDocumentSchema.parse(document)).toThrow(/重复出现元素 id/);
  });
});

function validDesignDocument(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: "doc_customer_admin",
    name: "客户管理设计稿",
    canvas: {
      viewport: "desktop",
      width: 1440,
      background: "surface"
    },
    tree: {
      id: "page_root",
      children: [
        {
          id: "header_section",
          children: [{ id: "title_text", children: [] }]
        }
      ]
    },
    elements: [
      {
        id: "page_root",
        type: "page",
        name: "页面",
        layout: { display: "flex", direction: "vertical", gap: "lg", padding: "lg" },
        props: {}
      },
      {
        id: "header_section",
        type: "section",
        name: "标题区",
        layout: { display: "flex", direction: "vertical", gap: "sm" },
        props: {}
      },
      {
        id: "title_text",
        type: "text",
        name: "页面标题",
        props: { text: "客户管理", level: "h1" }
      }
    ]
  };
}
