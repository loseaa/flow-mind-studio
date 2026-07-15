import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "./artifacts/store.js";
import { createDesignAgentGraph } from "./graph.js";
import { createInitialState, type IntentDimension } from "./state.js";

describe("mobile operational page pipeline", () => {
  it("does not confuse a mobile ecommerce workflow with a phone product page", async () => {
    const threadId = "thread_mobile_operational_quality";
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-mobile-operational-"));
    const store = createArtifactStore({ runDir, threadId });
    const graph = createDesignAgentGraph({ artifactStore: store, startNode: "content_planning" });
    const initial = createInitialState(threadId);
    const dimensions = initial.dimensions.map((dimension): IntentDimension => ({
      ...dimension,
      status: "complete",
      completeness: 1,
      confidence: 0.95,
      value: operationalDimensionValue(dimension.key),
    }));

    const result = await graph.invoke({
      ...initial,
      dimensions,
      messages: [
        { role: "user", content: "做一个手机页面", createdAt: "2026-07-11T00:00:00.000Z" },
        { role: "user", content: "电子商务，包含筛选区、指标卡、表格、表单和操作区", createdAt: "2026-07-11T00:01:00.000Z" },
      ],
    });

    expect(result.stage).toBe("completed");
    const content = await store.readArtifact<any>(result.latestArtifactRefs.content_planning);
    expect(content.output.contentPlan.archetype).toBe("operational");

    const finalArtifact = await store.readArtifact<any>(result.latestArtifactRefs.final_output);
    const document = finalArtifact.output.document;
    const count = (type: string) => document.elements.filter((element: any) => element.type === type).length;
    expect(document.canvas).toMatchObject({ viewport: "mobile", width: 375 });
    expect(count("filter")).toBeGreaterThanOrEqual(1);
    expect(count("stat")).toBeGreaterThanOrEqual(3);
    expect(count("table")).toBeGreaterThanOrEqual(1);
    expect(count("form")).toBeGreaterThanOrEqual(1);
    expect(count("button")).toBeGreaterThanOrEqual(3);
    expect(count("image")).toBe(0);
    expect(document.elements.some((element: any) => (element.layout?.fixedWidth ?? 0) > 375)).toBe(false);

    const imageArtifact = await store.readArtifact<any>(result.latestArtifactRefs.image_generation);
    expect(imageArtifact.output).toMatchObject({ generatedCount: 0, images: [] });
    const preflight = await store.readArtifact<any>(result.latestArtifactRefs.preflight_review);
    expect(preflight.output).toMatchObject({ passed: true, issues: [] });
  }, 15_000);
});

function operationalDimensionValue(key: IntentDimension["key"]) {
  if (key === "page_context") return { deviceType: "mobile", screenSize: "medium (4.5-5.5 inch)" };
  if (key === "content_structure") return { pagePurpose: "ecommerce", contentSections: ["筛选区", "指标卡", "表格", "表单", "操作区"] };
  if (key === "data_requirements") return null;
  if (key === "interaction_flow") return { userActions: "混合操作" };
  return { styleTheme: "card-based", colorScheme: "中性商务色", typography: "无衬线体" };
}

