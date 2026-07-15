import type { DesignAgentState } from "../../state.js";
import { buildContentPlan } from "../content-planning/node.js";
import { contentPlanSchema, type ContentPlan } from "../content-planning/schema.js";
import type { GraphNodeOptions } from "../types.js";
import { compilePageStructurePlan } from "./compiler.js";
import { jsonPlanningPrompt } from "./prompt.js";
import {
  jsonPlanningModelOutputSchema,
  type JsonPlanningOutput,
  type PageStructurePlan,
} from "./schema.js";

export async function jsonPlanningNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const contentPlan = await readContentPlan(state, options);
  const inputRefs = state.latestArtifactRefs.content_planning
    ? [state.latestArtifactRefs.content_planning]
    : state.latestArtifactRefs.intent_compaction
      ? [state.latestArtifactRefs.intent_compaction]
      : [];
  const { structurePlan, errors } = await createStructurePlan(state, contentPlan, options, inputRefs);
  const document = compilePageStructurePlan(structurePlan);
  const output: JsonPlanningOutput = { structurePlan, document };
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "json_planning",
        status: "success",
        inputRefs,
        output,
        errors,
      })
    : undefined;

  return {
    currentNode: "json_planning",
    stage: "json_planning",
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, json_planning: artifactRef }
      : state.latestArtifactRefs,
    validationErrors: errors.length ? errors : state.validationErrors,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "json_planning", stage: "json_planning" } },
    ],
  };
}

async function createStructurePlan(
  state: DesignAgentState,
  contentPlan: ContentPlan,
  options: GraphNodeOptions,
  inputRefs: DesignAgentState["latestArtifactRefs"][string][],
) {
  const fallback = buildFallbackStructurePlan(state, contentPlan);
  if (!options.createStructuredOutput) return { structurePlan: fallback, errors: [] };

  try {
    const modelOutput = await invokeStructureModel(options, buildJsonPlanningInput(state, contentPlan));
    return { structurePlan: validateStructureQuality(modelOutput.structurePlan, contentPlan), errors: [] };
  } catch (firstError) {
    try {
      const modelOutput = await invokeStructureModel(options, buildStructureRetryInput(state, contentPlan, firstError, fallback));
      return { structurePlan: validateStructureQuality(modelOutput.structurePlan, contentPlan), errors: [] };
    } catch (retryError) {
      const errors = [
        `${formatJsonPlanningError(firstError)}\nRetry failed: ${formatJsonPlanningError(retryError)}`,
      ];
      return { structurePlan: fallback, errors };
    }
  }
}

async function invokeStructureModel(options: GraphNodeOptions, input: string) {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  return jsonPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(jsonPlanningModelOutputSchema, { node: "json_planning" }).invoke(input),
  );
}

export function buildJsonPlanningInput(state: DesignAgentState, contentPlan = buildContentPlan(state)): string {
  return [
    jsonPlanningPrompt,
    "",
    "Content narrative blueprint and quality targets:",
    JSON.stringify(contentPlan, null, 2),
    "",
    "Confirmed intent dimensions:",
    JSON.stringify(state.dimensions, null, 2),
    "",
    "Conversation messages:",
    JSON.stringify(state.messages, null, 2),
  ].join("\n");
}

function buildStructureRetryInput(
  state: DesignAgentState,
  contentPlan: ContentPlan,
  error: unknown,
  validExample: PageStructurePlan,
): string {
  return [
    buildJsonPlanningInput(state, contentPlan),
    "",
    "The previous generation was rejected by the PageStructurePlan schema.",
    `Validation error: ${formatJsonPlanningError(error)}`,
    "Generate the complete flat structurePlan again. Do not return tree, elements, props, layout, or style fields.",
    "Use this valid structurePlan as the exact shape reference, then adapt its regions to the confirmed intent:",
    JSON.stringify(validExample, null, 2),
  ].join("\n");
}

function buildFallbackStructurePlan(state: DesignAgentState, contentPlan: ContentPlan): PageStructurePlan {
  const pageContext = state.dimensions.find((dimension) => dimension.key === "page_context")?.value;
  const name = inferDocumentName(pageContext);
  const canvas = inferCanvas(state);
  if (contentPlan.archetype === "product_marketing") {
    return {
      document: { id: "design_generated_page", name, ...canvas, background: "muted" },
      nodes: productStructureNodes(),
    };
  }
  if (contentPlan.archetype === "operational") {
    return {
      document: { id: "design_generated_page", name, ...canvas, background: "muted" },
      nodes: operationalStructureNodes(),
    };
  }
  return {
    document: {
      id: "design_generated_page",
      name,
      ...canvas,
      background: "muted",
    },
    nodes: [
      {
        id: "page_root",
        parentId: null,
        order: 0,
        type: "page",
        name: "Page",
        purpose: "Application root",
      },
      {
        id: "header_section",
        parentId: "page_root",
        order: 0,
        type: "section",
        name: "Header",
        purpose: "Page title, context, and primary actions",
      },
      { id: "header_content", parentId: "header_section", order: 0, type: "stack", name: "Header Content", purpose: "Group the page title, supporting copy, and primary action" },
      {
        id: "main_section",
        parentId: "page_root",
        order: 1,
        type: "section",
        name: "Main Content",
        purpose: "Primary information and workflows",
      },
      { id: "main_content", parentId: "main_section", order: 0, type: "stack", name: "Main Content Group", purpose: "Organize the primary information into a readable content group" },
      {
        id: "footer_section",
        parentId: "page_root",
        order: 2,
        type: "section",
        name: "Footer",
        purpose: "Supporting information and provenance",
      },
      { id: "footer_content", parentId: "footer_section", order: 0, type: "stack", name: "Footer Content", purpose: "Group supporting information and final actions" },
    ],
  };
}

function validateStructureQuality(plan: PageStructurePlan, contentPlan: ContentPlan): PageStructurePlan {
  if (contentPlan.archetype === "operational") {
    const ids = new Set(plan.nodes.map((node) => node.id));
    const required = ["filters_section", "metrics_section", "table_section", "form_section", "actions_section"];
    if (required.some((id) => !ids.has(id))) {
      throw new Error(`Operational structure must include ${required.join(", ")}.`);
    }
    return plan;
  }
  if (contentPlan.archetype !== "product_marketing") return plan;
  const sections = plan.nodes.filter((node) => node.type === "section");
  const stacks = plan.nodes.filter((node) => node.type === "stack");
  const depth = structureDepth(plan);
  if (sections.length < contentPlan.qualityTargets.minimumSections) {
    throw new Error(`Product structure requires at least ${contentPlan.qualityTargets.minimumSections} sections; received ${sections.length}.`);
  }
  if (stacks.length < 8 || depth < contentPlan.qualityTargets.minimumTreeDepth) {
    throw new Error(`Product structure requires nested content stacks and tree depth ${contentPlan.qualityTargets.minimumTreeDepth}; received ${stacks.length} stacks and depth ${depth}.`);
  }
  return plan;
}

function structureDepth(plan: PageStructurePlan) {
  const children = new Map<string, string[]>();
  const root = plan.nodes.find((node) => node.parentId === null);
  for (const node of plan.nodes) {
    if (!node.parentId) continue;
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  }
  const visit = (id: string): number => 1 + Math.max(0, ...(children.get(id) ?? []).map(visit));
  return root ? visit(root.id) : 0;
}

function productStructureNodes(): PageStructurePlan["nodes"] {
  return [
    { id: "page_root", parentId: null, order: 0, type: "page", name: "Product Page", purpose: "Tell a complete product launch story and convert interest into action" },
    { id: "hero_section", parentId: "page_root", order: 0, type: "section", name: "Hero", purpose: "Establish the product promise, audience value, primary actions, and hero visual" },
    { id: "hero_layout", parentId: "hero_section", order: 0, type: "stack", name: "Hero Split Layout", purpose: "Arrange hero copy and product visual side by side" },
    { id: "hero_copy", parentId: "hero_layout", order: 0, type: "stack", name: "Hero Copy", purpose: "Group eyebrow, title, supporting copy, and conversion actions" },
    { id: "hero_actions", parentId: "hero_copy", order: 0, type: "stack", name: "Hero Actions", purpose: "Group primary and secondary product actions" },
    { id: "hero_media", parentId: "hero_layout", order: 1, type: "stack", name: "Hero Media", purpose: "Contain the primary product visual" },
    { id: "proof_section", parentId: "page_root", order: 1, type: "section", name: "Proof", purpose: "Support the product promise with measurable evidence" },
    { id: "proof_intro", parentId: "proof_section", order: 0, type: "stack", name: "Proof Introduction", purpose: "Introduce the evidence behind the product promise" },
    { id: "proof_metrics", parentId: "proof_section", order: 1, type: "stack", name: "Proof Metrics", purpose: "Present key product metrics in one scannable row" },
    { id: "features_section", parentId: "page_root", order: 2, type: "section", name: "Core Features", purpose: "Explain the product's strongest differentiated capabilities" },
    { id: "features_intro", parentId: "features_section", order: 0, type: "stack", name: "Features Introduction", purpose: "Introduce the core capability set" },
    { id: "features_grid", parentId: "features_section", order: 1, type: "stack", name: "Feature Grid", purpose: "Arrange feature cards in a responsive visual grid" },
    { id: "feature_card_1", parentId: "features_grid", order: 0, type: "stack", name: "Feature Card One", purpose: "Explain the first core capability with a title and supporting copy" },
    { id: "feature_card_2", parentId: "features_grid", order: 1, type: "stack", name: "Feature Card Two", purpose: "Explain the second core capability with a title and supporting copy" },
    { id: "feature_card_3", parentId: "features_grid", order: 2, type: "stack", name: "Feature Card Three", purpose: "Explain the third core capability with a title and supporting copy" },
    { id: "story_section", parentId: "page_root", order: 3, type: "section", name: "Feature Story", purpose: "Turn one flagship capability into a rich image-and-copy narrative" },
    { id: "story_layout", parentId: "story_section", order: 0, type: "stack", name: "Story Split Layout", purpose: "Arrange the supporting visual beside explanatory copy" },
    { id: "story_media", parentId: "story_layout", order: 0, type: "stack", name: "Story Media", purpose: "Contain the supporting feature visual" },
    { id: "story_copy", parentId: "story_layout", order: 1, type: "stack", name: "Story Copy", purpose: "Explain the flagship capability with layered editorial copy" },
    { id: "specifications_section", parentId: "page_root", order: 4, type: "section", name: "Specifications", purpose: "Present key specifications and purchasing facts" },
    { id: "specifications_intro", parentId: "specifications_section", order: 0, type: "stack", name: "Specifications Introduction", purpose: "Introduce the product specification summary" },
    { id: "specifications_grid", parentId: "specifications_section", order: 1, type: "stack", name: "Specifications Grid", purpose: "Arrange key specifications for fast comparison" },
    { id: "social_section", parentId: "page_root", order: 5, type: "section", name: "Social Proof", purpose: "Reduce uncertainty with audience-oriented proof" },
    { id: "social_intro", parentId: "social_section", order: 0, type: "stack", name: "Social Proof Introduction", purpose: "Introduce customer or expert proof" },
    { id: "social_grid", parentId: "social_section", order: 1, type: "stack", name: "Testimonial Grid", purpose: "Group concise testimonials and ratings" },
    { id: "cta_section", parentId: "page_root", order: 6, type: "section", name: "Final Call to Action", purpose: "Close the product story with a clear decision" },
    { id: "cta_copy", parentId: "cta_section", order: 0, type: "stack", name: "CTA Copy", purpose: "Group final headline, supporting copy, and purchase reassurance" },
    { id: "cta_actions", parentId: "cta_section", order: 1, type: "stack", name: "CTA Actions", purpose: "Group final primary and secondary actions" },
  ];
}

function operationalStructureNodes(): PageStructurePlan["nodes"] {
  return [
    { id: "page_root", parentId: null, order: 0, type: "page", name: "Operational Page", purpose: "Support a compact ecommerce workflow on the requested device" },
    { id: "header_section", parentId: "page_root", order: 0, type: "section", name: "Page Header", purpose: "Show page context and the most important workflow action" },
    { id: "header_content", parentId: "header_section", order: 0, type: "stack", name: "Header Content", purpose: "Group the page title and concise supporting context" },
    { id: "header_actions", parentId: "header_section", order: 1, type: "stack", name: "Header Actions", purpose: "Group the highest priority page actions" },
    { id: "filters_section", parentId: "page_root", order: 1, type: "section", name: "Filters", purpose: "Narrow ecommerce records with compact controls" },
    { id: "filters_header", parentId: "filters_section", order: 0, type: "stack", name: "Filter Header", purpose: "Label and summarize available filters" },
    { id: "filters_row", parentId: "filters_section", order: 1, type: "stack", name: "Filter Controls", purpose: "Arrange filter controls for the requested viewport" },
    { id: "metrics_section", parentId: "page_root", order: 2, type: "section", name: "Metrics", purpose: "Summarize the most important ecommerce indicators" },
    { id: "metrics_header", parentId: "metrics_section", order: 0, type: "stack", name: "Metrics Header", purpose: "Label the key business indicators" },
    { id: "metrics_grid", parentId: "metrics_section", order: 1, type: "stack", name: "Metrics Grid", purpose: "Arrange metric cards for rapid scanning" },
    { id: "table_section", parentId: "page_root", order: 3, type: "section", name: "Records", purpose: "Present ecommerce records in a structured data table" },
    { id: "table_header", parentId: "table_section", order: 0, type: "stack", name: "Table Header", purpose: "Group the table title and table actions" },
    { id: "table_content", parentId: "table_section", order: 1, type: "stack", name: "Table Content", purpose: "Contain a horizontally scrollable data table" },
    { id: "form_section", parentId: "page_root", order: 4, type: "section", name: "Form", purpose: "Collect or edit ecommerce workflow information" },
    { id: "form_header", parentId: "form_section", order: 0, type: "stack", name: "Form Header", purpose: "Explain the form task" },
    { id: "form_content", parentId: "form_section", order: 1, type: "stack", name: "Form Content", purpose: "Contain the required form fields" },
    { id: "actions_section", parentId: "page_root", order: 5, type: "section", name: "Actions", purpose: "Complete or cancel the current workflow" },
    { id: "action_row", parentId: "actions_section", order: 0, type: "stack", name: "Action Row", purpose: "Group primary and secondary workflow actions" },
  ];
}

function inferCanvas(state: Pick<DesignAgentState, "dimensions">): Pick<PageStructurePlan["document"], "viewport" | "width"> {
  const pageContext = state.dimensions.find((dimension) => dimension.key === "page_context")?.value;
  if (pageContext && typeof pageContext === "object" && !Array.isArray(pageContext)) {
    const deviceType = String((pageContext as Record<string, unknown>).deviceType ?? "").toLowerCase();
    if (deviceType.includes("mobile") || deviceType.includes("phone") || deviceType.includes("手机")) return { viewport: "mobile", width: 375 };
    if (deviceType.includes("tablet") || deviceType.includes("平板")) return { viewport: "tablet", width: 768 };
  }
  return { viewport: "desktop", width: 1440 };
}

async function readContentPlan(state: DesignAgentState, options: GraphNodeOptions): Promise<ContentPlan> {
  const ref = state.latestArtifactRefs.content_planning;
  if (!ref || !options.artifactStore) return buildContentPlan(state);
  const artifact = await options.artifactStore.readArtifact<{ contentPlan?: unknown }>(ref);
  return contentPlanSchema.parse(artifact.output.contentPlan);
}

function inferDocumentName(value: unknown) {
  if (isObject(value)) {
    const pageType = value.pageType ?? value.name ?? value.title ?? value.application ?? value.type;
    if (typeof pageType === "string" && pageType.trim()) return pageType.trim();
  }
  return "AI Generated Design";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatJsonPlanningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 4000 ? message : `${message.slice(0, 4000)}\n[error truncated]`;
}
