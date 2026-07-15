import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "./artifacts/store.js";
import { createDesignAgentGraph } from "./graph.js";
import { createInitialState, type IntentDimension } from "./state.js";

describe("product page quality pipeline", () => {
  it("preserves rich copy and compiles nested product layouts through final output", async () => {
    const threadId = "thread_product_quality";
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-product-quality-"));
    const store = createArtifactStore({ runDir, threadId });
    const graph = createDesignAgentGraph({
      artifactStore: store,
      startNode: "content_planning",
      createImageGeneration: (request) => ({
        url: `https://cdn.example.com/product-quality/${request.assetId}.png`,
        provider: "test",
        model: "product-quality-fixture",
      }),
    });
    const initial = createInitialState(threadId);
    const dimensions = initial.dimensions.map((dimension): IntentDimension => ({
      ...dimension,
      status: "complete",
      completeness: 1,
      confidence: 0.95,
      value: productDimensionValue(dimension.key),
    }));

    const result = await graph.invoke({
      ...initial,
      dimensions,
      messages: [{
        role: "user",
        content: "生成一款新旗舰手机的产品发布落地页，突出性能、影像、续航和购买转化",
        createdAt: "2026-07-11T00:00:00.000Z",
      }],
    });

    expect(result.stage).toBe("completed");
    expect(result.latestArtifactRefs.content_planning).toBeDefined();
    const finalArtifact = await store.readArtifact<any>(result.latestArtifactRefs.final_output);
    const document = finalArtifact.output.document;
    const typeCount = (type: string) => document.elements.filter((element: any) => element.type === type).length;

    expect(typeCount("text")).toBeGreaterThanOrEqual(20);
    expect(typeCount("button")).toBeGreaterThanOrEqual(4);
    expect(typeCount("stat")).toBeGreaterThanOrEqual(9);
    expect(typeCount("image")).toBe(3);
    expect(treeDepth(document.tree)).toBeGreaterThanOrEqual(4);
    expect(document.elements.find((element: any) => element.id === "hero_layout")?.layout).toMatchObject({ direction: "horizontal", wrap: true });
    expect(document.elements.find((element: any) => element.id === "features_grid")?.layout).toMatchObject({ direction: "horizontal", wrap: true });
    expect(document.elements.find((element: any) => element.id === "story_layout")?.layout).toMatchObject({ direction: "horizontal", wrap: true });
    expect(document.variables.agentPlanning.contentPlan).toMatchObject({ archetype: "product_marketing" });

    const reviewArtifact = await store.readArtifact<any>(result.latestArtifactRefs.visual_review);
    expect(reviewArtifact.output.review).toMatchObject({ passed: true });
    expect(reviewArtifact.output.review.issues).toEqual([]);
  }, 15_000);
});

function productDimensionValue(key: IntentDimension["key"]) {
  if (key === "page_context") return { pageType: "product launch landing page", productName: "新一代旗舰手机", targetAudience: "科技产品消费者" };
  if (key === "content_structure") return { sections: ["hero", "features", "specifications", "reviews", "purchase"] };
  if (key === "data_requirements") return { fields: ["performance", "camera", "battery", "price"] };
  if (key === "interaction_flow") return { actions: ["explore", "view specifications", "buy"] };
  return { layoutStyle: "premium product storytelling", imageStyle: "studio product photography" };
}

function treeDepth(node: { children?: Array<{ children?: any[] }> }): number {
  return 1 + Math.max(0, ...(node.children ?? []).map(treeDepth));
}
