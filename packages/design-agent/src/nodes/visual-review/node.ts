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
  const modelOutput = options.createStructuredOutput
    ? visualReviewModelOutputSchema.parse(
        await options.createStructuredOutput(visualReviewModelOutputSchema).invoke(buildVisualReviewInput(document, state)),
      )
    : { issues: [] as VisualReviewIssue[], notes: [] as string[] };
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
