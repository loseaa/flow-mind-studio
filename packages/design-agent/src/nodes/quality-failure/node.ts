import type { DesignAgentState } from "../../state.js";
import { failPipelineNode } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";

export async function qualityFailureNode(state: DesignAgentState, options: GraphNodeOptions): Promise<never> {
  const ref = state.latestArtifactRefs.visual_review;
  if (!options.artifactStore || !ref) throw new Error("Missing visual_review artifact for quality failure.");
  const artifact = await options.artifactStore.readArtifact<{ review?: { issues?: Array<{ code?: string; suggestion?: string }> } }>(ref);
  const errors = artifact.output.review?.issues?.map((issue) => `${issue.code ?? "VISUAL_QUALITY"}: ${issue.suggestion ?? "Visual review failed."}`)
    ?? state.validationErrors;
  return failPipelineNode({
    options,
    node: "quality_failure",
    inputRefs: [ref],
    output: { reviewArtifact: ref, issues: errors },
    errors: errors.length > 0 ? errors : ["Visual quality review failed without actionable issue details."],
  });
}

