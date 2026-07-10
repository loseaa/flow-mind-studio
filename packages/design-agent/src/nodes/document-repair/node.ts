import { designDocumentSchema, designImageSlotSchema, type DesignDocument, type DesignElement, type DesignImageSlot, type JsonValue } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import type { ReflectionRepairOutput } from "../reflection-repair/schema.js";
import type { VisualRepairAction, VisualReviewOutput } from "../visual-review/schema.js";
import type { DocumentRepairOutput } from "./schema.js";

type SchemaValidationArtifactOutput = {
  document?: unknown;
  errors?: string[];
};

export async function documentRepairNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const schemaValidationRef = state.latestArtifactRefs.schema_validation;
  const visualReviewRef = state.latestArtifactRefs.visual_review;
  const reflectionRepairRef = state.latestArtifactRefs.reflection_repair;
  if (!options.artifactStore || !schemaValidationRef) {
    throw new Error("Missing required artifacts for document_repair.");
  }

  if (state.currentNode === "visual_review" || state.stage === "visual_review") {
    if (!visualReviewRef) throw new Error("Missing visual_review artifact for document_repair.");
    return repairFromVisualReview(state, options, schemaValidationRef as ArtifactRef, visualReviewRef as ArtifactRef);
  }

  if (!reflectionRepairRef) throw new Error("Missing reflection_repair artifact for document_repair.");
  return repairFromReflection(state, options, schemaValidationRef as ArtifactRef, reflectionRepairRef as ArtifactRef);
}

async function repairFromReflection(
  state: DesignAgentState,
  options: GraphNodeOptions,
  schemaValidationRef: ArtifactRef,
  reflectionRepairRef: ArtifactRef,
): Promise<Partial<DesignAgentState>> {
  const schemaValidationArtifact = await options.artifactStore!.readArtifact<SchemaValidationArtifactOutput>(schemaValidationRef);
  const reflectionRepairArtifact = await options.artifactStore!.readArtifact<ReflectionRepairOutput>(reflectionRepairRef);
  const appliedOperations = reflectionRepairArtifact.output.repairPlan.operations;
  const document = repairDocument(schemaValidationArtifact.output.document);
  const output: DocumentRepairOutput = {
    document,
    repaired: true,
    appliedOperations,
    sourceArtifacts: {
      schemaValidation: schemaValidationRef,
      reflectionRepair: reflectionRepairRef,
    },
  };
  return writeRepairArtifact(state, options, [schemaValidationRef, reflectionRepairRef], output);
}

async function repairFromVisualReview(
  state: DesignAgentState,
  options: GraphNodeOptions,
  schemaValidationRef: ArtifactRef,
  visualReviewRef: ArtifactRef,
): Promise<Partial<DesignAgentState>> {
  const visualReviewArtifact = await options.artifactStore!.readArtifact<VisualReviewOutput>(visualReviewRef);
  const sourceDocument = designDocumentSchema.parse(visualReviewArtifact.output.document);
  const { document, appliedOperations } = applyVisualRepairActions(sourceDocument, visualReviewArtifact.output.review.repairActions);
  const output: DocumentRepairOutput = {
    document,
    repaired: appliedOperations.length > 0,
    appliedOperations,
    sourceArtifacts: {
      schemaValidation: schemaValidationRef,
      visualReview: visualReviewRef,
    },
  };
  return writeRepairArtifact(state, options, [schemaValidationRef, visualReviewRef], output);
}

async function writeRepairArtifact(
  state: DesignAgentState,
  options: GraphNodeOptions,
  inputRefs: ArtifactRef[],
  output: DocumentRepairOutput,
): Promise<Partial<DesignAgentState>> {
  const update = await writePipelineArtifact({
    state,
    options,
    node: "document_repair",
    stage: "document_repair",
    inputRefs,
    output,
    errors: [],
  });

  return {
    ...update,
    repairAttempts: state.repairAttempts + 1,
    validationErrors: [],
  };
}

export function applyVisualRepairActions(document: DesignDocument, actions: VisualRepairAction[]) {
  const repaired = structuredClone(document) as DesignDocument;
  const appliedOperations: DocumentRepairOutput["appliedOperations"] = [];

  for (const action of actions) {
    const index = repaired.elements.findIndex((element) => element.id === action.elementId);
    const element = repaired.elements[index];
    if (!element) continue;
    if (applyVisualRepairAction(element, action, repaired)) {
      repaired.elements[index] = element;
      appliedOperations.push({ target: action.elementId, action: action.kind, reason: action.reason });
    }
  }

  return { document: designDocumentSchema.parse(repaired), appliedOperations };
}

function applyVisualRepairAction(element: DesignElement, action: VisualRepairAction, document: DesignDocument): boolean {
  if (action.kind === "add_missing_primary_action_note") {
    const notes = readRepairNotes(document.variables.visualRepairNotes);
    document.variables.visualRepairNotes = [...notes, { elementId: action.elementId, reason: action.reason, value: action.value }] as JsonValue;
    return true;
  }

  if (action.kind === "set_container_overflow") {
    if (!("container" in element.style) || typeof action.value !== "string") return false;
    if (!["visible", "hidden", "auto"].includes(action.value)) return false;
    element.style = { ...element.style, container: { ...element.style.container, overflow: action.value as "visible" | "hidden" | "auto" } };
    return true;
  }

  if (action.kind === "restore_image_slot_metadata" || action.kind === "set_background_slot_metadata") {
    const slot = parseActionSlot(action);
    if (!slot) return false;
    if (action.kind === "restore_image_slot_metadata" && element.type !== "image") return false;
    if (action.kind === "set_background_slot_metadata" && !["page", "section", "stack"].includes(element.type)) return false;
    element.props = { ...element.props, imageSlotId: slot.id, imageSlot: slot };
    return true;
  }

  if (action.kind === "set_slot_stable_layout") {
    const slot = parseActionSlot(action) ?? designImageSlotSchema.safeParse(element.props.imageSlot).data;
    if (!slot || element.type !== "image") return false;
    element.props = { ...element.props, imageSlotId: slot.id, imageSlot: slot };
    element.layout = { ...element.layout, width: element.layout?.width ?? "fill", height: "hug", fixedHeight: undefined };
    if ("image" in element.style) {
      element.style = {
        ...element.style,
        image: {
          ...element.style.image,
          aspectRatio: imageStyleAspectRatio(slot.display.aspectRatio),
          objectFit: slot.display.objectFit,
        },
      };
    }
    return true;
  }

  const parsedSlot = designImageSlotSchema.safeParse(element.props.imageSlot);
  if (!parsedSlot.success || (action.slotId && parsedSlot.data.id !== action.slotId)) return false;
  const slot = structuredClone(parsedSlot.data) as DesignImageSlot;

  if (action.kind === "set_slot_max_height" && typeof action.value === "number") {
    slot.display.maxHeight = Math.trunc(action.value);
  } else if (action.kind === "set_slot_aspect_ratio" && typeof action.value === "string" && isSlotAspectRatio(action.value)) {
    slot.display.aspectRatio = action.value;
  } else if (action.kind === "set_slot_object_fit" && typeof action.value === "string" && isObjectFit(action.value)) {
    slot.display.objectFit = action.value;
  } else if (action.kind === "set_slot_focal_point" && typeof action.value === "string" && isFocalPoint(action.value)) {
    slot.display.focalPoint = action.value;
  } else {
    return false;
  }

  element.props = { ...element.props, imageSlotId: slot.id, imageSlot: designImageSlotSchema.parse(slot) };
  return true;
}

function parseActionSlot(action: VisualRepairAction): DesignImageSlot | undefined {
  const parsed = designImageSlotSchema.safeParse(action.value);
  if (!parsed.success) return undefined;
  if (action.slotId && parsed.data.id !== action.slotId) return undefined;
  return parsed.data;
}

function imageStyleAspectRatio(value: DesignImageSlot["display"]["aspectRatio"]): "wide" | "square" | "portrait" {
  if (value === "1:1") return "square";
  if (value === "3:4") return "portrait";
  return "wide";
}

function readRepairNotes(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value.filter((item): item is JsonValue => item !== undefined) : [];
}

function isSlotAspectRatio(value: string): value is DesignImageSlot["display"]["aspectRatio"] {
  return ["16:9", "4:3", "3:2", "1:1", "3:4"].includes(value);
}

function isObjectFit(value: string): value is DesignImageSlot["display"]["objectFit"] {
  return value === "cover" || value === "contain";
}

function isFocalPoint(value: string): value is DesignImageSlot["display"]["focalPoint"] {
  return ["center", "top", "left", "right"].includes(value);
}

function repairDocument(value: unknown): DesignDocument {
  const parsed = designDocumentSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  return designDocumentSchema.parse(buildMinimumDocument(value));
}

function buildMinimumDocument(value: unknown) {
  const input = isObject(value) ? value : {};
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : "repaired_design_document";
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Repaired Design Document";
  const canvasWidth = isObject(input.canvas) && typeof input.canvas.width === "number" && input.canvas.width > 0
    ? Math.trunc(input.canvas.width)
    : 1440;

  return {
    schemaVersion: "fm-design/v1",
    id,
    name,
    canvas: { viewport: "desktop" as const, width: canvasWidth, background: "muted" as const },
    tree: {
      id: "page_root",
      children: [{ id: "repair_notice", children: [] }],
    },
    elements: [
      {
        id: "page_root",
        name: "Page",
        type: "page",
        layout: { display: "flex", direction: "vertical", gap: "md", padding: "lg", width: "fill" },
        props: {},
        style: containerStyle("surface"),
      },
      {
        id: "repair_notice",
        name: "Repair Notice",
        type: "text",
        props: { text: "The design document was repaired to satisfy the schema." },
        style: textStyle("body", "md", "regular", "textSecondary"),
      },
    ],
    variables: {},
  };
}

function containerStyle(backgroundColor: "surface" | "white") {
  return {
    base: baseStyle(backgroundColor, "textPrimary", "md", "regular"),
    container: {
      shadow: "none" as const,
      overflow: "visible" as const,
      surface: backgroundColor === "white" ? "card" as const : "flat" as const,
    },
  };
}

function textStyle(role: "heading" | "body", fontSize: "md" | "2xl", fontWeight: "regular" | "bold", color: "textPrimary" | "textSecondary") {
  return {
    base: baseStyle("transparent", color, fontSize, fontWeight),
    text: {
      role,
      decoration: "none" as const,
      transform: "none" as const,
    },
  };
}

function baseStyle(backgroundColor: "transparent" | "surface" | "white", color: "textPrimary" | "textSecondary", fontSize: "md" | "2xl", fontWeight: "regular" | "bold") {
  return {
    backgroundColor,
    radius: "md" as const,
    border: {
      width: "none" as const,
      style: "none" as const,
      color: "border" as const,
    },
    text: {
      color,
      fontFamily: "sans" as const,
      fontSize,
      fontWeight,
      lineHeight: "normal" as const,
      align: "left" as const,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
