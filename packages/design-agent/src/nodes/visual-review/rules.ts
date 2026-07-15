import type { DesignDocument, DesignElement } from "@flowmind/shared";
import { designImageSlotSchema, type DesignImageSlot } from "@flowmind/shared";
import type { VisualRepairAction, VisualReview, VisualReviewIssue } from "./schema.js";

const ROLE_HEIGHT_BOUNDS: Record<DesignImageSlot["role"], [number, number]> = {
  hero: [360, 560],
  section: [240, 420],
  card: [160, 280],
  gallery: [180, 360],
};

const ASPECT_RATIOS: Record<DesignImageSlot["display"]["aspectRatio"], number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "1:1": 1,
  "3:4": 3 / 4,
};

export function reviewVisualQualityWithRules(document: DesignDocument, modelIssues: VisualReviewIssue[] = []): VisualReview {
  const issues: VisualReviewIssue[] = [];
  const repairActions: VisualRepairAction[] = [];
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const slotsById = collectImageSlots(document);
  const attachedSlotIds = new Set<string>();

  for (const element of document.elements) {
    const restoredSlot = resolveSlotForElement(element, slotsById);
    const existingSlot = readLooseSlot(element);
    const slot = existingSlot ?? restoredSlot;

    if (!existingSlot && restoredSlot) {
      issues.push({
        code: restoredSlot.placement === "background" ? "BACKGROUND_SLOT_METADATA_MISSING" : "IMAGE_SLOT_METADATA_MISSING",
        elementId: element.id,
        severity: "high",
        suggestion: "Restore deterministic image slot metadata from agent planning before rendering or image generation.",
      });
      repairActions.push({
        kind: restoredSlot.placement === "background" ? "set_background_slot_metadata" : "restore_image_slot_metadata",
        elementId: element.id,
        slotId: restoredSlot.id,
        value: restoredSlot,
        reason: `Restore ${restoredSlot.placement} image slot metadata from visual slot planning.`,
      });
    }

    if (!slot) continue;
    attachedSlotIds.add(slot.id);
    const [minimum, maximum] = ROLE_HEIGHT_BOUNDS[slot.role];
    if (slot.display.maxHeight > maximum) {
      issues.push({
        code: "IMAGE_SLOT_TOO_TALL",
        elementId: element.id,
        severity: "high",
        suggestion: `${slot.role} image slot should keep maxHeight within ${minimum}-${maximum}px.`,
      });
      repairActions.push({
        kind: "set_slot_max_height",
        elementId: element.id,
        slotId: slot.id,
        value: maximum,
        reason: `Cap ${slot.role} image slot to ${maximum}px.`,
      });
    }
    if (slot.display.minHeight && slot.display.minHeight > slot.display.maxHeight) {
      issues.push({
        code: "IMAGE_SLOT_MIN_HEIGHT_CONFLICT",
        elementId: element.id,
        severity: "medium",
        suggestion: "Image slot minHeight must not exceed maxHeight.",
      });
      repairActions.push({
        kind: "set_slot_max_height",
        elementId: element.id,
        slotId: slot.id,
        value: Math.max(slot.display.minHeight, minimum),
        reason: "Resolve image slot min/max height conflict.",
      });
    }
    const generationRatio = slot.generation.width / slot.generation.height;
    const displayRatio = ASPECT_RATIOS[slot.display.aspectRatio];
    if (Math.abs(generationRatio - displayRatio) / displayRatio > 0.08) {
      issues.push({
        code: "IMAGE_RATIO_MISMATCH",
        elementId: element.id,
        severity: "medium",
        suggestion: "Generation dimensions should match the display aspect token closely.",
      });
    }
    if (slot.placement === "background" && !["page", "section", "stack"].includes(element.type)) {
      issues.push({
        code: "BACKGROUND_TARGET_NOT_CONTAINER",
        elementId: element.id,
        severity: "high",
        suggestion: "Background image slots must be attached to containers only.",
      });
    }
    if (slot.placement === "inline" && element.type !== "image") {
      issues.push({
        code: "INLINE_SLOT_NOT_IMAGE",
        elementId: element.id,
        severity: "high",
        suggestion: "Inline image slots must be rendered by image elements.",
      });
    }
    if (slot.placement === "inline" && element.type === "image" && hasUnstableImageLayout(element)) {
      issues.push({
        code: "IMAGE_SLOT_UNSTABLE_LAYOUT",
        elementId: element.id,
        severity: "medium",
        suggestion: "Inline slot images should use hug height and avoid fixed pixel height so display metadata controls the rendered area.",
      });
      repairActions.push({
        kind: "set_slot_stable_layout",
        elementId: element.id,
        slotId: slot.id,
        value: slot,
        reason: "Use slot-driven image layout instead of fixed element sizing.",
      });
    }
  }

  const requiredSlotIds = [...slotsById.values()].filter((slot) => slot.placement === "inline" || slot.placement === "background").map((slot) => slot.id);
  const attachedRequiredCount = requiredSlotIds.filter((slotId) => attachedSlotIds.has(slotId)).length;
  if (isImageRequired(document) && requiredSlotIds.length >= 3 && attachedRequiredCount < 3) {
    issues.push({
      code: "IMAGE_SLOT_COVERAGE_TOO_LOW",
      elementId: document.tree.id,
      severity: "high",
      suggestion: "Non no-image designs need at least three stable image slots attached to renderable elements.",
    });
    for (const slot of slotsById.values()) {
      if (attachedSlotIds.has(slot.id)) continue;
      const target = findRepairTargetForSlot(document, slot);
      if (!target) continue;
      repairActions.push({
        kind: slot.placement === "background" ? "set_background_slot_metadata" : "restore_image_slot_metadata",
        elementId: target.id,
        slotId: slot.id,
        value: slot,
        reason: "Restore missing image slot metadata to satisfy required visual coverage.",
      });
    }
  }

  const firstContainer = firstTopLevelContainer(document, elementsById);
  if (firstContainer && !containsType(document, firstContainer.id, elementsById, "text")) {
    issues.push({ code: "MISSING_FIRST_VIEWPORT_TITLE", elementId: firstContainer.id, severity: "high", suggestion: "The first viewport should include a clear title." });
  }
  if (!document.elements.some((element) => element.type === "button")) {
    const elementId = firstContainer?.id ?? document.tree.id;
    issues.push({ code: "MISSING_PRIMARY_ACTION", elementId, severity: "high", suggestion: "Add or preserve a primary action in the first page flow." });
    repairActions.push({ kind: "add_missing_primary_action_note", elementId, value: true, reason: "Record missing primary action for downstream planning." });
  }
  if (isImageRequired(document) && !document.elements.some((element) => readLooseSlot(element)?.placement === "background" || element.type === "image")) {
    issues.push({ code: "MISSING_PRIMARY_VISUAL", elementId: document.tree.id, severity: "high", suggestion: "The page should include at least one primary visual region." });
  }

  if (isProductMarketingDocument(document)) {
    reviewProductContentQuality(document, elementsById, issues);
  }

  const mergedIssues = dedupeIssues([...issues, ...modelIssues]);
  const score = Math.max(0, 100 - mergedIssues.reduce((total, issue) => total + severityPenalty(issue.severity), 0));
  return {
    score,
    passed: score >= 80 && !mergedIssues.some((issue) => issue.severity === "high"),
    issues: mergedIssues,
    repairActions: dedupeActions(repairActions),
  };
}

function reviewProductContentQuality(
  document: DesignDocument,
  elementsById: Map<string, DesignElement>,
  issues: VisualReviewIssue[],
) {
  const textCount = document.elements.filter((element) => element.type === "text").length;
  const actionCount = document.elements.filter((element) => element.type === "button").length;
  const statCount = document.elements.filter((element) => element.type === "stat").length;
  const imageCount = document.elements.filter((element) => element.type === "image").length;

  if (treeDepth(document.tree) < 4) {
    issues.push({ code: "PRODUCT_HIERARCHY_TOO_SHALLOW", elementId: document.tree.id, severity: "high", suggestion: "Product pages need nested section, composition, and content groups rather than a flat section list." });
  }
  if (textCount < 15) {
    issues.push({ code: "PRODUCT_COPY_TOO_SPARSE", elementId: document.tree.id, severity: "high", suggestion: "Add complete hero, feature, specification, proof, and conversion copy; product pages require at least 15 text elements." });
  }
  if (actionCount < 2) {
    issues.push({ code: "PRODUCT_ACTIONS_TOO_SPARSE", elementId: "hero_section", severity: "high", suggestion: "Provide at least two clear product actions across the hero and closing conversion flow." });
  }
  if (statCount < 3) {
    issues.push({ code: "PRODUCT_PROOF_TOO_SPARSE", elementId: "proof_section", severity: "high", suggestion: "Support product claims with at least three metrics or specifications." });
  }
  if (imageCount > 5 || (imageCount > 0 && textCount / imageCount < 3)) {
    issues.push({ code: "PRODUCT_IMAGE_DOMINATED", elementId: document.tree.id, severity: "high", suggestion: "Reduce image repetition and pair every visual with meaningful copy; keep at least a 3:1 text-to-image ratio." });
  }

  for (const child of document.tree.children ?? []) {
    const element = elementsById.get(child.id);
    if (element?.type !== "section") continue;
    if (!containsType(document, child.id, elementsById, "text")) {
      issues.push({ code: "PRODUCT_SECTION_HAS_NO_COPY", elementId: child.id, severity: "high", suggestion: "Every product section except a deliberate gallery needs a heading and supporting copy." });
    }
  }

  for (const groupId of resolveProductContentGroups(document)) {
    const node = findTreeNode(document.tree, groupId);
    if (!node || collectTreeIds(node).length <= 1) {
      issues.push({ code: "PRODUCT_CONTENT_GROUP_EMPTY", elementId: groupId, severity: "high", suggestion: "Populate every planned product content group before final output." });
    }
  }
}

function isProductMarketingDocument(document: DesignDocument) {
  return hasMatchingElement(document, [/\bhero\b/, /\bheadline\b/])
    && hasMatchingElement(document, [/\bfeatures?\b/, /\bfeature grid\b/, /\bcapabilit(y|ies)\b/])
    && hasMatchingElement(document, [/\bcta\b/, /call to action/, /\bpurchase\b/]);
}

function resolveProductContentGroups(document: DesignDocument) {
  return Array.from(new Set([
    pickKnownProductContainerId(document, ["hero_copy", "stk-hero-copy"], [/hero[-_\s].*copy/, /\bhero copy\b/]),
    pickKnownProductContainerId(document, ["hero_actions", "stk-hero-actions"], [/hero[-_\s].*actions?/, /\bhero actions?\b/]),
    pickKnownProductContainerId(document, ["proof_metrics", "stk-proof-metrics"], [/proof[-_\s].*metrics?/, /\bproof metrics\b/]),
    pickKnownProductContainerId(document, ["features_grid", "stk-features-grid"], [/features?[-_\s].*grid/, /\bfeature grid\b/]),
    pickKnownProductContainerId(document, ["story_copy", "stk-story-copy", "stk-rules-content"], [/story[-_\s].*(copy|content)/, /rules[-_\s].*content/, /\bstory copy\b/, /\brules content\b/]),
    pickKnownProductContainerId(document, ["specifications_grid", "stk-specs-list"], [/(specs?|specifications?)[-_\s].*(grid|list)/]),
    pickKnownProductContainerId(document, ["social_grid", "stk-testimonials"], [/social[-_\s].*grid/, /\btestimonials?\b/, /\breviews?\b/]),
    pickKnownProductContainerId(document, ["cta_copy", "stk-cta-content"], [/cta[-_\s].*(copy|content|headline|body)/, /\bfinal cta\b/]),
    pickKnownProductContainerId(document, ["cta_actions", "stk-cta-actions"], [/cta[-_\s].*actions?/, /final[-_\s].*actions?/]),
  ].filter((id): id is string => Boolean(id))));
}

function pickKnownProductContainerId(document: DesignDocument, exactIds: string[], patterns: RegExp[]) {
  for (const id of exactIds) {
    if (document.elements.some((element) => element.id === id && isContainerElement(element))) return id;
  }
  return document.elements.find((element) => isContainerElement(element) && matchesElement(element, patterns))?.id;
}

function hasMatchingElement(document: DesignDocument, patterns: RegExp[]) {
  return document.elements.some((element) => matchesElement(element, patterns));
}

function matchesElement(element: DesignElement, patterns: RegExp[]) {
  const haystack = `${element.id} ${element.name}`.toLowerCase();
  return patterns.some((pattern) => pattern.test(haystack));
}

function isContainerElement(element: DesignElement) {
  return element.type === "page" || element.type === "section" || element.type === "stack";
}

function treeDepth(node: DesignDocument["tree"]): number {
  return 1 + Math.max(0, ...(node.children ?? []).map(treeDepth));
}

function collectImageSlots(document: DesignDocument): Map<string, DesignImageSlot> {
  const slots = new Map<string, DesignImageSlot>();
  for (const element of document.elements) {
    const slot = readLooseSlot(element);
    if (slot) slots.set(slot.id, slot);
  }

  for (const slot of readSlotsFromAgentPlanning(document)) slots.set(slot.id, slot);
  return slots;
}

function readSlotsFromAgentPlanning(document: DesignDocument): DesignImageSlot[] {
  const agentPlanning = readRecord(document.variables.agentPlanning);
  const visualSlotReview = readRecord(agentPlanning?.visualSlotReview);
  const layoutPlan = readRecord(visualSlotReview?.layoutPlan) ?? readRecord(agentPlanning?.layoutPlan);
  const imageSlots = layoutPlan?.imageSlots;
  if (!Array.isArray(imageSlots)) return [];
  return imageSlots.flatMap((slot) => {
    const parsed = designImageSlotSchema.safeParse(slot);
    return parsed.success ? [parsed.data] : [];
  });
}

function resolveSlotForElement(element: DesignElement, slotsById: Map<string, DesignImageSlot>): DesignImageSlot | undefined {
  const slotId = typeof element.props.imageSlotId === "string" ? element.props.imageSlotId : element.id;
  const direct = slotsById.get(slotId);
  if (direct && (direct.placement === "inline" || direct.parentId === element.id)) return direct;
  for (const slot of slotsById.values()) {
    if (slot.placement === "background" && slot.parentId === element.id) return slot;
  }
  return undefined;
}

function findRepairTargetForSlot(document: DesignDocument, slot: DesignImageSlot): DesignElement | undefined {
  if (slot.placement === "inline") return document.elements.find((element) => element.id === slot.id && element.type === "image");
  return document.elements.find((element) => element.id === slot.parentId && ["page", "section", "stack"].includes(element.type));
}

function hasUnstableImageLayout(element: DesignElement): boolean {
  return element.layout?.height !== "hug" || element.layout.fixedHeight !== undefined;
}

function isImageRequired(document: DesignDocument): boolean {
  const agentPlanning = readRecord(document.variables.agentPlanning);
  const visualAssetPlan = readRecord(agentPlanning?.visualAssetPlan);
  if (visualAssetPlan?.imagePolicy === "none") return false;
  if (visualAssetPlan?.imagePolicy === "required") return true;
  return readSlotsFromAgentPlanning(document).length > 0;
}

function readLooseSlot(element: DesignElement): DesignImageSlot | undefined {
  const value = element.props?.imageSlot;
  if (!value || typeof value !== "object") return undefined;
  const parsed = designImageSlotSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const candidate = value as Partial<DesignImageSlot>;
  if (!candidate.id || !candidate.parentId || !candidate.role || !candidate.placement || !candidate.display || !candidate.generation) return undefined;
  if (!["hero", "section", "card", "gallery"].includes(candidate.role)) return undefined;
  if (!["background", "inline"].includes(candidate.placement)) return undefined;
  return candidate as DesignImageSlot;
}

function firstTopLevelContainer(document: DesignDocument, elementsById: Map<string, DesignElement>) {
  const firstChild = document.tree.children?.[0];
  const element = firstChild ? elementsById.get(firstChild.id) : elementsById.get(document.tree.id);
  return element && ["page", "section", "stack"].includes(element.type) ? element : undefined;
}

function containsType(document: DesignDocument, rootId: string, elementsById: Map<string, DesignElement>, type: DesignElement["type"]) {
  const node = findTreeNode(document.tree, rootId);
  if (!node) return false;
  const ids = collectTreeIds(node);
  return ids.some((id) => elementsById.get(id)?.type === type);
}

function findTreeNode(node: DesignDocument["tree"], id: string): DesignDocument["tree"] | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findTreeNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function collectTreeIds(node: DesignDocument["tree"]): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectTreeIds)];
}

function severityPenalty(severity: VisualReviewIssue["severity"]) {
  if (severity === "high") return 25;
  if (severity === "medium") return 12;
  return 5;
}

function dedupeIssues(issues: VisualReviewIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.elementId ?? "document"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeActions(actions: VisualRepairAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.kind}:${action.elementId}:${action.slotId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
