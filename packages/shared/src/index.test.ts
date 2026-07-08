import { describe, expect, it } from "vitest";
import { chatPartSchema, designDocumentSchema, designImageSlotSchema, hasPermission, lowCodePageSchema } from "./index.ts";
import type { DesignDocument, DesignImageSlot } from "./index.ts";

describe("shared contracts", () => {
  it("validates a hero image slot", () => {
    expect(() => designImageSlotSchema.parse(validHeroImageSlot())).not.toThrow();
  });

  it("rejects a section image slot above its maximum height", () => {
    expect(() =>
      designImageSlotSchema.parse({
        ...validHeroImageSlot(),
        role: "section",
        display: { ...validHeroImageSlot().display, maxHeight: 421 }
      })
    ).toThrow();
  });

  it("rejects an image slot whose minimum height exceeds its maximum height", () => {
    expect(() =>
      designImageSlotSchema.parse({
        ...validHeroImageSlot(),
        display: { ...validHeroImageSlot().display, minHeight: 481, maxHeight: 480 }
      })
    ).toThrow();
  });

  it("rejects unknown image slot fields", () => {
    expect(() => designImageSlotSchema.parse({ ...validHeroImageSlot(), unexpected: true })).toThrow();
  });
  it("keeps member permissions scoped", () => {
    expect(hasPermission("member", "chat.use")).toBe(true);
    expect(hasPermission("member", "organization.manage")).toBe(false);
  });

  it("validates low-code page schema", () => {
    expect(() =>
      lowCodePageSchema.parse({
        id: "page_1",
        organizationId: "org_1",
        name: "Customers",
        slug: "customers",
        dataModelId: "model_customer",
        version: 1,
        status: "draft",
        layout: [
          {
            id: "cmp_1",
            type: "table",
            label: "Customer table",
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
        answer: "FlowMind can answer with cited knowledge sources.",
        sources: [
          {
            documentId: "doc_1",
            documentName: "product.md",
            chunkId: "chunk_1",
            score: 0.87,
            quote: "Enterprise answers include source citations."
          }
        ]
      }
    });

    expect(part.type).toBe("rag_answer");
  });

  it("validates design documents with tree and flat elements", () => {
    expect(() => designDocumentSchema.parse(validDesignDocument())).not.toThrow();
  });

  it("validates design documents with variables", () => {
    const parsed = designDocumentSchema.parse({
      ...validDesignDocument(),
      variables: {
        customerName: "Acme",
        customer: { name: "Ada" },
        order: { total: 128, paid: true }
      }
    });

    expect(parsed.variables).toEqual({
      customerName: "Acme",
      customer: { name: "Ada" },
      order: { total: 128, paid: true }
    });
  });

  it("defaults missing design document variables to an empty object", () => {
    const { variables: _variables, ...legacyDocument } = validDesignDocument();
    const parsed = designDocumentSchema.parse(legacyDocument);

    expect(parsed.variables).toEqual({});
  });

  it("converts legacy design variable arrays to a variable object", () => {
    const parsed = designDocumentSchema.parse({
      ...validDesignDocument(),
      variables: [{ key: "customerName", name: "Customer name", description: "", defaultValue: "Acme" }]
    });

    expect(parsed.variables).toEqual({ customerName: "Acme" });
  });

  it("rejects non-object design variables", () => {
    expect(() =>
      designDocumentSchema.parse({
        ...validDesignDocument(),
        variables: "Acme"
      })
    ).toThrow();
  });

  it("validates typed design element style by material type", () => {
    const document = validDesignDocument();

    const parsed = designDocumentSchema.parse(document);
    const title = parsed.elements.find((element) => element.id === "title_text");

    expect(title?.type).toBe("text");
    if (title?.type === "text") expect(title.style.text.role).toBe("heading");
  });

  it("rejects style extensions that do not belong to the element type", () => {
    const document = structuredClone(validDesignDocument()) as unknown as { elements: Array<{ id: string; style: Record<string, unknown> }> };
    document.elements[2] = {
      ...document.elements[2],
      style: {
        ...document.elements[2].style,
        button: { size: "md", emphasis: "primary" }
      }
    };

    expect(() => designDocumentSchema.parse(document)).toThrow();
  });

  it("validates enhanced flex layout settings", () => {
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
  });

  it("rejects design documents when tree references missing elements", () => {
    const document = validDesignDocument();
    document.tree.children!.push({ id: "missing_node", children: [] });

    expect(() => designDocumentSchema.parse(document)).toThrow(/missing_node/);
  });

  it("rejects design documents with duplicated element ids", () => {
    const document = validDesignDocument();
    document.elements.push({ ...document.elements[1] });

    expect(() => designDocumentSchema.parse(document)).toThrow(/header_section/);
  });

  it("rejects design documents when a node appears twice in tree", () => {
    const document = validDesignDocument();
    document.tree.children!.push({ id: "title_text", children: [] });

    expect(() => designDocumentSchema.parse(document)).toThrow(/title_text/);
  });
});

function validHeroImageSlot(): DesignImageSlot {
  return {
    id: "hero_visual",
    parentId: "hero_section",
    role: "hero",
    placement: "background",
    display: {
      aspectRatio: "16:9",
      width: "fill",
      minHeight: 360,
      maxHeight: 480,
      objectFit: "cover",
      focalPoint: "center"
    },
    generation: {
      width: 1792,
      height: 1024,
      safeArea: "left"
    }
  };
}
function validDesignDocument(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: "doc_customer_admin",
    name: "Customer admin design",
    canvas: {
      viewport: "desktop",
      width: 1440,
      background: "surface"
    },
    variables: {},
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
        name: "Page",
        layout: { display: "flex", direction: "vertical", gap: "lg", padding: "lg" },
        style: {
          base: {
            backgroundColor: "white",
            radius: "none",
            border: { width: "none", style: "solid", color: "border" },
            text: { color: "textPrimary", fontFamily: "sans", fontSize: "md", fontWeight: "regular", lineHeight: "normal", align: "left" }
          },
          container: { surface: "flat", shadow: "none", overflow: "visible" }
        },
        props: {}
      },
      {
        id: "header_section",
        type: "section",
        name: "Header section",
        layout: { display: "flex", direction: "vertical", gap: "sm" },
        style: {
          base: {
            backgroundColor: "surface",
            radius: "lg",
            border: { width: "sm", style: "solid", color: "border" },
            text: { color: "textPrimary", fontFamily: "sans", fontSize: "md", fontWeight: "regular", lineHeight: "normal", align: "left" }
          },
          container: { surface: "card", shadow: "none", overflow: "visible" }
        },
        props: {}
      },
      {
        id: "title_text",
        type: "text",
        name: "Page title",
        style: {
          base: {
            backgroundColor: "transparent",
            radius: "none",
            border: { width: "none", style: "solid", color: "border" },
            text: { color: "textPrimary", fontFamily: "sans", fontSize: "xl", fontWeight: "bold", lineHeight: "tight", align: "left" }
          },
          text: { role: "heading", decoration: "none", transform: "none" }
        },
        props: { text: "Customers" }
      }
    ]
  };
}
