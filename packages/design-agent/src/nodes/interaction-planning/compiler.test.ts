import { describe, expect, it } from "vitest";

import { compileSemanticElementPlan } from "../element-planning/compiler.js";
import { compilePageStructurePlan } from "../json-planning/compiler.js";
import { compileInteractionPlan } from "./compiler.js";
import type { InteractionPlan } from "./schema.js";

const structure = compilePageStructurePlan({
  document: { id: "dashboard", name: "Dashboard", viewport: "desktop", width: 1440, background: "muted" },
  nodes: [
    { id: "page_root", parentId: null, order: 0, type: "page", name: "Page", purpose: "Root" },
    { id: "main_section", parentId: "page_root", order: 0, type: "section", name: "Main", purpose: "Workspace" },
  ],
});

const document = compileSemanticElementPlan(structure, {
  elements: [
    { id: "refresh_button", parentId: "main_section", order: 0, type: "button", name: "Refresh", purpose: "Refresh data", content: "刷新", attributes: [] },
    { id: "monitoring_table", parentId: "main_section", order: 1, type: "table", name: "Monitoring Table", purpose: "Show results", attributes: [] },
  ],
  notes: [],
});

const plan: InteractionPlan = {
  interactions: [{
    id: "refresh_monitoring_data",
    sourceElementId: "refresh_button",
    event: "click",
    action: "refresh",
    targetElementId: "monitoring_table",
    description: "Refresh monitoring data",
    payload: [{ key: "scope", value: "current-region" }],
  }],
  notes: ["Keep refresh explicit."],
};

describe("compileInteractionPlan", () => {
  it("stores validated interaction edges in document variables", () => {
    const compiled = compileInteractionPlan(document, plan);
    expect(compiled.variables.interactions).toEqual([{ ...plan.interactions[0], payload: { scope: "current-region" } }]);
  });

  it("rejects a missing source element", () => {
    expect(() => compileInteractionPlan(document, {
      ...plan,
      interactions: [{ ...plan.interactions[0], sourceElementId: "missing_button" }],
    })).toThrow(/missing source element/i);
  });

  it("rejects a missing target element", () => {
    expect(() => compileInteractionPlan(document, {
      ...plan,
      interactions: [{ ...plan.interactions[0], targetElementId: "missing_table" }],
    })).toThrow(/missing target element/i);
  });
});
