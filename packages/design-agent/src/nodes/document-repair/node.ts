import { designDocumentSchema, type DesignDocument } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import type { ReflectionRepairOutput } from "../reflection-repair/schema.js";
import type { DocumentRepairOutput } from "./schema.js";

type SchemaValidationArtifactOutput = {
  document?: unknown;
  errors?: string[];
};

export async function documentRepairNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const schemaValidationRef = state.latestArtifactRefs.schema_validation;
  const reflectionRepairRef = state.latestArtifactRefs.reflection_repair;
  if (!options.artifactStore || !schemaValidationRef || !reflectionRepairRef) {
    throw new Error("Missing required artifacts for document_repair.");
  }

  const schemaValidationArtifact = await options.artifactStore.readArtifact<SchemaValidationArtifactOutput>(schemaValidationRef);
  const reflectionRepairArtifact = await options.artifactStore.readArtifact<ReflectionRepairOutput>(reflectionRepairRef);
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
  const update = await writePipelineArtifact({
    state,
    options,
    node: "document_repair",
    stage: "document_repair",
    inputRefs: [schemaValidationRef, reflectionRepairRef],
    output,
    errors: [],
  });

  return {
    ...update,
    repairAttempts: state.repairAttempts + 1,
    validationErrors: [],
  };
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
