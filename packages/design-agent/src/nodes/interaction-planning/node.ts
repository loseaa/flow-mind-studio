import type { DesignDocument } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { failPipelineNode, readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { compileInteractionPlan } from "./compiler.js";
import { interactionPlanningPrompt } from "./prompt.js";
import {
  interactionPlanningModelOutputSchema,
  type InteractionPlan,
  type InteractionPlanningOutput,
} from "./schema.js";

export async function interactionPlanningNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "element_planning");
  const planned = await createInteractionDocument(state, document, options, inputRefs);
  const output: InteractionPlanningOutput = {
    document: planned.document,
    interactionPlan: planned.interactionPlan,
  };

  return writePipelineArtifact({
    state,
    options,
    node: "interaction_planning",
    stage: "interaction_planning",
    inputRefs,
    output,
    errors: planned.errors,
  });
}

async function createInteractionDocument(
  state: DesignAgentState,
  document: DesignDocument,
  options: GraphNodeOptions,
  inputRefs: ArtifactRef[],
) {
  const fallback = fallbackInteractionPlan();
  if (!options.createStructuredOutput) {
    return { interactionPlan: fallback, document: compileInteractionPlan(document, fallback), errors: [] };
  }

  try {
    const interactionPlan = await invokeInteractionModel(options, buildInteractionPlanningInput(state, document));
    return { interactionPlan, document: compileInteractionPlan(document, interactionPlan), errors: [] };
  } catch (firstError) {
    try {
      const interactionPlan = await invokeInteractionModel(
        options,
        buildInteractionRetryInput(state, document, firstError),
      );
      return { interactionPlan, document: compileInteractionPlan(document, interactionPlan), errors: [] };
    } catch (retryError) {
      const errors = [`${formatError(firstError)}\nRetry failed: ${formatError(retryError)}`];
      return failPipelineNode({
        options,
        node: "interaction_planning",
        inputRefs,
        output: { interactionPlan: null, document },
        errors,
      });
    }
  }
}

async function invokeInteractionModel(options: GraphNodeOptions, input: string): Promise<InteractionPlan> {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  const output = interactionPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(interactionPlanningModelOutputSchema).invoke(input),
  );
  return output.interactionPlan;
}

export function buildInteractionPlanningInput(state: DesignAgentState, document: DesignDocument): string {
  return [
    interactionPlanningPrompt,
    "",
    "Confirmed interaction intent:",
    JSON.stringify(
      state.dimensions.find((dimension) => dimension.key === "interaction_flow") ?? null,
      null,
      2,
    ),
    "",
    "Available elements:",
    JSON.stringify(elementSummaries(document), null, 2),
  ].join("\n");
}

function buildInteractionRetryInput(
  state: DesignAgentState,
  document: DesignDocument,
  error: unknown,
) {
  return [
    buildInteractionPlanningInput(state, document),
    "",
    "The previous interaction plan was rejected by schema or element reference validation.",
    `Validation error: ${formatError(error)}`,
    "Generate the complete interactionPlan again. Use only ids from Available elements.",
    "Valid empty shape: {\"interactionPlan\":{\"interactions\":[],\"notes\":[]}}",
  ].join("\n");
}

function elementSummaries(document: DesignDocument) {
  return document.elements.map((element) => ({
    id: element.id,
    name: element.name,
    type: element.type,
    purpose: element.props.purpose ?? null,
  }));
}

function fallbackInteractionPlan(): InteractionPlan {
  return {
    interactions: [],
    notes: ["Deterministic fallback preserves the element document without explicit interactions."],
  };
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 4000 ? message : `${message.slice(0, 4000)}\n[error truncated]`;
}
