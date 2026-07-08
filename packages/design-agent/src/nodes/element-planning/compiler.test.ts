import { designDocumentSchema } from "@flowmind/shared";
import { describe, expect, it } from "vitest";

import { compilePageStructurePlan } from "../json-planning/compiler.js";
import { compileSemanticElementPlan } from "./compiler.js";
import type { SemanticElementPlan } from "./schema.js";

const document = compilePageStructurePlan({
  document: {
    id: "environment_dashboard",
    name: "Environment Dashboard",
    viewport: "desktop",
    width: 1440,
    background: "muted",
  },
  nodes: [
    { id: "page_root", parentId: null, order: 0, type: "page", name: "Page", purpose: "Root" },
    { id: "header_section", parentId: "page_root", order: 0, type: "section", name: "Header", purpose: "Context" },
    { id: "main_section", parentId: "page_root", order: 1, type: "section", name: "Main", purpose: "Workspace" },
  ],
});

const plan: SemanticElementPlan = {
  elements: [
    {
      id: "refresh_button",
      parentId: "header_section",
      order: 1,
      type: "button",
      name: "Refresh",
      purpose: "Refresh monitoring data",
      content: "刷新数据",
      attributes: [{ key: "action", value: "refresh" }],
    },
    {
      id: "page_title",
      parentId: "header_section",
      order: 0,
      type: "text",
      name: "Page Title",
      purpose: "Identify the page",
      content: "区域环境监测",
      attributes: [{ key: "role", value: "heading" }],
    },
    {
      id: "environment_map",
      parentId: "main_section",
      order: 0,
      type: "image",
      name: "Environment Map",
      purpose: "Show monitoring points",
      content: "区域环境监测地图",
      attributes: [{ key: "imagePrompt", value: "GIS map with environmental markers" }],
    },
  ],
  notes: [],
};

describe("compileSemanticElementPlan", () => {
  it("attaches semantic elements to their parent in deterministic order", () => {
    const compiled = compileSemanticElementPlan(document, plan);
    const header = compiled.tree.children?.find((node) => node.id === "header_section");

    expect(header?.children?.map((node) => node.id)).toEqual(["page_title", "refresh_button"]);
  });

  it("creates type-specific props and schema-valid styles", () => {
    const compiled = compileSemanticElementPlan(document, plan);

    expect(compiled.elements.find((element) => element.id === "page_title")?.props).toMatchObject({
      text: "区域环境监测",
      purpose: "Identify the page",
    });
    expect(compiled.elements.find((element) => element.id === "refresh_button")?.props).toMatchObject({
      label: "刷新数据",
      action: "refresh",
    });
    expect(compiled.elements.find((element) => element.id === "environment_map")?.props).toMatchObject({
      alt: "区域环境监测地图",
      imagePrompt: "GIS map with environmental markers",
    });
    expect(designDocumentSchema.parse(compiled)).toEqual(compiled);
  });
  it("keeps semantic images responsive instead of copying a fixed image height", () => {
    const compiled = compileSemanticElementPlan(document, {
      ...plan,
      elements: [{
        ...plan.elements[2],
        attributes: [{ key: "height", value: 800 }],
      }],
    });
    const image = compiled.elements.find((element) => element.id === "environment_map");

    expect(image?.layout).toEqual({ width: "fill", height: "hug" });
    expect(image?.layout).not.toHaveProperty("fixedHeight");
  });

  it("rejects references to a missing parent container", () => {
    expect(() => compileSemanticElementPlan(document, {
      ...plan,
      elements: [{ ...plan.elements[0], parentId: "missing_section" }],
    })).toThrow(/missing parent/i);
  });

  it("rejects ids that collide with existing structure elements", () => {
    expect(() => compileSemanticElementPlan(document, {
      ...plan,
      elements: [{ ...plan.elements[0], id: "header_section" }],
    })).toThrow(/already exists/i);
  });
});
