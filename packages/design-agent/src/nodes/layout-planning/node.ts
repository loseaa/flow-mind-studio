import type { DesignDocument, DesignImageSlot } from "@flowmind/shared";

import type { DesignAgentState } from "../../state.js";
import { readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import { hasExplicitNoImageIntent } from "../image-policy.js";
import type { GraphNodeOptions } from "../types.js";
import { compileLayoutPlan } from "./compiler.js";
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
  const planned = await createLayoutPlan(state, document, options);
  const output: LayoutPlanningOutput = {
    document: compileLayoutPlan(document, planned.layoutPlan),
    layoutPlan: planned.layoutPlan,
  };
  return writePipelineArtifact({
    state,
    options,
    node: "layout_planning",
    stage: "layout_planning",
    inputRefs,
    output,
    errors: planned.errors,
  });
}

async function createLayoutPlan(
  state: DesignAgentState,
  document: DesignDocument,
  options: GraphNodeOptions,
) {
  if (!options.createStructuredOutput) {
    return { layoutPlan: validateLayoutPlan(document, planLayoutWithRules(state, document), state), errors: [] };
  }

  try {
    const layoutPlan = await invokeLayoutModel(options, buildLayoutPlanningInput(state, document));
    return { layoutPlan: validateLayoutPlan(document, layoutPlan, state), errors: [] };
  } catch (firstError) {
    try {
      const layoutPlan = await invokeLayoutModel(options, buildLayoutRetryInput(state, document, firstError));
      return { layoutPlan: validateLayoutPlan(document, layoutPlan, state), errors: [] };
    } catch (retryError) {
      const errors = [`${formatError(firstError)}\nRetry failed: ${formatError(retryError)}`];
      return {
        layoutPlan: validateLayoutPlan(document, planLayoutWithRules(state, document), state),
        errors,
      };
    }
  }
}

async function invokeLayoutModel(options: GraphNodeOptions, input: string): Promise<LayoutPlan> {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  return layoutPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(layoutPlanningModelOutputSchema, { node: "layout_planning" }).invoke(input),
  ).layoutPlan;
}

function validateLayoutPlan(
  document: DesignDocument,
  input: LayoutPlan,
  state: Pick<DesignAgentState, "messages" | "dimensions">,
): LayoutPlan {
  const plan = repairLayoutPlanReferences(document, layoutPlanSchema.parse(input));
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

  const layoutTargets = new Set<string>();
  for (const assignment of plan.containerLayouts ?? []) {
    if (layoutTargets.has(assignment.elementId)) throw new Error(`Duplicate container layout: ${assignment.elementId}`);
    layoutTargets.add(assignment.elementId);
    const target = elementsById.get(assignment.elementId);
    if (!target || !["page", "section", "stack"].includes(target.type)) {
      throw new Error(`Container layout target is invalid: ${assignment.elementId}`);
    }
  }

  if (isProductLayoutDocument(document)) {
    for (const requiredId of PRODUCT_LAYOUT_REQUIRED_IDS) {
      if (!layoutTargets.has(requiredId)) throw new Error(`Product layout is missing container assignment: ${requiredId}`);
    }
  }
  if (elementsById.has("filters_section")) {
    for (const requiredId of ["header_actions", "filters_row", "metrics_grid", "table_content", "form_content", "action_row"]) {
      if (!layoutTargets.has(requiredId)) throw new Error(`Operational layout is missing container assignment: ${requiredId}`);
    }
  }

  const noImageRequested = hasExplicitNoImageIntent({
    messages: state.messages,
    dimensions: state.dimensions,
  }) || isOperationalDocument(document);
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

const PRODUCT_LAYOUT_REQUIRED_IDS = [
  "hero_layout",
  "hero_copy",
  "hero_actions",
  "features_grid",
  "story_layout",
  "specifications_grid",
  "cta_actions",
];

function repairLayoutPlanReferences(document: DesignDocument, plan: LayoutPlan): LayoutPlan {
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const validParentIds = document.elements
    .filter((element) => ["page", "section", "stack"].includes(element.type))
    .map((element) => element.id);
  const validParents = new Set(validParentIds);
  const sectionIds = document.elements.filter((element) => element.type === "section").map((element) => element.id);
  const usedPrimaryParents = new Set<string>();

  let imageSlots = plan.imageSlots.map((slot, index) => {
    let parentId = validParents.has(slot.parentId)
      ? slot.parentId
      : chooseImageSlotParent(slot, index, validParents, sectionIds, validParentIds, usedPrimaryParents);
    let role = slot.role;

    if ((role === "hero" || role === "section") && usedPrimaryParents.has(parentId)) {
      const alternate = chooseImageSlotParent(slot, index, validParents, sectionIds, validParentIds, usedPrimaryParents);
      if (alternate !== parentId) {
        parentId = alternate;
      } else {
        role = "gallery";
      }
    }
    if (role === "hero" || role === "section") usedPrimaryParents.add(parentId);
    return { ...slot, parentId, role };
  });
  imageSlots = enforceSemanticImageSlotAssignments(document, imageSlots, validParents);

  const hierarchy = { ...plan.hierarchy };
  if (hierarchy.titleElementId && !elementsById.has(hierarchy.titleElementId)) delete hierarchy.titleElementId;
  if (hierarchy.primaryActionElementId && !elementsById.has(hierarchy.primaryActionElementId)) {
    delete hierarchy.primaryActionElementId;
  }
  if (hierarchy.primaryVisualSlotId && !imageSlots.some((slot) => slot.id === hierarchy.primaryVisualSlotId)) {
    delete hierarchy.primaryVisualSlotId;
  }

  return layoutPlanSchema.parse({
    ...plan,
    hierarchy,
    imageSlots,
    containerLayouts: normalizeContainerLayouts(document, plan.containerLayouts),
  });
}

function enforceSemanticImageSlotAssignments(
  document: DesignDocument,
  inputSlots: DesignImageSlot[],
  validParents: Set<string>,
) {
  if (!isProductLayoutDocument(document)) return inputSlots;

  const slots = inputSlots.map((slot) => ({ ...slot }));
  const hasParent = (id: string) => validParents.has(id);
  const heroMediaId = hasParent("hero_media") ? "hero_media" : undefined;
  const storyMediaId = hasParent("story_media") ? "story_media" : undefined;
  const featureCandidates = ["feature_card_1", "features_grid", "features_section"].filter((id) => hasParent(id));

  const heroIndex = slots.findIndex((slot) => slot.role === "hero");
  if (heroIndex >= 0 && heroMediaId) {
    slots[heroIndex] = {
      ...slots[heroIndex],
      parentId: heroMediaId,
      placement: "inline",
    };
  }

  if (storyMediaId && !slots.some((slot) => slot.parentId === storyMediaId)) {
    const storySlotIndex = slots.findIndex((slot) => slot.role !== "hero" && slot.parentId !== heroMediaId);
    if (storySlotIndex >= 0) {
      slots[storySlotIndex] = {
        ...slots[storySlotIndex],
        parentId: storyMediaId,
        role: "section",
        placement: "inline",
      };
    }
  }

  if (featureCandidates.length > 0 && !slots.some((slot) => featureCandidates.includes(slot.parentId))) {
    const occupiedParents = new Set(
      slots
        .filter((slot) => slot.role === "hero" || slot.role === "section")
        .map((slot) => slot.parentId),
    );
    const featureParentId = featureCandidates.find((id) => !occupiedParents.has(id)) ?? featureCandidates[0];
    const featureSlotIndex = slots.findIndex((slot) => slot.role !== "hero" && slot.parentId !== storyMediaId);
    if (featureSlotIndex >= 0) {
      slots[featureSlotIndex] = {
        ...slots[featureSlotIndex],
        parentId: featureParentId,
        role: "section",
        placement: "inline",
      };
    }
  }

  return slots;
}

function normalizeContainerLayouts(
  document: DesignDocument,
  assignments: LayoutPlan["containerLayouts"],
): LayoutPlan["containerLayouts"] {
  if (!assignments?.length) return assignments;
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const mobile = document.canvas.viewport === "mobile" || document.canvas.width <= 600;

  return assignments.map((assignment) => {
    const element = elementsById.get(assignment.elementId);
    if (!element || (element.type !== "section" && element.type !== "stack")) return assignment;
    return shouldRepairSemanticLayout(element, assignment.layout)
      ? { ...assignment, layout: { ...assignment.layout, ...inferGeneralContainerLayout(element, mobile) } }
      : assignment;
  });
}

function shouldRepairSemanticLayout(
  element: DesignDocument["elements"][number],
  layout: NonNullable<LayoutPlan["containerLayouts"]>[number]["layout"],
) {
  const hint = `${element.id} ${element.name} ${String(element.props.purpose ?? "")}`.toLowerCase();
  if (/hero[-_\s].*layout|split|side[-_\s]?by[-_\s]?side|horizontal|左右|并排|水平排列/.test(hint)) {
    return layout.direction !== "horizontal";
  }
  if (/grid|cards?|products?|gallery|cta[-_\s]?group|action[-_\s]?buttons|button[-_\s]?row|actions?[-_\s]?group|网格|商品|按钮组/.test(hint)) {
    return layout.direction !== "horizontal" || layout.wrap !== true;
  }
  return false;
}

function chooseImageSlotParent(
  slot: DesignImageSlot,
  index: number,
  validParents: Set<string>,
  sectionIds: string[],
  validParentIds: string[],
  usedPrimaryParents: Set<string>,
) {
  const wantsPrimary = slot.role === "hero" || slot.role === "section";
  const namedCandidates = [
    ...(slot.role === "hero" || /hero/i.test(slot.parentId) ? ["hero_media", "hero_layout", "hero_section"] : []),
    ...(slot.role === "section" || /story/i.test(slot.parentId) ? ["story_media", "story_layout", "story_section"] : []),
    ...(slot.role === "card" || /feature/i.test(slot.parentId) ? ["feature_card_1", "features_grid", "features_section"] : []),
  ];
  const candidates = [
    ...namedCandidates,
    sectionIds[index] ?? sectionIds[0],
    ...sectionIds,
    ...validParentIds,
  ].filter((id): id is string => Boolean(id) && validParents.has(id));

  return candidates.find((id) => !wantsPrimary || !usedPrimaryParents.has(id))
    ?? candidates[0]
    ?? validParentIds[0]
    ?? slot.parentId;
}

export function buildLayoutPlanningInput(state: DesignAgentState, document: DesignDocument): string {
  const explicitNoImageIntent = hasExplicitNoImageIntent({
    messages: state.messages,
    dimensions: state.dimensions,
  }) || isOperationalDocument(document);
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
    "For product pages, assign every named composition stack in containerLayouts, including split layouts, action rows, metric rows, and grids.",
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
  }) || isOperationalDocument(document);

  if (noImageRequested) {
    return layoutPlanSchema.parse({
      strategy: "product_showcase",
      rootId: document.tree.id,
      sectionIds,
      rhythm: "standard",
      hierarchy: {},
      containerLayouts: createContainerLayouts(document),
      imageSlots: [],
      notes: [isOperationalDocument(document)
        ? "Operational application pages use interface components instead of generated decorative imagery."
        : "No image slots because the user explicitly requested a text-only design."],
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

  const productPage = isProductLayoutDocument(document);
  const heroParentId = productPage ? "hero_media" : sectionIds[0] ?? document.tree.id;
  const primaryParents = new Set([heroParentId]);
  const supportingParents = productPage
    ? ["story_media", "feature_card_1"]
    : sectionIds.slice(1, 3);
  while (supportingParents.length < 2) supportingParents.push(document.tree.id);

  const heroSlot: DesignImageSlot = {
    id: createId("layout_hero_image_slot"),
    parentId: heroParentId,
    role: "hero",
    placement: productPage ? "inline" : "background",
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
    containerLayouts: createContainerLayouts(document),
    imageSlots,
    notes: ["Deterministic slot-driven layout based on the compiled structure."],
  });
}

function createContainerLayouts(document: DesignDocument): NonNullable<LayoutPlan["containerLayouts"]> {
  const ids = new Set(document.elements.map((element) => element.id));
  const mobile = document.canvas.viewport === "mobile" || document.canvas.width <= 600;
  const assignments: NonNullable<LayoutPlan["containerLayouts"]> = [];
  const add = (elementId: string, layout: NonNullable<DesignDocument["elements"][number]["layout"]>) => {
    if (ids.has(elementId)) assignments.push({ elementId, layout });
  };

  add(document.tree.id, { display: "flex", direction: "vertical", gap: mobile ? "lg" : "xl", padding: mobile ? "md" : "xl", width: "fill" });
  add("hero_section", { display: "flex", direction: "vertical", gap: "lg", padding: mobile ? "md" : "xl", width: "fill" });
  add("hero_layout", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: mobile ? "lg" : "xl", padding: "none", width: "fill", align: mobile ? "stretch" : "center", wrap: true });
  add("hero_copy", mobile
    ? { display: "flex", direction: "vertical", gap: "md", padding: "none", width: "fill" }
    : { display: "flex", direction: "vertical", gap: "md", padding: "none", width: "fixed", fixedWidth: 520, grow: "fill" });
  add("hero_actions", { display: "flex", direction: "horizontal", gap: "sm", padding: "none", width: "fill", align: "center", wrap: true });
  add("hero_media", mobile
    ? { display: "flex", direction: "vertical", gap: "none", padding: "none", width: "fill", align: "center", justify: "center" }
    : { display: "flex", direction: "vertical", gap: "none", padding: "none", width: "fixed", fixedWidth: 620, grow: "fill", align: "center", justify: "center" });
  add("proof_section", { display: "flex", direction: "vertical", gap: "lg", padding: "lg", width: "fill" });
  add("proof_metrics", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "md", padding: "none", width: "fill", align: "stretch", wrap: true });
  add("features_section", { display: "flex", direction: "vertical", gap: "lg", padding: mobile ? "md" : "xl", width: "fill" });
  add("features_grid", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "md", padding: "none", width: "fill", align: "stretch", wrap: true });
  for (const id of ["feature_card_1", "feature_card_2", "feature_card_3"]) {
    add(id, mobile
      ? { display: "flex", direction: "vertical", gap: "sm", padding: "md", width: "fill" }
      : { display: "flex", direction: "vertical", gap: "sm", padding: "lg", width: "fixed", fixedWidth: 340, grow: "fill" });
  }
  add("story_section", { display: "flex", direction: "vertical", gap: "lg", padding: mobile ? "md" : "xl", width: "fill" });
  add("story_layout", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: mobile ? "lg" : "xl", padding: "none", width: "fill", align: mobile ? "stretch" : "center", wrap: true });
  add("story_media", mobile
    ? { display: "flex", direction: "vertical", gap: "none", padding: "none", width: "fill" }
    : { display: "flex", direction: "vertical", gap: "none", padding: "none", width: "fixed", fixedWidth: 560, grow: "fill" });
  add("story_copy", mobile
    ? { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" }
    : { display: "flex", direction: "vertical", gap: "md", padding: "lg", width: "fixed", fixedWidth: 520, grow: "fill", justify: "center" });
  add("specifications_grid", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "md", padding: "none", width: "fill", align: "stretch", wrap: true });
  add("social_grid", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "md", padding: "none", width: "fill", align: "stretch", wrap: true });
  add("cta_section", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: mobile ? "lg" : "xl", padding: mobile ? "lg" : "xl", width: "fill", align: mobile ? "stretch" : "center", justify: mobile ? "start" : "between", wrap: true });
  add("cta_copy", mobile
    ? { display: "flex", direction: "vertical", gap: "sm", padding: "none", width: "fill" }
    : { display: "flex", direction: "vertical", gap: "sm", padding: "none", width: "fixed", fixedWidth: 620, grow: "fill" });
  add("cta_actions", { display: "flex", direction: "horizontal", gap: "sm", padding: "none", width: "hug", align: "center", wrap: true });

  add("header_section", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "md", padding: mobile ? "md" : "lg", width: "fill", align: mobile ? "stretch" : "center", justify: "between", wrap: true });
  add("header_content", { display: "flex", direction: "vertical", gap: "xs", padding: "none", width: "fill", grow: "fill" });
  add("header_actions", { display: "flex", direction: "horizontal", gap: "sm", padding: "none", width: mobile ? "fill" : "hug", align: "center", wrap: true });
  add("filters_section", { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" });
  add("filters_row", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "sm", padding: "none", width: "fill", align: "stretch", wrap: true });
  add("metrics_section", { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" });
  add("metrics_grid", { display: "flex", direction: mobile ? "vertical" : "horizontal", gap: "sm", padding: "none", width: "fill", align: "stretch", wrap: true });
  add("table_section", { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" });
  add("table_content", { display: "flex", direction: "vertical", gap: "none", padding: "none", width: "fill" });
  add("form_section", { display: "flex", direction: "vertical", gap: "md", padding: "md", width: "fill" });
  add("form_content", { display: "flex", direction: "vertical", gap: "sm", padding: "none", width: "fill" });
  add("actions_section", { display: "flex", direction: "vertical", gap: "sm", padding: "md", width: "fill" });
  add("action_row", { display: "flex", direction: "horizontal", gap: "sm", padding: "none", width: "fill", align: "center", justify: mobile ? "start" : "end", wrap: true });

  if (assignments.length === 1) {
    for (const element of document.elements) {
      if (element.type !== "section" && element.type !== "stack") continue;
      add(element.id, inferGeneralContainerLayout(element, mobile));
    }
  }
  return assignments;
}

function inferGeneralContainerLayout(
  element: DesignDocument["elements"][number],
  mobile: boolean,
): NonNullable<DesignDocument["elements"][number]["layout"]> {
  const hint = `${element.id} ${element.name} ${String(element.props.purpose ?? "")}`.toLowerCase();
  const sectionBase: NonNullable<DesignDocument["elements"][number]["layout"]> = {
    display: "flex",
    direction: "vertical",
    gap: "lg",
    padding: element.type === "section" ? "lg" : "md",
    width: "fill",
  };

  if (/hero[-_\s].*layout|split|side[-_\s]?by[-_\s]?side|horizontal|左右|并排|水平排列/.test(hint)) {
    return {
      display: "flex",
      direction: mobile ? "vertical" : "horizontal",
      gap: mobile ? "lg" : "xl",
      padding: element.type === "section" ? "lg" : "md",
      width: "fill",
      align: mobile ? "stretch" : "center",
      wrap: true,
    };
  }

  if (/grid|cards?|products?|gallery|cta[-_\s]?group|action[-_\s]?buttons|button[-_\s]?row|actions?[-_\s]?group|网格|商品|按钮组/.test(hint)) {
    return {
      display: "flex",
      direction: mobile ? "vertical" : "horizontal",
      gap: "md",
      padding: element.type === "section" ? "lg" : "md",
      width: "fill",
      align: "stretch",
      wrap: true,
    };
  }

  if (/media|image|visual|图片|媒体/.test(hint)) {
    return {
      display: "flex",
      direction: "vertical",
      gap: "md",
      padding: element.type === "section" ? "lg" : "md",
      width: "fill",
      align: "center",
      justify: "center",
    };
  }

  if (/heading|title|copy|content|文案|标题/.test(hint)) {
    return {
      display: "flex",
      direction: "vertical",
      gap: "md",
      padding: element.type === "section" ? "lg" : "md",
      width: "fill",
    };
  }

  return sectionBase;
}

function isOperationalDocument(document: DesignDocument) {
  return document.elements.some((element) => element.id === "filters_section")
    && document.elements.some((element) => element.id === "table_section");
}

function isProductLayoutDocument(document: DesignDocument) {
  const ids = new Set(document.elements.map((element) => element.id));
  return PRODUCT_LAYOUT_REQUIRED_IDS.every((id) => ids.has(id));
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 4000 ? message : `${message.slice(0, 4000)}\n[error truncated]`;
}
