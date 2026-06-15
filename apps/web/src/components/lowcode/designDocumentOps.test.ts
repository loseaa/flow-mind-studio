import { describe, expect, it } from "vitest";
import type { DesignBaseStyle, DesignDocument, DesignElement } from "@flowmind/shared";
import { insertElement, insertElementTree, removeNode, reparentNode } from "./designDocumentOps";

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

  it("inserts an editable element tree into the requested container index", () => {
    const next = insertElementTree(
      baseDocument(),
      "content_stack",
      {
        root: {
          id: "complex_root",
          children: [
            { id: "complex_title", children: [] },
            { id: "complex_action", children: [] }
          ]
        },
        elements: [stackElement("complex_root"), textElement("complex_title"), textElement("complex_action")]
      },
      1
    );

    expect(next.tree.children?.[0]?.children?.map((child) => child.id)).toEqual(["first", "complex_root", "second"]);
    expect(next.tree.children?.[0]?.children?.[1]?.children?.map((child) => child.id)).toEqual(["complex_title", "complex_action"]);
    expect(next.elements.map((element) => element.id)).toEqual(expect.arrayContaining(["complex_root", "complex_title", "complex_action"]));
  });

  it("falls back to the page root when inserting an element tree into a non-container", () => {
    const next = insertElementTree(baseDocument(), "first", {
      root: { id: "complex_root", children: [{ id: "complex_title", children: [] }] },
      elements: [stackElement("complex_root"), textElement("complex_title")]
    });

    expect(next.tree.children?.map((child) => child.id)).toEqual(["content_stack", "complex_root"]);
  });

  it("removes a complex material root with its child nodes and elements", () => {
    const inserted = insertElementTree(baseDocument(), "content_stack", {
      root: {
        id: "complex_root",
        children: [
          { id: "complex_title", children: [] },
          { id: "complex_action", children: [] }
        ]
      },
      elements: [stackElement("complex_root"), textElement("complex_title"), textElement("complex_action")]
    });

    const next = removeNode(inserted, "complex_root");

    expect(next.tree.children?.[0]?.children?.map((child) => child.id)).toEqual(["first", "second"]);
    expect(next.elements.map((element) => element.id)).not.toEqual(expect.arrayContaining(["complex_root", "complex_title", "complex_action"]));
  });
});

function baseDocument(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: "doc",
    name: "Doc",
    canvas: { viewport: "desktop", width: 1200, background: "white" },
    variables: {},
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
      { id: "page", type: "page", name: "Page", props: {}, style: { base: baseStyle("white"), container: { shadow: "none", overflow: "visible", surface: "flat" } } },
      { id: "content_stack", type: "stack", name: "Stack", props: {}, style: { base: baseStyle("muted"), container: { shadow: "none", overflow: "visible", surface: "card" } } },
      textElement("first"),
      textElement("second")
    ]
  };
}

function textElement(id: string): DesignElement {
  return { id, type: "text", name: id, props: { text: id }, style: { base: baseStyle("transparent"), text: { role: "body", decoration: "none", transform: "none" } } };
}

function stackElement(id: string): DesignElement {
  return {
    id,
    type: "stack",
    name: id,
    props: {},
    layout: { display: "flex", direction: "vertical", gap: "sm", padding: "sm" },
    style: { base: baseStyle("muted"), container: { shadow: "none", overflow: "visible", surface: "card" } }
  };
}

function baseStyle(backgroundColor: DesignBaseStyle["backgroundColor"]): DesignBaseStyle {
  return {
    backgroundColor,
    radius: "md",
    border: { width: "none", style: "solid", color: "border" },
    text: { color: "textPrimary", fontFamily: "sans", fontSize: "md", fontWeight: "regular", lineHeight: "normal", align: "left" }
  };
}
