import { describe, expect, it } from "vitest";

import { createInitialState } from "../../state.js";
import { buildContentPlan } from "./node.js";

describe("content planning", () => {
  it("creates a complete product narrative contract", () => {
    const state = createInitialState("content_product");
    state.messages = [{ role: "user", content: "生成一款新旗舰手机产品发布落地页", createdAt: "2026-07-11" }];

    const plan = buildContentPlan(state);

    expect(plan.archetype).toBe("product_marketing");
    expect(plan.sections.map((section) => section.role)).toEqual([
      "hero",
      "proof",
      "features",
      "story",
      "specifications",
      "social_proof",
      "cta",
    ]);
    expect(plan.qualityTargets).toMatchObject({ minimumSections: 7, minimumTextElements: 15, minimumActions: 2, minimumStats: 3 });
  });

  it("routes dashboards to the operational contract", () => {
    const state = createInitialState("content_general");
    state.messages = [{ role: "user", content: "Create an internal approval dashboard", createdAt: "2026-07-11" }];

    const plan = buildContentPlan(state);

    expect(plan.archetype).toBe("operational");
    expect(plan.sections.map((section) => section.role)).toEqual(["hero", "filters", "metrics", "table", "form", "actions"]);
  });

  it("does not confuse a mobile page with a phone product", () => {
    const state = createInitialState("content_mobile_page");
    state.messages = [{ role: "user", content: "做一个手机页面，包含筛选区、指标卡、表格、表单和操作区", createdAt: "2026-07-11" }];

    expect(buildContentPlan(state).archetype).toBe("operational");
  });
});
