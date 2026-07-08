import {
  designDocumentSchema,
  designImageSlotSchema,
  type DesignBaseStyle,
  type DesignDocument,
  type DesignElement,
  type DesignImageSlot,
  type DesignTreeNode,
} from "@flowmind/shared";

import type { DesignAgentState } from "../../state.js";
import { failPipelineNode, writePipelineArtifact } from "../document-pipeline.js";
import { layoutPlanSchema, type LayoutPlanningOutput } from "../layout-planning/schema.js";
import type { GraphNodeOptions } from "../types.js";
import { visualSlotReviewDataSchema, type VisualSlotReviewOutput } from "./schema.js";

export async function visualSlotReviewNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const inputRef = state.latestArtifactRefs.layout_planning;
  if (!options.artifactStore || !inputRef) throw new Error("Missing required artifact for layout_planning.");

  try {
    const artifact = await options.artifactStore.readArtifact<LayoutPlanningOutput>(inputRef);
    const document = designDocumentSchema.parse(artifact.output.document);
    const layoutPlan = layoutPlanSchema.parse(artifact.output.layoutPlan);
    const compiled = compileSlots(document, layoutPlan.imageSlots);
    const review = visualSlotReviewDataSchema.parse({ layoutPlan, issues: [] });
    const output: VisualSlotReviewOutput = { document: compiled, ...review };
    return writePipelineArtifact({
      state,
      options,
      node: "visual_slot_review",
      stage: "visual_slot_review",
      inputRefs: [inputRef],
      output,
      errors: [],
    });
  } catch (error) {
    return failPipelineNode({
      options,
      node: "visual_slot_review",
      inputRefs: [inputRef],
      output: { document: null, layoutPlan: null, issues: [] },
      errors: [formatError(error)],
    });
  }
}

function compileSlots(document: DesignDocument, rawSlots: DesignImageSlot[]): DesignDocument {
  const slots = rawSlots.map((slot) => designImageSlotSchema.parse(slot));
  const elements = new Map(document.elements.map((element) => [element.id, element]));
  const slotIds = new Set<string>();
  const backgroundParents = new Set<string>();
  const inlineByParent = new Map<string, DesignImageSlot[]>();

  for (const slot of slots) {
    if (slotIds.has(slot.id)) throw new Error(`Duplicate image slot id: ${slot.id}`);
    if (elements.has(slot.id)) throw new Error(`Image slot id conflicts with element id: ${slot.id}`);
    slotIds.add(slot.id);
    const parent = elements.get(slot.parentId);
    if (!parent || !["page", "section", "stack"].includes(parent.type)) {
      throw new Error(`Image slot parent is invalid: ${slot.parentId}`);
    }
    if (slot.placement === "background") {
      if (backgroundParents.has(slot.parentId)) {
        throw new Error(`Multiple background image slots target parent: ${slot.parentId}`);
      }
      backgroundParents.add(slot.parentId);
    }
    if (slot.placement === "inline") {
      const children = inlineByParent.get(slot.parentId) ?? [];
      children.push(slot);
      inlineByParent.set(slot.parentId, children);
    }
  }

  const compiledElements: DesignElement[] = document.elements.map((element) => {
    const slot = slots.find((candidate) => candidate.placement === "background" && candidate.parentId === element.id);
    if (!slot) return element;
    return { ...element, props: { ...element.props, imageSlotId: slot.id, imageSlot: slot } };
  });
  for (const slot of slots.filter((candidate) => candidate.placement === "inline")) {
    compiledElements.push(createInlineImage(slot));
  }

  const appendSlots = (node: DesignTreeNode): DesignTreeNode => ({
    id: node.id,
    children: [
      ...(node.children ?? []).map(appendSlots),
      ...(inlineByParent.get(node.id) ?? []).map((slot) => ({ id: slot.id, children: [] })),
    ],
  });

  return designDocumentSchema.parse({
    ...document,
    tree: appendSlots(document.tree),
    elements: compiledElements,
  });
}

function createInlineImage(slot: DesignImageSlot): DesignElement {
  return {
    id: slot.id,
    type: "image",
    name: `${slot.role} image`,
    layout: { width: slot.display.width === "fill" ? "fill" : "hug", height: "hug" },
    props: { imageSlotId: slot.id, imageSlot: slot, alt: `${slot.role} visual` },
    style: {
      base: baseStyle(),
      image: {
        aspectRatio: slot.display.aspectRatio === "1:1" ? "square" : slot.display.aspectRatio === "3:4" ? "portrait" : "wide",
        objectFit: slot.display.objectFit,
      },
    },
  };
}

function baseStyle(): DesignBaseStyle {
  return {
    backgroundColor: "muted",
    radius: "md",
    border: { width: "none", style: "none", color: "border" },
    text: {
      color: "textPrimary",
      fontFamily: "sans",
      fontSize: "md",
      fontWeight: "regular",
      lineHeight: "normal",
      align: "left",
    },
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}