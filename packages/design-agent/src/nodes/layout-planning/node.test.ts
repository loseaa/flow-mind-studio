import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "./node.js";
import { layoutPlanningModelOutputSchema, type LayoutPlan } from "./schema.js";

const layoutPlan: LayoutPlan = {
  strategy: "product_showcase",
  rootId: "page_root",
  sectionIds: ["header_section", "main_section", "footer_section"],
  rhythm: "standard",
  hierarchy: { primaryVisualSlotId: "hero_slot" },
  imageSlots: [
    imageSlot("hero_slot", "header_section", "hero", "background", "16:9", 480, 1536, 864, "left"),
    imageSlot("feature_slot", "main_section", "section", "inline", "4:3", 360, 1200, 900, "none"),
    imageSlot("detail_slot", "footer_section", "section", "inline", "4:3", 360, 1200, 900, "none"),
  ],
  notes: ["Use a grid-ready page layout."],
};

describe("layoutPlanningNode", () => {
  it("validates and stores a structured layout plan with three image slots", async () => {
    const { store, state } = await stateWithJson("thread_layout_1");
    const seenSchemas: unknown[] = [];
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ layoutPlan }) };
      },
    });

    expect(seenSchemas).toEqual([layoutPlanningModelOutputSchema]);
    await expect(store.readArtifact(result.latestArtifactRefs!.layout_planning)).resolves.toMatchObject({
      status: "success",
      output: { layoutPlan },
      errors: [],
    });
  });

  it("repairs an image slot with an invalid parent", async () => {
    const { store, state } = await stateWithJson("thread_layout_retry");
    const prompts: unknown[] = [];
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke(input) {
          prompts.push(input);
          return prompts.length === 1
            ? { layoutPlan: { ...layoutPlan, imageSlots: [{ ...layoutPlan.imageSlots[0], parentId: "missing" }, ...layoutPlan.imageSlots.slice(1)] } }
            : { layoutPlan };
        } };
      },
    });

    expect(prompts).toHaveLength(1);
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    expect(artifact.errors).toEqual([]);
    const output = artifact.output as {
      layoutPlan: LayoutPlan;
      document: { elements: Array<{ id: string; type: string }> };
    };
    const parentTypes = new Map(output.document.elements.map((element) => [element.id, element.type]));
    expect(output.layoutPlan.imageSlots.every((slot) => ["page", "section", "stack"].includes(parentTypes.get(slot.parentId) ?? ""))).toBe(true);
  });

  it("retries duplicate image slot ids", async () => {
    const { store, state } = await stateWithJson("thread_layout_duplicate_slot");
    let attempts = 0;
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke() {
          attempts += 1;
          return attempts === 1
            ? { layoutPlan: { ...layoutPlan, imageSlots: layoutPlan.imageSlots.map((slot) => ({ ...slot, id: "duplicate" })) } }
            : { layoutPlan };
        } };
      },
    });

    expect(attempts).toBe(2);
    await expect(store.readArtifact(result.latestArtifactRefs!.layout_planning)).resolves.toMatchObject({
      status: "success",
      output: { layoutPlan },
    });
  });

  it("creates no image slots offline when the user explicitly rejects images", async () => {
    const { store, state } = await stateWithJson("thread_layout_no_images", "做一个设置页，不要图片");
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);

    expect(artifact.output).toMatchObject({
      layoutPlan: { imageSlots: [], hierarchy: {}, strategy: "product_showcase", rhythm: "standard" },
    });
  });

  it("creates three compliant image slots offline by default", async () => {
    const { store, state } = await stateWithJson("thread_layout_default_images", "做一个产品介绍页");
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const offlinePlan = (artifact.output as { layoutPlan: LayoutPlan }).layoutPlan;

    expect(offlinePlan.imageSlots).toHaveLength(3);
    expect(offlinePlan.hierarchy.primaryVisualSlotId).toBe(offlinePlan.imageSlots[0].id);
    expect(offlinePlan.imageSlots[0]).toMatchObject({
      role: "hero",
      placement: "inline",
      parentId: "hero_media",
      display: { aspectRatio: "16:9", width: "fill", maxHeight: 480 },
      generation: { width: 1536, height: 864, safeArea: "left" },
    });
  });

  it("repairs product image slots back to semantic hero and story media containers", async () => {
    const { store, state } = await stateWithJson(
      "thread_layout_semantic_media",
      "做一个菠萝12预售页",
      undefined,
      productStructurePlan(),
    );
    const baseline = await layoutPlanningNode(state, { artifactStore: store });
    const baselineArtifact = await store.readArtifact(baseline.latestArtifactRefs!.layout_planning);
    const baselinePlan = (baselineArtifact.output as { layoutPlan: LayoutPlan }).layoutPlan;
    const badPlan: LayoutPlan = {
      ...baselinePlan,
      imageSlots: baselinePlan.imageSlots.map((slot, index) => {
        if (slot.role === "hero") {
          return { ...slot, parentId: "hero_section", placement: "background" };
        }
        if (index === 1) {
          return { ...slot, parentId: "proof_section", placement: "inline" };
        }
        if (index === 2) {
          return { ...slot, parentId: "features_section", placement: "inline" };
        }
        return slot;
      }),
    };

    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => ({ layoutPlan: badPlan }) };
      },
    });

    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const output = artifact.output as { layoutPlan: LayoutPlan };
    const heroSlot = output.layoutPlan.imageSlots.find((slot) => slot.role === "hero");

    expect(heroSlot).toMatchObject({
      parentId: "hero_media",
      placement: "inline",
    });
    expect(output.layoutPlan.imageSlots.some((slot) => slot.parentId === "story_media")).toBe(true);
    expect(output.layoutPlan.imageSlots.some((slot) => slot.parentId === "hero_section" && slot.role === "hero")).toBe(false);
  });

  it("infers semantic container layouts for a general commerce homepage fallback", async () => {
    const { store, state } = await stateWithJson("thread_layout_general_semantic", undefined, undefined, generalHomepageStructurePlan());
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const output = artifact.output as {
      document: { elements: Array<{ id: string; layout: Record<string, unknown> }> };
    };
    const byId = new Map(output.document.elements.map((element) => [element.id, element.layout]));

    expect(byId.get("hero-layout")).toMatchObject({ direction: "horizontal", wrap: true });
    expect(byId.get("content-body-grid")).toMatchObject({ direction: "horizontal", wrap: true });
    expect(byId.get("actions-cta-group")).toMatchObject({ direction: "horizontal", wrap: true });
    expect(byId.get("content-heading-group")).toMatchObject({ direction: "vertical" });
  });

  it("repairs model-provided vertical layouts when semantic groups require horizontal composition", async () => {
    const { store, state } = await stateWithJson("thread_layout_general_repair", undefined, undefined, generalHomepageStructurePlan());
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke: () => ({
            layoutPlan: {
              strategy: "editorial_sections",
              rootId: "root",
              sectionIds: ["section-hero", "section-content", "section-actions"],
              rhythm: "standard",
              hierarchy: {},
              imageSlots: [
                imageSlot("hero_slot", "section-hero", "hero", "background", "16:9", 480, 1536, 864, "left"),
                imageSlot("content_slot", "section-content", "section", "inline", "4:3", 360, 1200, 900, "none"),
                imageSlot("actions_slot", "section-actions", "section", "inline", "4:3", 360, 1200, 900, "none"),
              ],
              containerLayouts: [
                { elementId: "hero-layout", layout: { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" } },
                { elementId: "content-body-grid", layout: { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" } },
                { elementId: "actions-cta-group", layout: { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" } },
              ],
              notes: ["Model returned conservative vertical stacks."],
            },
          }),
        };
      },
    });

    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const output = artifact.output as {
      layoutPlan: { containerLayouts: Array<{ elementId: string; layout: Record<string, unknown> }> };
    };
    const byId = new Map(output.layoutPlan.containerLayouts.map((assignment) => [assignment.elementId, assignment.layout]));

    expect(byId.get("hero-layout")).toMatchObject({ direction: "horizontal", wrap: true });
    expect(byId.get("content-body-grid")).toMatchObject({ direction: "horizontal", wrap: true });
    expect(byId.get("actions-cta-group")).toMatchObject({ direction: "horizontal", wrap: true });
  });

  it.each([0, 1, 2])("creates valid fallback slots with %i sections", async (sectionCount) => {
    const { store, state } = await stateWithJson(
      "thread_layout_" + sectionCount + "_sections",
      "Create a product page with images",
      sectionCount,
    );
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const output = artifact.output as {
      layoutPlan: LayoutPlan;
      document: { elements: Array<{ id: string; type: string }> };
    };
    const { imageSlots } = output.layoutPlan;
    const elementIds = new Set(output.document.elements.map((element) => element.id));
    const elementTypes = new Map(output.document.elements.map((element) => [element.id, element.type]));

    expect(layoutPlanningModelOutputSchema.parse({ layoutPlan: output.layoutPlan }).layoutPlan).toEqual(output.layoutPlan);
    expect(imageSlots).toHaveLength(3);
    expect(new Set(imageSlots.map((slot) => slot.id))).toHaveLength(3);
    expect(imageSlots.every((slot) => !elementIds.has(slot.id))).toBe(true);
    expect(imageSlots.every((slot) => ["page", "section", "stack"].includes(elementTypes.get(slot.parentId) ?? ""))).toBe(true);

    const primaryCounts = new Map<string, number>();
    for (const slot of imageSlots.filter((item) => item.role === "hero" || item.role === "section")) {
      primaryCounts.set(slot.parentId, (primaryCounts.get(slot.parentId) ?? 0) + 1);
    }
    expect([...primaryCounts.values()].every((count) => count <= 1)).toBe(true);
  });

  it("falls back to a deterministic layout after both model attempts fail", async () => {
    const { store, state } = await stateWithJson("thread_layout_failed");
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid layout output"); } };
      },
    });

    await expect(store.readArtifact(result.latestArtifactRefs!.layout_planning)).resolves.toMatchObject({
      status: "success",
      output: { layoutPlan: { strategy: "product_showcase" }, document: { id: "design_generated_page" } },
      errors: [expect.stringContaining("Retry failed")],
    });
  });
});

async function stateWithJson(threadId: string, message?: string, sectionCount?: number, structurePlanOverride?: Record<string, unknown>) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-layout-"));
  const store = createArtifactStore({ runDir, threadId });
  const initial = createInitialState(threadId);
  if (message) {
    initial.messages.push({ role: "user", content: message, createdAt: "2026-07-06T00:00:00.000Z" });
  }
  const update = await jsonPlanningNode(initial, {
    artifactStore: store,
    createStructuredOutput: structurePlanOverride
      ? () => ({ invoke: () => ({ structurePlan: structurePlanOverride }) })
      : sectionCount === undefined
        ? undefined
        : () => ({ invoke: () => ({ structurePlan: structurePlanWithSections(sectionCount) }) }),
  });
  const state: DesignAgentState = {
    ...initial,
    ...update,
    latestArtifactRefs: update.latestArtifactRefs ?? initial.latestArtifactRefs,
    events: update.events ?? initial.events,
  };
  return { store, state };
}

function structurePlanWithSections(sectionCount: number) {
  return {
    document: {
      id: "design_" + sectionCount + "_sections",
      name: sectionCount + " Section Design",
      viewport: "desktop" as const,
      width: 1440,
      background: "muted" as const,
    },
    nodes: [
      {
        id: "page_root",
        parentId: null,
        order: 0,
        type: "page" as const,
        name: "Page",
        purpose: "Application root",
      },
      ...Array.from({ length: sectionCount }, (_, index) => ({
        id: "section_" + (index + 1),
        parentId: "page_root",
        order: index,
        type: "section" as const,
        name: "Section " + (index + 1),
        purpose: "Content region " + (index + 1),
      })),
    ],
  };
}

function generalHomepageStructurePlan() {
  return {
    document: {
      id: "general_homepage",
      name: "中年人电商首页",
      viewport: "desktop" as const,
      width: 1440,
      background: "muted" as const,
    },
    nodes: [
      { id: "root", parentId: null, order: 0, type: "page" as const, name: "中年人电商首页", purpose: "面向中年人买家的电商平台首页。" },
      { id: "section-hero", parentId: "root", order: 0, type: "section" as const, name: "英雄区域", purpose: "页面头部，包含介绍性标题、正文和主要行动号召按钮。" },
      { id: "hero-layout", parentId: "section-hero", order: 0, type: "stack" as const, name: "英雄区布局", purpose: "水平排列英雄区的文案和媒体内容，左侧文案右侧大图。" },
      { id: "hero-copy", parentId: "hero-layout", order: 0, type: "stack" as const, name: "英雄文案组", purpose: "包含主标题、副标题和主要行动按钮的文案区域。" },
      { id: "hero-media", parentId: "hero-layout", order: 1, type: "stack" as const, name: "英雄媒体组", purpose: "放置一张吸引人的商品或场景大图。" },
      { id: "section-content", parentId: "root", order: 1, type: "section" as const, name: "核心内容区", purpose: "展示核心商品信息和工作流。" },
      { id: "content-layout", parentId: "section-content", order: 0, type: "stack" as const, name: "内容区布局", purpose: "分组展示标题和商品网格。" },
      { id: "content-heading-group", parentId: "content-layout", order: 0, type: "stack" as const, name: "内容标题组", purpose: "放置内容区标题和说明文字。" },
      { id: "content-body-grid", parentId: "content-layout", order: 1, type: "stack" as const, name: "商品网格", purpose: "以网格形式展示推荐商品。" },
      { id: "section-actions", parentId: "root", order: 2, type: "section" as const, name: "行动引导区", purpose: "提供最终的说明和行动按钮。" },
      { id: "actions-layout", parentId: "section-actions", order: 0, type: "stack" as const, name: "行动区布局", purpose: "组织标题和 CTA 按钮。" },
      { id: "actions-heading-group", parentId: "actions-layout", order: 0, type: "stack" as const, name: "行动标题组", purpose: "放置行动区标题与描述。" },
      { id: "actions-cta-group", parentId: "actions-layout", order: 1, type: "stack" as const, name: "按钮组", purpose: "放置主要与次要行动按钮。" },
    ],
  };
}

function productStructurePlan() {
  return {
    document: {
      id: "page_root",
      name: "菠萝12 预售页",
      viewport: "desktop" as const,
      width: 1440,
      background: "muted" as const,
    },
    nodes: [
      { id: "page_root", parentId: null, order: 0, type: "page" as const, name: "Product Page", purpose: "Tell a complete product launch story and convert interest into action" },
      { id: "hero_section", parentId: "page_root", order: 0, type: "section" as const, name: "Hero", purpose: "Establish the product promise, audience value, primary actions, and hero visual" },
      { id: "hero_layout", parentId: "hero_section", order: 0, type: "stack" as const, name: "Hero Split Layout", purpose: "Arrange hero copy and product visual side by side" },
      { id: "hero_copy", parentId: "hero_layout", order: 0, type: "stack" as const, name: "Hero Copy", purpose: "Group eyebrow, title, supporting copy, and conversion actions" },
      { id: "hero_actions", parentId: "hero_copy", order: 0, type: "stack" as const, name: "Hero Actions", purpose: "Group primary and secondary product actions" },
      { id: "hero_media", parentId: "hero_layout", order: 1, type: "stack" as const, name: "Hero Media", purpose: "Contain the primary product visual" },
      { id: "proof_section", parentId: "page_root", order: 1, type: "section" as const, name: "Proof", purpose: "Support the product promise with measurable evidence" },
      { id: "proof_intro", parentId: "proof_section", order: 0, type: "stack" as const, name: "Proof Introduction", purpose: "Introduce the evidence behind the product promise" },
      { id: "proof_metrics", parentId: "proof_section", order: 1, type: "stack" as const, name: "Proof Metrics", purpose: "Present key product metrics in one scannable row" },
      { id: "features_section", parentId: "page_root", order: 2, type: "section" as const, name: "Core Features", purpose: "Explain the product's strongest differentiated capabilities" },
      { id: "features_intro", parentId: "features_section", order: 0, type: "stack" as const, name: "Features Introduction", purpose: "Introduce the core capability set" },
      { id: "features_grid", parentId: "features_section", order: 1, type: "stack" as const, name: "Feature Grid", purpose: "Arrange feature cards in a responsive visual grid" },
      { id: "feature_card_1", parentId: "features_grid", order: 0, type: "stack" as const, name: "Feature Card One", purpose: "Explain the first core capability with a title and supporting copy" },
      { id: "feature_card_2", parentId: "features_grid", order: 1, type: "stack" as const, name: "Feature Card Two", purpose: "Explain the second core capability with a title and supporting copy" },
      { id: "feature_card_3", parentId: "features_grid", order: 2, type: "stack" as const, name: "Feature Card Three", purpose: "Explain the third core capability with a title and supporting copy" },
      { id: "story_section", parentId: "page_root", order: 3, type: "section" as const, name: "Feature Story", purpose: "Turn one flagship capability into a rich image-and-copy narrative" },
      { id: "story_layout", parentId: "story_section", order: 0, type: "stack" as const, name: "Story Split Layout", purpose: "Arrange the supporting visual beside explanatory copy" },
      { id: "story_media", parentId: "story_layout", order: 0, type: "stack" as const, name: "Story Media", purpose: "Contain the supporting feature visual" },
      { id: "story_copy", parentId: "story_layout", order: 1, type: "stack" as const, name: "Story Copy", purpose: "Explain the flagship capability with layered editorial copy" },
      { id: "specifications_section", parentId: "page_root", order: 4, type: "section" as const, name: "Specifications", purpose: "Present key specifications and purchasing facts" },
      { id: "specifications_intro", parentId: "specifications_section", order: 0, type: "stack" as const, name: "Specifications Introduction", purpose: "Introduce the product specification summary" },
      { id: "specifications_grid", parentId: "specifications_section", order: 1, type: "stack" as const, name: "Specifications Grid", purpose: "Arrange key specifications for fast comparison" },
      { id: "social_section", parentId: "page_root", order: 5, type: "section" as const, name: "Social Proof", purpose: "Reduce uncertainty with audience-oriented proof" },
      { id: "social_intro", parentId: "social_section", order: 0, type: "stack" as const, name: "Social Proof Introduction", purpose: "Introduce customer or expert proof" },
      { id: "social_grid", parentId: "social_section", order: 1, type: "stack" as const, name: "Testimonial Grid", purpose: "Group concise testimonials and ratings" },
      { id: "cta_section", parentId: "page_root", order: 6, type: "section" as const, name: "Final Call to Action", purpose: "Close the product story with a clear decision" },
      { id: "cta_copy", parentId: "cta_section", order: 0, type: "stack" as const, name: "CTA Copy", purpose: "Group final headline, supporting copy, and purchase reassurance" },
      { id: "cta_actions", parentId: "cta_section", order: 1, type: "stack" as const, name: "CTA Actions", purpose: "Group final primary and secondary actions" },
    ],
  };
}

function imageSlot(
  id: string,
  parentId: string,
  role: "hero" | "section",
  placement: "background" | "inline",
  aspectRatio: "16:9" | "4:3",
  maxHeight: number,
  width: number,
  height: number,
  safeArea: "left" | "none",
) {
  return {
    id,
    parentId,
    role,
    placement,
    display: {
      aspectRatio,
      width: "fill" as const,
      maxHeight,
      objectFit: "cover" as const,
      focalPoint: "center" as const,
    },
    generation: { width, height, safeArea },
  };
}
