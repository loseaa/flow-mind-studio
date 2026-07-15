import { describe, expect, it } from "vitest";

import { compileSemanticElementPlan } from "../element-planning/compiler.js";
import { compilePageStructurePlan } from "../json-planning/compiler.js";
import { compileStylePlan, repairStylePlan } from "./compiler.js";
import type { StylePlan } from "./schema.js";

const structure = compilePageStructurePlan({
  document: { id: "dashboard", name: "Dashboard", viewport: "desktop", width: 1440, background: "muted" },
  nodes: [
    { id: "page_root", parentId: null, order: 0, type: "page", name: "Page", purpose: "Root" },
    { id: "main_section", parentId: "page_root", order: 0, type: "section", name: "Main", purpose: "Workspace" },
  ],
});

const document = compileSemanticElementPlan(structure, {
  elements: [
    { id: "page_title", parentId: "main_section", order: 0, type: "text", name: "Title", purpose: "Identify page", content: "Dashboard", attributes: [] },
    { id: "header_headline", parentId: "main_section", order: 1, type: "text", name: "Page Headline", purpose: "Establish page context", content: "Ecommerce Workspace", attributes: [] },
    { id: "refresh_button", parentId: "main_section", order: 2, type: "button", name: "Refresh", purpose: "Refresh data", content: "Refresh", attributes: [] },
    { id: "results_table", parentId: "main_section", order: 3, type: "table", name: "Results", purpose: "Show data", attributes: [] },
  ],
  notes: [],
});

const plan: StylePlan = {
  theme: "data_dense",
  tone: "operational",
  assignments: [
    { elementId: "page_title", preset: "heading" },
    { elementId: "refresh_button", preset: "secondary_action" },
    { elementId: "results_table", preset: "data_table" },
  ],
  notes: [],
};

describe("compileStylePlan", () => {
  it("applies compatible deterministic presets and stores the theme", () => {
    const compiled = compileStylePlan(document, plan);
    expect(compiled.variables.designTheme).toEqual({ theme: "data_dense", tone: "operational" });
    expect(compiled.elements.find((element) => element.id === "page_title")).toMatchObject({
      type: "text",
      style: { base: { text: { fontSize: "2xl", fontWeight: "bold" } }, text: { role: "heading" } },
    });
    expect(compiled.elements.find((element) => element.id === "refresh_button")).toMatchObject({
      type: "button",
      style: { button: { emphasis: "secondary" } },
    });
    expect(compiled.elements.find((element) => element.id === "results_table")).toMatchObject({
      type: "table",
      style: { table: { density: "compact", borderMode: "rows" } },
    });
  });

  it("rejects missing elements", () => {
    expect(() => compileStylePlan(document, {
      ...plan,
      assignments: [{ elementId: "missing", preset: "heading" }],
    })).toThrow(/missing style element/i);
  });

  it("promotes header headline body assignments to a real heading", () => {
    const repaired = repairStylePlan(document, {
      theme: "neutral_workspace",
      tone: "quiet",
      assignments: [{ elementId: "header_headline", preset: "body" }],
      notes: [],
    });
    expect(repaired.assignments).toEqual(expect.arrayContaining([
      { elementId: "header_headline", preset: "heading" },
    ]));
    expect(compileStylePlan(document, repaired).elements.find((element) => element.id === "header_headline")).toMatchObject({
      style: { base: { text: { fontSize: "2xl", fontWeight: "bold" } }, text: { role: "heading" } },
    });
  });

  it("rejects presets that are incompatible with the element type", () => {
    expect(() => compileStylePlan(document, {
      ...plan,
      assignments: [{ elementId: "refresh_button", preset: "heading" }],
    })).toThrow(/incompatible style preset/i);
  });

  it("repairs commerce CTA buttons to primary emphasis from their label semantics", () => {
    const commerceDocument = compileSemanticElementPlan(structure, {
      elements: [
        { id: "shop_now_button", parentId: "main_section", order: 0, type: "button", name: "Shop Now Button", purpose: "Open the main purchase flow", content: "立即选购", attributes: [] },
        { id: "go_to_cart_button", parentId: "main_section", order: 1, type: "button", name: "Go to Cart", purpose: "Continue toward checkout", content: "去购物车", attributes: [] },
        { id: "learn_more_button", parentId: "main_section", order: 2, type: "button", name: "Learn More", purpose: "Explore more details before purchase", content: "了解更多", attributes: [] },
      ],
      notes: [],
    });
    const repaired = repairStylePlan(commerceDocument, {
      theme: "commerce_editorial",
      tone: "premium",
      assignments: [
        { elementId: "shop_now_button", preset: "secondary_action" },
        { elementId: "go_to_cart_button", preset: "secondary_action" },
        { elementId: "learn_more_button", preset: "secondary_action" },
      ],
      notes: [],
    });

    expect(repaired.assignments).toEqual(expect.arrayContaining([
      { elementId: "shop_now_button", preset: "primary_action" },
      { elementId: "go_to_cart_button", preset: "primary_action" },
      { elementId: "learn_more_button", preset: "secondary_action" },
    ]));
  });
});
