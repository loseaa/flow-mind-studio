import { designDocumentSchema } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { visualReviewPrompt } from "./prompt.js";
import { reviewVisualQualityWithRules } from "./rules.js";
import { visualReviewModelOutputSchema, type VisualReviewIssue, type VisualReviewOutput } from "./schema.js";

type SchemaValidationArtifactOutput = {
  document?: unknown;
  valid?: boolean;
  errors?: string[];
};

export async function visualReviewNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const sourceArtifact = state.latestArtifactRefs.schema_validation;
  if (!options.artifactStore || !sourceArtifact) throw new Error("Missing required artifact for visual_review.");

  const schemaArtifact = await options.artifactStore.readArtifact<SchemaValidationArtifactOutput>(sourceArtifact);
  const document = designDocumentSchema.parse(schemaArtifact.output.document);
  const modelOutput = await createModelReview(document, state, options);
  const review = reviewVisualQualityWithRules(document, modelOutput.issues);
  const output: VisualReviewOutput = {
    document,
    review,
    sourceArtifact: sourceArtifact as ArtifactRef,
    modelNotes: modelOutput.notes,
  };

  return writePipelineArtifact({
    state,
    options,
    node: "visual_review",
    stage: "visual_review",
    inputRefs: [sourceArtifact],
    output,
    errors: review.passed ? [] : review.issues.map((issue) => `${issue.code}: ${issue.suggestion}`),
  });
}

async function createModelReview(
  document: unknown,
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<{ issues: VisualReviewIssue[]; notes: string[] }> {
  if (!options.createStructuredOutput) return { issues: [], notes: [] };
  try {
    return visualReviewModelOutputSchema.parse(
      await options.createStructuredOutput(visualReviewModelOutputSchema, { node: "visual_review" }).invoke(buildVisualReviewInput(document, state)),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issues: [], notes: [`Model visual review unavailable; deterministic rules were used. ${message.slice(0, 300)}`] };
  }
}

export function buildVisualReviewInput(document: unknown, state: DesignAgentState) {
  return [
    visualReviewPrompt,
    "",
    "Confirmed intent dimensions:",
    JSON.stringify(state.dimensions.map(({ key, value }) => ({ key, value })), null, 2),
    "",
    "Design document:",
    JSON.stringify(document, null, 2),
  ].join("\n");
}
