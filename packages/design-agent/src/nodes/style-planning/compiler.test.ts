import { describe, expect, it } from "vitest";

import { compileSemanticElementPlan } from "../element-planning/compiler.js";
import { compilePageStructurePlan } from "../json-planning/compiler.js";
import { compileStylePlan } from "./compiler.js";
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
    { id: "refresh_button", parentId: "main_section", order: 1, type: "button", name: "Refresh", purpose: "Refresh data", content: "Refresh", attributes: [] },
    { id: "results_table", parentId: "main_section", order: 2, type: "table", name: "Results", purpose: "Show data", attributes: [] },
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

  it("rejects presets that are incompatible with the element type", () => {
    expect(() => compileStylePlan(document, {
      ...plan,
      assignments: [{ elementId: "refresh_button", preset: "heading" }],
    })).toThrow(/incompatible style preset/i);
  });
});
