import { designDocumentSchema } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import type { SchemaValidationOutput } from "./schema.js";

type DocumentValidationInput = {
  document?: unknown;
};

export async function schemaValidationNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readAssembledDocumentForValidation(state, options);
  const result = designDocumentSchema.safeParse(document);
  const errors = result.success ? [] : result.error.issues.map((issue) => formatValidationIssue(issue.path, issue.message));
  const output: SchemaValidationOutput = {
    document: result.success ? result.data : document,
    valid: result.success,
    errors,
  };

  const update = await writePipelineArtifact({
    state,
    options,
    node: "schema_validation",
    stage: result.success ? "schema_validation" : "failed",
    status: result.success ? "success" : "failed",
    inputRefs,
    output,
    errors,
  });

  return {
    ...update,
    validationErrors: errors,
  };
}

async function readAssembledDocumentForValidation(state: DesignAgentState, options: GraphNodeOptions) {
  const ref = state.latestArtifactRefs.document_repair ?? state.latestArtifactRefs.image_generation ?? state.latestArtifactRefs.document_assembly;
  if (!options.artifactStore || !ref) {
    throw new Error("Missing required artifact for document_repair, image_generation, or document_assembly.");
  }
  const artifact = await options.artifactStore.readArtifact<DocumentValidationInput>(ref);
  return { document: artifact.output.document, inputRefs: [ref as ArtifactRef] };
}

function formatValidationIssue(path: Array<string | number>, message: string) {
  const location = path.length ? path.join(".") : "document";
  return `${location}: ${message}`;
}
