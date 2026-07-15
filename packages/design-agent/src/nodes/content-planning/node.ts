import type { DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { contentPlanSchema, type ContentPlan } from "./schema.js";

export async function contentPlanningNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const inputRefs = state.latestArtifactRefs.intent_compaction
    ? [state.latestArtifactRefs.intent_compaction]
    : [];
  const contentPlan = buildContentPlan(state);
  return writePipelineArtifact({
    state,
    options,
    node: "content_planning",
    stage: "content_planning",
    inputRefs,
    output: { contentPlan },
  });
}

export function buildContentPlan(state: Pick<DesignAgentState, "messages" | "dimensions">): ContentPlan {
  const context = collectIntentText(state);
  const subject = inferSubject(state, context);
  if (isOperationalIntent(context)) {
    return contentPlanSchema.parse({
      archetype: "operational",
      subject,
      narrative: `Help users operate ${subject} efficiently with a compact mobile-first flow: filter information, scan key metrics, inspect records, complete a form, and take the next action.`,
      sections: [
        { id: "header", role: "hero", purpose: "Establish page context and the most important action without marketing-style hero treatment.", requiredBlocks: ["headline", "body", "primary_action"] },
        { id: "filters", role: "filters", purpose: "Narrow the visible ecommerce records with compact controls.", requiredBlocks: ["section_heading", "filter"] },
        { id: "metrics", role: "metrics", purpose: "Summarize the most important ecommerce indicators for rapid scanning.", requiredBlocks: ["section_heading", "metric"] },
        { id: "table", role: "table", purpose: "Present ecommerce records in a structured, horizontally scrollable data region.", requiredBlocks: ["section_heading", "table"] },
        { id: "form", role: "form", purpose: "Collect or edit the information required by the ecommerce workflow.", requiredBlocks: ["section_heading", "form"] },
        { id: "actions", role: "actions", purpose: "Group the primary and secondary workflow actions.", requiredBlocks: ["primary_action", "secondary_action"] },
      ],
      qualityTargets: {
        minimumSections: 6,
        minimumTreeDepth: 3,
        minimumTextElements: 8,
        minimumActions: 2,
        minimumStats: 3,
        maximumImages: 0,
      },
    });
  }
  if (isProductMarketingIntent(context)) {
    return contentPlanSchema.parse({
      archetype: "product_marketing",
      subject,
      narrative: `Introduce ${subject} with a decisive launch story: establish the promise, prove it with measurable benefits, explain key capabilities, then convert interest into action.`,
      sections: [
        { id: "hero", role: "hero", purpose: "Establish the product, promise, audience value, and primary conversion path.", requiredBlocks: ["eyebrow", "headline", "body", "primary_action", "secondary_action", "image"] },
        { id: "proof", role: "proof", purpose: "Support the promise with concise, measurable product evidence.", requiredBlocks: ["section_heading", "metric"] },
        { id: "features", role: "features", purpose: "Explain the strongest differentiated capabilities in scannable feature groups.", requiredBlocks: ["section_heading", "body", "feature_card"] },
        { id: "story", role: "story", purpose: "Turn one core capability into a richer image-and-copy narrative.", requiredBlocks: ["section_heading", "body", "image"] },
        { id: "specifications", role: "specifications", purpose: "Present key specifications and purchasing facts for comparison.", requiredBlocks: ["section_heading", "specification"] },
        { id: "social_proof", role: "social_proof", purpose: "Reduce purchase uncertainty with audience-oriented proof.", requiredBlocks: ["section_heading", "testimonial"] },
        { id: "cta", role: "cta", purpose: "Close the page with a clear final decision and action.", requiredBlocks: ["headline", "body", "primary_action"] },
      ],
      qualityTargets: {
        minimumSections: 7,
        minimumTreeDepth: 4,
        minimumTextElements: 15,
        minimumActions: 2,
        minimumStats: 3,
        maximumImages: 5,
      },
    });
  }

  return contentPlanSchema.parse({
    archetype: "general",
    subject,
    narrative: `Introduce ${subject}, organize its primary information and workflows, and end with clear next actions.`,
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
  });
}

export function isProductMarketingIntent(value: string): boolean {
  if (isOperationalIntent(value)) return false;
  return /(product\s+(launch|landing|showcase|page)|smartphone|phone\s+(launch|product|showcase)|new\s+phone|新品|产品介绍|产品发布|手机产品|手机新品|新手机|旗舰手机|发布页|落地页|介绍页)/i.test(value);
}

export function isOperationalIntent(value: string): boolean {
  return /(筛选区|指标卡|数据表格|表格|表单|操作区|filter\s*(area|bar|panel)|metric\s*cards?|data\s*table|workflow\s*form|admin|dashboard|后台|管理台)/i.test(value);
}

function collectIntentText(state: Pick<DesignAgentState, "messages" | "dimensions">) {
  return [
    ...state.messages.map((message) => message.content),
    ...state.dimensions.map((dimension) => JSON.stringify(dimension.value ?? "")),
  ].join("\n");
}

function inferSubject(state: Pick<DesignAgentState, "messages" | "dimensions">, context: string) {
  for (const dimension of state.dimensions) {
    const value = dimension.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const key of ["productName", "model", "brand", "title", "name", "pageType"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 200);
    }
  }
  const labelled = context.match(/(?:product|model|brand|产品|型号|品牌)\s*[:：]\s*([^\n,，。;；]{2,80})/i)?.[1];
  return labelled?.trim() || (isProductMarketingIntent(context) ? "the product" : isOperationalIntent(context) ? "the ecommerce workspace" : "the requested experience");
}
