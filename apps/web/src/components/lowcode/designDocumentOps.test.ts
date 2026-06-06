import { describe, expect, it } from "vitest";
import type { DesignDocument, DesignElement } from "@flowmind/shared";
import { insertElement, reparentNode } from "./designDocumentOps";

describe("designDocumentOps", () => {
  it("inserts an element at the requested parent index", () => {
    const next = insertElement(baseDocument(), "content_stack", textElement("inserted"), 1);

    expect(next.tree.children?.[0]?.children?.map((child) => child.id)).toEqual(["first", "inserted", "second"]);
  });

  it("keeps order when dropping a node inside its current parent without an explicit index", () => {
    const next = reparentNode(baseDocument(), "first", "content_stack");

    expect(next.tree.children?.[0]?.children?.map((child) => child.id)).toEqual(["first", "second"]);
  });

  it("still reorders within the same parent when an explicit index is provided", () => {
    const next = reparentNode(baseDocument(), "first", "content_stack", 2);

    expect(next.tree.children?.[0]?.children?.map((child) => child.id)).toEqual(["second", "first"]);
  });
});

function baseDocument(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: "doc",
    name: "Doc",
    canvas: { viewport: "desktop", width: 1200, background: "white" },
    tree: {
      id: "page",
      children: [
        {
          id: "content_stack",
          children: [
            { id: "first", children: [] },
            { id: "second", children: [] }
          ]
        }
      ]
    },
    elements: [
      { id: "page", type: "page", name: "Page", props: {} },
      { id: "content_stack", type: "stack", name: "Stack", props: {} },
      textElement("first"),
      textElement("second")
    ]
  };
}

function textElement(id: string): DesignElement {
  return { id, type: "text", name: id, props: { text: id } };
}
