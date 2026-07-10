import type { DesignDocument, DesignImageSlot } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { failPipelineNode, readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import { hasExplicitNoImageIntent } from "../image-policy.js";
import type { GraphNodeOptions } from "../types.js";
import { layoutPlanningPrompt } from "./prompt.js";
import {
  layoutPlanSchema,
  layoutPlanningModelOutputSchema,
  type LayoutPlan,
  type LayoutPlanningOutput,
} from "./schema.js";

export async function layoutPlanningNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "json_planning");
  const planned = await createLayoutPlan(state, document, options, inputRefs);
  const output: LayoutPlanningOutput = { document, layoutPlan: planned.layoutPlan };
  return writePipelineArtifact({
    state,
    options,
    node: "layout_planning",
    stage: "layout_planning",
    inputRefs,
    output,
    errors: [],
  });
}

async function createLayoutPlan(
  state: DesignAgentState,
  document: DesignDocument,
  options: GraphNodeOptions,
  inputRefs: ArtifactRef[],
) {
  if (!options.createStructuredOutput) {
    return { layoutPlan: validateLayoutPlan(document, planLayoutWithRules(state, document), state) };
  }

  try {
    const layoutPlan = await invokeLayoutModel(options, buildLayoutPlanningInput(state, document));
    return { layoutPlan: validateLayoutPlan(document, layoutPlan, state) };
  } catch (firstError) {
    try {
      const layoutPlan = await invokeLayoutModel(options, buildLayoutRetryInput(state, document, firstError));
      return { layoutPlan: validateLayoutPlan(document, layoutPlan, state) };
    } catch (retryError) {
      const errors = [`${formatError(firstError)}\nRetry failed: ${formatError(retryError)}`];
      return failPipelineNode({
        options,
        node: "layout_planning",
        inputRefs,
        output: { layoutPlan: null, document },
        errors,
      });
    }
  }
}

async function invokeLayoutModel(options: GraphNodeOptions, input: string): Promise<LayoutPlan> {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  return layoutPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(layoutPlanningModelOutputSchema).invoke(input),
  ).layoutPlan;
}

function validateLayoutPlan(
  document: DesignDocument,
  input: LayoutPlan,
  state: Pick<DesignAgentState, "messages" | "dimensions">,
): LayoutPlan {
  const plan = layoutPlanSchema.parse(input);
  if (plan.rootId !== document.tree.id) throw new Error(`Layout rootId must equal ${document.tree.id}.`);
  if (new Set(plan.sectionIds).size !== plan.sectionIds.length) {
    throw new Error("Duplicate layout section id.");
  }

  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const sectionIds = new Set(
    document.elements.filter((element) => element.type === "section").map((element) => element.id),
  );
  for (const id of plan.sectionIds) {
    if (!sectionIds.has(id)) throw new Error(`Missing layout section: ${id}`);
  }

  const slotIds = new Set<string>();
  const primarySlotParents = new Set<string>();
  for (const slot of plan.imageSlots) {
    if (slotIds.has(slot.id)) throw new Error(`Duplicate image slot id: ${slot.id}`);
    if (elementsById.has(slot.id)) throw new Error(`Image slot id conflicts with element id: ${slot.id}`);
    slotIds.add(slot.id);

    const parent = elementsById.get(slot.parentId);
    if (!parent || !["page", "section", "stack"].includes(parent.type)) {
      throw new Error(`Image slot parent must reference an existing page, section, or stack: ${slot.parentId}`);
    }

    if (slot.role === "hero" || slot.role === "section") {
      if (primarySlotParents.has(slot.parentId)) {
        throw new Error(`Image slot parent has multiple hero or section slots: ${slot.parentId}`);
      }
      primarySlotParents.add(slot.parentId);
    }
  }

  const noImageRequested = hasExplicitNoImageIntent({
    messages: state.messages,
    dimensions: state.dimensions,
  });
  if (noImageRequested && plan.imageSlots.length !== 0) {
    throw new Error("Explicit no-image intent requires imageSlots to be empty.");
  }
  if (!noImageRequested && plan.imageSlots.length < 3) {
    throw new Error("Layout plan requires at least three image slots unless the user explicitly requests no images.");
  }

  const { hierarchy } = plan;
  if (hierarchy.primaryVisualSlotId && !slotIds.has(hierarchy.primaryVisualSlotId)) {
    throw new Error(`Missing primary visual slot: ${hierarchy.primaryVisualSlotId}`);
  }
  for (const [field, id] of [
    ["titleElementId", hierarchy.titleElementId],
    ["primaryActionElementId", hierarchy.primaryActionElementId],
  ] as const) {
    if (id && !elementsById.has(id)) throw new Error(`Missing hierarchy ${field}: ${id}`);
  }

  return plan;
}

export function buildLayoutPlanningInput(state: DesignAgentState, document: DesignDocument): string {
  const explicitNoImageIntent = hasExplicitNoImageIntent({
    messages: state.messages,
    dimensions: state.dimensions,
  });
  return [
    layoutPlanningPrompt,
    "",
    "Image policy:",
    JSON.stringify({ explicitNoImageIntent }, null, 2),
    "",
    "Confirmed content and presentation intent:",
    JSON.stringify(
      state.dimensions.filter(
        (dimension) => dimension.key === "content_structure" || dimension.key === "presentation_rules",
      ),
      null,
      2,
    ),
    "",
    "Available containers and elements:",
    JSON.stringify(elementSummaries(document), null, 2),
  ].join("\n");
}

function buildLayoutRetryInput(state: DesignAgentState, document: DesignDocument, error: unknown) {
  return [
    buildLayoutPlanningInput(state, document),
    "",
    "The previous layout plan was rejected by schema, image policy, or reference validation.",
    `Validation error: ${formatError(error)}`,
    `rootId must be ${document.tree.id}; use only listed element and container ids.`,
    "Use unique slot ids, valid container parents, and at most one hero/section slot per parent.",
    "Return at least three slots unless explicitNoImageIntent is true; then return no slots.",
    "generation dimensions are not UI dimensions and must never become layout.fixedHeight.",
  ].join("\n");
}

function elementSummaries(document: DesignDocument) {
  return document.elements.map((element) => ({
    id: element.id,
    type: element.type,
    name: element.name,
    purpose: element.props.purpose ?? null,
  }));
}

function planLayoutWithRules(state: DesignAgentState, document: DesignDocument): LayoutPlan {
  const sectionIds = document.elements
    .filter((element) => element.type === "section")
    .map((element) => element.id);
  const noImageRequested = hasExplicitNoImageIntent({
    messages: state.messages,
    dimensions: state.dimensions,
  });

  if (noImageRequested) {
    return layoutPlanSchema.parse({
      strategy: "product_showcase",
      rootId: document.tree.id,
      sectionIds,
      rhythm: "standard",
      hierarchy: {},
      imageSlots: [],
      notes: ["No image slots because the user explicitly requested a text-only design."],
    });
  }

  const existingIds = new Set(document.elements.map((element) => element.id));
  const allocatedIds = new Set<string>();
  const createId = (base: string) => {
    let id = base;
    let suffix = 2;
    while (existingIds.has(id) || allocatedIds.has(id)) {
      id = `${base}_${suffix}`;
      suffix += 1;
    }
    allocatedIds.add(id);
    return id;
  };

  const heroParentId = sectionIds[0] ?? document.tree.id;
  const primaryParents = new Set([heroParentId]);
  const supportingParents = sectionIds.slice(1, 3);
  while (supportingParents.length < 2) supportingParents.push(document.tree.id);

  const heroSlot: DesignImageSlot = {
    id: createId("layout_hero_image_slot"),
    parentId: heroParentId,
    role: "hero",
    placement: "background",
    display: {
      aspectRatio: "16:9",
      width: "fill",
      maxHeight: 480,
      objectFit: "cover",
      focalPoint: "center",
    },
    generation: { width: 1536, height: 864, safeArea: "left" },
  };

  const supportingSlots = supportingParents.map((parentId, index): DesignImageSlot => {
    const role = primaryParents.has(parentId) ? "gallery" : "section";
    primaryParents.add(parentId);
    return {
      id: createId(`layout_section_image_slot_${index + 1}`),
      parentId,
      role,
      placement: "inline",
      display: {
        aspectRatio: "4:3",
        width: "fill",
        maxHeight: 360,
        objectFit: "cover",
        focalPoint: "center",
      },
      generation: { width: 1200, height: 900, safeArea: "none" },
    };
  });
  const imageSlots = [heroSlot, ...supportingSlots];

  return layoutPlanSchema.parse({
    strategy: "product_showcase",
    rootId: document.tree.id,
    sectionIds,
    rhythm: "standard",
    hierarchy: { primaryVisualSlotId: heroSlot.id },
    imageSlots,
    notes: ["Deterministic slot-driven layout based on the compiled structure."],
  });
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 4000 ? message : `${message.slice(0, 4000)}\n[error truncated]`;
}
