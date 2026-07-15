import type { DesignDocument, DesignElement } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { contentPlanSchema, type ContentPlan } from "../content-planning/schema.js";
import { failPipelineNode, readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";

export async function preflightReviewNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "style_planning");
  const contentRef = state.latestArtifactRefs.content_planning;
  if (!options.artifactStore || !contentRef) throw new Error("Missing required artifact for content_planning.");
  const contentArtifact = await options.artifactStore.readArtifact<{ contentPlan?: unknown }>(contentRef);
  const contentPlan = contentPlanSchema.parse(contentArtifact.output.contentPlan);
  const errors = reviewPreflight(document, contentPlan, state);
  const refs = [contentRef as ArtifactRef, ...inputRefs];

  if (errors.length > 0) {
    return failPipelineNode({
      options,
      node: "preflight_review",
      inputRefs: refs,
      output: { document, contentPlan, passed: false, issues: errors },
      errors,
    });
  }

  return writePipelineArtifact({
    state,
    options,
    node: "preflight_review",
    stage: "preflight_review",
    inputRefs: refs,
    output: { document, contentPlan, passed: true, issues: [] },
  });
}

export function reviewPreflight(
  document: DesignDocument,
  contentPlan: ContentPlan,
  state: Pick<DesignAgentState, "dimensions">,
): string[] {
  const errors: string[] = [];
  const ids = new Set(document.elements.map((element) => element.id));
  const count = (type: DesignElement["type"]) => document.elements.filter((element) => element.type === type).length;
  const mobileIntent = state.dimensions.some((dimension) => {
    if (dimension.key !== "page_context" || !dimension.value || typeof dimension.value !== "object" || Array.isArray(dimension.value)) return false;
    const deviceType = String((dimension.value as Record<string, unknown>).deviceType ?? "");
    return /mobile|phone|移动端|手机端/i.test(deviceType);
  });

  if (mobileIntent && document.canvas.viewport !== "mobile") {
    errors.push(`PREFLIGHT_VIEWPORT_MISMATCH: Mobile intent requires a mobile canvas; received ${document.canvas.viewport}.`);
  }
  if (document.canvas.viewport === "mobile") {
    const overflow = document.elements.find((element) => (element.layout?.fixedWidth ?? 0) > document.canvas.width);
    if (overflow) errors.push(`PREFLIGHT_MOBILE_OVERFLOW: ${overflow.id} fixedWidth exceeds the ${document.canvas.width}px canvas.`);
  }

  if (contentPlan.archetype === "operational") {
    for (const id of ["filters_section", "metrics_section", "table_section", "form_section", "actions_section"]) {
      if (!ids.has(id)) errors.push(`PREFLIGHT_OPERATIONAL_STRUCTURE: Missing required section ${id}.`);
    }
    for (const [type, minimum] of [["filter", 1], ["stat", 3], ["table", 1], ["form", 1], ["button", 2]] as const) {
      if (count(type) < minimum) errors.push(`PREFLIGHT_OPERATIONAL_CONTENT: Expected at least ${minimum} ${type} elements; received ${count(type)}.`);
    }
    if (count("image") > 0) errors.push("PREFLIGHT_OPERATIONAL_IMAGES: Operational pages must not generate decorative image slots.");
  }

  if (contentPlan.archetype === "product_marketing") {
    if (!hasProductNarrativeStructure(document)) {
      errors.push("PREFLIGHT_PRODUCT_STRUCTURE: Product narrative structure is incomplete.");
    }
    if (count("text") < contentPlan.qualityTargets.minimumTextElements || count("button") < contentPlan.qualityTargets.minimumActions) {
      errors.push("PREFLIGHT_PRODUCT_CONTENT: Product copy or actions do not meet the content contract.");
    }
  }

  const textElements = document.elements.filter((element) => element.type === "text");
  if (textElements.length > 0 && !textElements.some((element) => element.style.text.role === "heading")) {
    errors.push("PREFLIGHT_TEXT_HIERARCHY: The document has no heading style.");
  }
  const buttons = document.elements.filter((element) => element.type === "button");
  if (buttons.length > 1) {
    const emphases = new Set(buttons.map((element) => element.style.button.emphasis));
    if (!emphases.has("primary") || !emphases.has("secondary")) {
      errors.push("PREFLIGHT_ACTION_HIERARCHY: Multiple actions require both primary and secondary emphasis.");
    }
  }

  return errors;
}

function hasProductNarrativeStructure(document: DesignDocument) {
  return hasMatchingElement(document, [/\bhero\b/, /\bheadline\b/])
    && hasMatchingElement(document, [/\bfeatures?\b/, /\bfeature grid\b/, /\bcapabilit(y|ies)\b/])
    && hasMatchingElement(document, [/\bcta\b/, /call to action/, /\bpurchase\b/]);
}

function hasMatchingElement(document: DesignDocument, patterns: RegExp[]) {
  return document.elements.some((element) => {
    const haystack = `${element.id} ${element.name} ${String(element.props.purpose ?? "")}`.toLowerCase();
    return patterns.some((pattern) => pattern.test(haystack));
  });
}
