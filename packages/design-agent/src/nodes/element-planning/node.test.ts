import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DesignDocument } from "@flowmind/shared";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import type { ContentPlan } from "../content-planning/schema.js";
import { layoutPlanningNode } from "../layout-planning/node.js";
import { visualSlotReviewNode } from "../visual-slot-review/node.js";
import { elementPlanningNode, fallbackElementPlan, resolveGeneralFallbackParents, validateElementQuality } from "./node.js";
import { elementPlanningModelOutputSchema, type SemanticElementPlan } from "./schema.js";

const semanticPlan: SemanticElementPlan = {
  elements: [
    {
      id: "page_title",
      parentId: "header_content",
      order: 0,
      type: "text",
      name: "Page Title",
      purpose: "Identify the workspace",
      content: "区域环境监测",
      attributes: [{ key: "role", value: "heading" }],
    },
    {
      id: "page_summary",
      parentId: "header_content",
      order: 1,
      type: "text",
      name: "Page Summary",
      purpose: "Summarize the workspace value",
      content: "集中查看核心指标、地图分布和重点告警。",
      attributes: [],
    },
    {
      id: "page_primary_action",
      parentId: "header_content",
      order: 2,
      type: "button",
      name: "Refresh Data",
      purpose: "Refresh the monitoring data",
      content: "刷新数据",
      attributes: [],
    },
    {
      id: "main_heading",
      parentId: "header_content",
      order: 3,
      type: "text",
      name: "Main Heading",
      purpose: "Introduce the main content region",
      content: "关键区域一览",
      attributes: [{ key: "role", value: "subheading" }],
    },
    {
      id: "main_body",
      parentId: "header_content",
      order: 4,
      type: "text",
      name: "Main Body",
      purpose: "Explain the main content region",
      content: "通过地图、表格与摘要信息快速定位风险区域。",
      attributes: [],
    },
    {
      id: "action_heading",
      parentId: "header_content",
      order: 5,
      type: "text",
      name: "Action Heading",
      purpose: "Introduce next steps",
      content: "继续操作",
      attributes: [{ key: "role", value: "subheading" }],
    },
    {
      id: "action_body",
      parentId: "header_content",
      order: 6,
      type: "text",
      name: "Action Body",
      purpose: "Explain the next action",
      content: "查看明细、筛选数据，或直接处理当前告警。",
      attributes: [],
    },
    {
      id: "environment_map",
      parentId: "main_section",
      order: 0,
      type: "image",
      name: "Environment Map",
      purpose: "Show monitoring points and risks",
      content: "区域环境监测地图",
      attributes: [{ key: "imagePrompt", value: "GIS map with environmental monitoring markers" }],
    },
  ],
  notes: ["Keep the map visible."],
};

describe("elementPlanningNode", () => {
  it("stores the semantic plan and compiles its elements into the document", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_1");
    const seenSchemas: unknown[] = [];

    const result = await elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ elementPlan: semanticPlan }) };
      },
    });

    expect(seenSchemas).toEqual([elementPlanningModelOutputSchema]);
    const elementRef = result.latestArtifactRefs?.element_planning;
    expect(elementRef).toBeDefined();
    await expect(store.readArtifact(elementRef!)).resolves.toMatchObject({
      node: "element_planning",
      status: "success",
      output: {
        elementPlan: semanticPlan,
        document: {
          elements: expect.arrayContaining([
            expect.objectContaining({ id: "page_title", type: "text", props: expect.objectContaining({ text: "区域环境监测" }) }),
            expect.objectContaining({ id: "environment_map", type: "image" }),
          ]),
        },
      },
      errors: [],
    });
  });

  it("accepts model output with top-level elements and missing attributes", async () => {
    const parsed = elementPlanningModelOutputSchema.parse({
      elements: [{
        id: "model_title",
        parentId: "main_section",
        order: 0,
        type: "text",
        name: "Model Title",
        purpose: "Introduce the product",
        content: "Xiaomi 14 Ultra",
      }],
    });

    expect(parsed.elementPlan.elements[0]).toMatchObject({
      id: "model_title",
      attributes: [],
    });
    expect(parsed.elementPlan.notes).toEqual(["Normalized model element output."]);
  });

  it("retries an invalid semantic plan before failing the node", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_retry");
    const prompts: unknown[] = [];

    const result = await elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            if (prompts.length === 1) throw new Error("Element parent does not exist");
            return { elementPlan: semanticPlan };
          },
        };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("previous element plan was rejected");
    const artifact = await store.readArtifact(result.latestArtifactRefs!.element_planning);
    expect(artifact.errors).toEqual([]);
    expect((artifact.output as { document: { elements: Array<{ id: string }> } }).document.elements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "page_title" })]));
  });

  it("falls back to the deterministic plan after both model attempts fail", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_failed");

    const result = await elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid semantic element output"); } };
      },
    });

    await expect(store.readArtifact(result.latestArtifactRefs!.element_planning)).resolves.toMatchObject({
      status: "success",
      errors: [expect.stringContaining("Retry failed")],
      output: {
        elementPlan: {
          elements: expect.arrayContaining([
            expect.objectContaining({ id: "hero_title", type: "text" }),
            expect.objectContaining({ id: "actions_primary", type: "button" }),
          ]),
          notes: expect.any(Array),
        },
        document: { elements: expect.any(Array) },
      },
    });
  });

  it("preserves the parser error tail without copying a long failed response into the retry prompt", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_long_error");
    const prompts: unknown[] = [];
    const failedResponse = "FAILED_RESPONSE_BODY_".repeat(300);
    const firstError = `Failed to parse. Text: "${failedResponse}"\nError: Unterminated string at position 4096`;
    const retryError = `Failed to parse. Text: "${failedResponse}"\nError: Missing required field notes`;

    const result = await elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            throw new Error(prompts.length === 1 ? firstError : retryError);
          },
        };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("Unterminated string at position 4096");
    expect(String(prompts[1])).not.toContain("FAILED_RESPONSE_BODY_FAILED_RESPONSE_BODY");

    const artifact = await store.readArtifact(result.latestArtifactRefs!.element_planning);
    expect(artifact.errors[0]).toContain("Failed to parse. Text");
    expect(artifact.errors[0]).toContain("Unterminated string at position 4096");
    expect(artifact.errors[0]).toContain("Missing required field notes");
  });

  it("builds a complete product fallback against non-canonical container ids", () => {
    const plan = fallbackElementPlan(
      {
        messages: [{
          role: "user",
          content: "生成一款新旗舰手机的产品发布落地页",
          createdAt: "2026-07-11T00:00:00.000Z",
        }],
      },
      productDocument(),
      productContentPlan(),
    );

    expect(plan.elements.some((element) => element.id === "fallback_title")).toBe(false);
    expect(plan.elements.find((element) => element.id === "hero_title")?.parentId).toBe("stk-hero-copy");
    expect(plan.elements.find((element) => element.id === "cta_primary_action")?.parentId).toBe("stk-cta-actions");
    expect(plan.elements.every((element) => productDocument().elements.some((parent) => parent.id === element.parentId))).toBe(true);
    expect(() => validateElementQuality(plan, productContentPlan(), productDocument())).not.toThrow();
  });

  it("rejects an empty general element plan and resolves semantic parent groups", () => {
    expect(() => validateElementQuality({ elements: [], notes: [] }, generalContentPlan(), generalDocument())).toThrow(
      /General element plan requires at least 6 text elements/i,
    );

    expect(resolveGeneralFallbackParents(generalDocument())).toMatchObject({
      heroCopy: "hero-copy",
      contentHeading: "content-heading-group",
      contentBody: "content-body-grid",
      actionsHeading: "actions-heading-group",
      actionsCta: "actions-cta-group",
    });
  });

  it("builds a complete general fallback against semantic homepage groups", () => {
    const plan = fallbackElementPlan(
      {
        messages: [{
          role: "user",
          content: "做一个中年人电商首页",
          createdAt: "2026-07-11T00:00:00.000Z",
        }],
      },
      generalDocument(),
      generalContentPlan(),
    );

    expect(plan.elements.find((element) => element.id === "hero_title")?.parentId).toBe("hero-copy");
    expect(plan.elements.find((element) => element.id === "content_title")?.parentId).toBe("content-heading-group");
    expect(plan.elements.find((element) => element.id === "actions_primary")?.parentId).toBe("actions-cta-group");
    expect(() => validateElementQuality(plan, generalContentPlan(), generalDocument())).not.toThrow();
  });
});

async function stateWithLayoutPlanning(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-element-"));
  const store = createArtifactStore({ runDir, threadId });
  let state: DesignAgentState = createInitialState(threadId);
  state = mergeState(state, await jsonPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await layoutPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await visualSlotReviewNode(state, { artifactStore: store }));
  return { store, state };
}

function mergeState(state: DesignAgentState, update: Partial<DesignAgentState>): DesignAgentState {
  return {
    ...state,
    ...update,
    latestArtifactRefs: update.latestArtifactRefs ?? state.latestArtifactRefs,
    events: update.events ?? state.events,
  };
}

function productContentPlan(): ContentPlan {
  return {
    archetype: "product_marketing",
    subject: "新一代旗舰手机",
    narrative: "Introduce the product with a launch story.",
    sections: [
      { id: "hero", role: "hero", purpose: "Hero", requiredBlocks: ["headline", "body", "primary_action"] },
      { id: "proof", role: "proof", purpose: "Proof", requiredBlocks: ["section_heading", "metric"] },
      { id: "features", role: "features", purpose: "Features", requiredBlocks: ["section_heading", "feature_card"] },
      { id: "story", role: "story", purpose: "Story", requiredBlocks: ["section_heading", "body"] },
      { id: "specifications", role: "specifications", purpose: "Specifications", requiredBlocks: ["section_heading", "specification"] },
      { id: "social_proof", role: "social_proof", purpose: "Social proof", requiredBlocks: ["section_heading", "testimonial"] },
      { id: "cta", role: "cta", purpose: "CTA", requiredBlocks: ["headline", "body", "primary_action"] },
    ],
    qualityTargets: {
      minimumSections: 7,
      minimumTreeDepth: 4,
      minimumTextElements: 15,
      minimumActions: 2,
      minimumStats: 3,
      maximumImages: 5,
    },
  };
}

function generalContentPlan(): ContentPlan {
  return {
    archetype: "general",
    subject: "首页",
    narrative: "Introduce 首页, organize its primary information and workflows, and end with clear next actions.",
    sections: [
      { id: "introduction", role: "hero", purpose: "Introduce the page purpose and primary action.", requiredBlocks: ["headline", "body", "primary_action"] },
      { id: "content", role: "content", purpose: "Present the core information or workflow.", requiredBlocks: ["section_heading", "body"] },
      { id: "actions", role: "actions", purpose: "Provide supporting information and next actions.", requiredBlocks: ["section_heading", "primary_action"] },
    ],
    qualityTargets: {
      minimumSections: 3,
      minimumTreeDepth: 3,
      minimumTextElements: 6,
      minimumActions: 1,
      minimumStats: 0,
      maximumImages: 5,
    },
  };
}

function productDocument(): DesignDocument {
  const container = (id: string, name: string, type: "page" | "section" | "stack", purpose: string) => ({
    id,
    name,
    type,
    props: { purpose },
    layout: { display: "flex", direction: "vertical", gap: "md", width: "fill" },
    style: {
      base: {
        backgroundColor: "muted",
        radius: "none",
        border: { width: "none", style: "none", color: "border" },
        text: {
          color: "textPrimary",
          fontFamily: "sans",
          fontSize: "md",
          fontWeight: "regular",
          lineHeight: "normal",
          align: "left",
        },
      },
      container: { shadow: "none", overflow: "visible", surface: "flat" },
    },
  });

  return {
    schemaVersion: "fm-design/v1",
    id: "root",
    name: "Football Introduction",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "root", children: [] },
    elements: [
      container("root", "Football Introduction", "page", "Introduce football to teenagers."),
      container("sec-hero", "Hero", "section", "Hero section"),
      container("stk-hero-copy", "Hero Copy", "stack", "Contains hero text content."),
      container("stk-hero-actions", "Actions", "stack", "Container for primary and secondary call-to-action buttons."),
      container("sec-proof", "Proof", "section", "Proof section"),
      container("stk-proof-content", "Proof Content", "stack", "Layout container for proof heading."),
      container("stk-proof-metrics", "Metrics", "stack", "Row of metric blocks."),
      container("sec-features", "Features", "section", "Features section"),
      container("stk-features-intro", "Features Intro", "stack", "Contains section heading and intro body for features."),
      container("stk-features-grid", "Feature Grid", "stack", "Grid container for feature cards."),
      container("stk-feature-card-1", "Feature Card 1", "stack", "Feature card one."),
      container("stk-feature-card-2", "Feature Card 2", "stack", "Feature card two."),
      container("sec-rules", "规则说明", "section", "Rules section"),
      container("stk-rules-content", "Rules Content", "stack", "Container for rules heading and body."),
      container("sec-specs", "Specifications", "section", "Specifications section"),
      container("stk-specs-content", "stack", "stack", "Container for specs heading."),
      container("stk-specs-list", "Specs List", "stack", "List of specifications."),
      container("sec-social", "Social Proof", "section", "Social proof section"),
      container("stk-social-content", "Social Content", "stack", "Container for social proof heading."),
      container("stk-testimonials", "Testimonials", "stack", "Testimonials content"),
      container("sec-cta", "CTA", "section", "Close the page with final action."),
      container("stk-cta-content", "CTA Content", "stack", "CTA copy content."),
      container("stk-cta-actions", "CTA Actions", "stack", "CTA buttons."),
    ],
    variables: {},
  } as DesignDocument;
}

function generalDocument(): DesignDocument {
  const container = (id: string, name: string, type: "page" | "section" | "stack", purpose: string) => ({
    id,
    name,
    type,
    props: { purpose },
    layout: { display: "flex", direction: "vertical", gap: "md", width: "fill" },
    style: {
      base: {
        backgroundColor: "muted",
        radius: "none",
        border: { width: "none", style: "none", color: "border" },
        text: {
          color: "textPrimary",
          fontFamily: "sans",
          fontSize: "md",
          fontWeight: "regular",
          lineHeight: "normal",
          align: "left",
        },
      },
      container: { shadow: "none", overflow: "visible", surface: "flat" },
    },
  });

  return {
    schemaVersion: "fm-design/v1",
    id: "root",
    name: "中年人电商首页",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "root", children: [] },
    elements: [
      container("root", "中年人电商首页", "page", "面向中年人买家的电商平台首页。"),
      container("section-hero", "英雄区域", "section", "页面头部，包含介绍性标题、正文和主要行动号召按钮。"),
      container("hero-layout", "英雄区布局", "stack", "水平排列英雄区的文案和媒体内容。"),
      container("hero-copy", "英雄文案组", "stack", "包含主标题、副标题和主要行动按钮的文案区域。"),
      container("hero-media", "英雄媒体组", "stack", "放置一张吸引人的商品或场景大图。"),
      container("section-content", "核心内容区", "section", "展示核心商品信息和工作流。"),
      container("content-layout", "内容区布局", "stack", "分组展示标题和商品网格。"),
      container("content-heading-group", "内容标题组", "stack", "放置内容区标题和说明文字。"),
      container("content-body-grid", "商品网格", "stack", "以网格形式展示推荐商品。"),
      container("section-actions", "行动引导区", "section", "提供最终的说明和行动按钮。"),
      container("actions-layout", "行动区布局", "stack", "组织标题和 CTA 按钮。"),
      container("actions-heading-group", "行动标题组", "stack", "放置行动区标题与描述。"),
      container("actions-cta-group", "按钮组", "stack", "放置主要与次要行动按钮。"),
    ],
    variables: {},
  } as DesignDocument;
}
