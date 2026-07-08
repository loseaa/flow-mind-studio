import type { DesignDocument } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { failPipelineNode, readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { compileSemanticElementPlan } from "./compiler.js";
import { elementPlanningPrompt } from "./prompt.js";
import {
  elementPlanningModelOutputSchema,
  type ElementPlan,
  type ElementPlanningOutput,
} from "./schema.js";

export async function elementPlanningNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "visual_slot_review");
  const planned = await createElementDocument(state, document, options, inputRefs);
  const output: ElementPlanningOutput = {
    document: planned.document,
    elementPlan: planned.elementPlan,
  };

  return writePipelineArtifact({
    state,
    options,
    node: "element_planning",
    stage: "element_planning",
    inputRefs,
    output,
    errors: planned.errors,
  });
}

async function createElementDocument(
  state: DesignAgentState,
  document: DesignDocument,
  options: GraphNodeOptions,
  inputRefs: ArtifactRef[],
) {
  const fallback = fallbackElementPlan();
  if (!options.createStructuredOutput) {
    return { elementPlan: fallback, document: compileSemanticElementPlan(document, fallback), errors: [] };
  }

  try {
    const elementPlan = await invokeElementModel(options, buildElementPlanningInput(state, document));
    return { elementPlan, document: compileSemanticElementPlan(document, elementPlan), errors: [] };
  } catch (firstError) {
    try {
      const elementPlan = await invokeElementModel(
        options,
        buildElementRetryInput(state, document, firstError),
      );
      return { elementPlan, document: compileSemanticElementPlan(document, elementPlan), errors: [] };
    } catch (retryError) {
      const errors = [`${formatDiagnosticError(firstError)}\nRetry failed: ${formatDiagnosticError(retryError)}`];
      return failPipelineNode({
        options,
        node: "element_planning",
        inputRefs,
        output: { elementPlan: null, document },
        errors,
      });
    }
  }
}

async function invokeElementModel(options: GraphNodeOptions, input: string): Promise<ElementPlan> {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  const output = elementPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(elementPlanningModelOutputSchema).invoke(input),
  );
  return output.elementPlan;
}

export function buildElementPlanningInput(state: DesignAgentState, document: DesignDocument): string {
  return [
    elementPlanningPrompt,
    "",
    "Confirmed intent dimensions:",
    JSON.stringify(state.dimensions, null, 2),
    "",
    "Layout planning artifact ref:",
    JSON.stringify(state.latestArtifactRefs.visual_slot_review ?? null, null, 2),
    "",
    "Available parent containers:",
    JSON.stringify(containerSummaries(document), null, 2),
    "",
    "Current structure tree:",
    JSON.stringify(document.tree, null, 2),
  ].join("\n");
}

function buildElementRetryInput(
  state: DesignAgentState,
  document: DesignDocument,
  error: unknown,
) {
  return [
    buildElementPlanningInput(state, document),
    "",
    "The previous element plan was rejected by schema or reference validation.",
    `Validation error: ${summarizeError(error)}`,
    "Generate the complete flat elementPlan again. Use only the listed parent container ids.",
    "Use this object only as a shape example and replace its content for the confirmed intent:",
    JSON.stringify(exampleElementPlan(document), null, 2),
  ].join("\n");
}

function containerSummaries(document: DesignDocument) {
  return document.elements
    .filter((element) => element.type === "page" || element.type === "section" || element.type === "stack")
    .map((element) => ({
      id: element.id,
      name: element.name,
      type: element.type,
      purpose: element.props.purpose ?? null,
    }));
}

function exampleElementPlan(document: DesignDocument): ElementPlan {
  const parent = containerSummaries(document).find((element) => element.type !== "page")
    ?? containerSummaries(document)[0];
  return {
    elements: parent ? [{
      id: "example_heading",
      parentId: parent.id,
      order: 0,
      type: "text",
      name: "Example Heading",
      purpose: "Introduce this region",
      content: "Example heading",
      attributes: [{ key: "role", value: "heading" }],
    }] : [],
    notes: ["Replace the example with intent-specific elements."],
  };
}

function fallbackElementPlan(): ElementPlan {
  return {
    elements: [],
    notes: ["Deterministic fallback preserves the compiled page structure without adding content elements."],
  };
}

function formatDiagnosticError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= 4000) return message;
  return `${message.slice(0, 1900)}\n[error middle truncated]\n${message.slice(-1900)}`;
}

function summarizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const parserErrorIndex = message.lastIndexOf("\nError:");
  const summary = parserErrorIndex >= 0 ? message.slice(parserErrorIndex + 1) : message;
  return summary.length <= 1200 ? summary : summary.slice(-1200);
}