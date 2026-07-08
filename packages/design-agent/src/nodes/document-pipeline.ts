import { designDocumentSchema, type DesignDocument } from "@flowmind/shared";

import type { ArtifactRef } from "../state.js";
import type { RunStatus } from "../artifacts/store.js";
import type { DesignAgentState, AgentStage, NodeArtifactStatus } from "../state.js";
import type { GraphNodeOptions } from "./types.js";

export type DocumentPipelineArtifactOutput = {
  document?: DesignDocument;
};

export async function readDocumentFromLatestArtifact(
  state: DesignAgentState,
  options: GraphNodeOptions,
  artifactKey: string
): Promise<{ document: DesignDocument; inputRefs: ArtifactRef[] }> {
  const ref = state.latestArtifactRefs[artifactKey];
  if (!options.artifactStore || !ref) {
    throw new Error(`Missing required artifact for ${artifactKey}.`);
  }

  const artifact = await options.artifactStore.readArtifact<DocumentPipelineArtifactOutput>(ref);
  const document = designDocumentSchema.parse(artifact.output.document);
  return { document, inputRefs: [ref] };
}

export async function writePipelineArtifact<TOutput>(params: {
  state: DesignAgentState;
  options: GraphNodeOptions;
  node: string;
  stage: AgentStage;
  status?: NodeArtifactStatus;
  runStatus?: RunStatus;
  inputRefs: ArtifactRef[];
  output: TOutput;
  errors?: string[];
}): Promise<Partial<DesignAgentState>> {
  const artifactRef = params.options.artifactStore
    ? await params.options.artifactStore.writeArtifact({
        node: params.node,
        status: params.status ?? "success",
        runStatus: params.runStatus,
        inputRefs: params.inputRefs,
        output: params.output,
        errors: params.errors ?? [],
      })
    : undefined;

  return {
    currentNode: params.node,
    stage: params.stage,
    latestArtifactRefs: artifactRef
      ? { ...params.state.latestArtifactRefs, [params.node]: artifactRef }
      : params.state.latestArtifactRefs,
    validationErrors: params.errors?.length ? params.errors : params.state.validationErrors,
    events: [
      ...params.state.events,
      { type: "agent.node", payload: { node: params.node, stage: params.stage } },
    ],
  };
}
export async function failPipelineNode<TOutput>(params: {
  options: GraphNodeOptions;
  node: string;
  inputRefs: ArtifactRef[];
  output: TOutput;
  errors: string[];
}): Promise<never> {
  const artifactRef = params.options.artifactStore
    ? await params.options.artifactStore.writeArtifact({
        node: params.node,
        status: "failed",
        runStatus: "failed",
        inputRefs: params.inputRefs,
        output: params.output,
        errors: params.errors,
      })
    : undefined;
  const artifactDetail = artifactRef ? ` Artifact: ${artifactRef.path}` : "";
  throw new Error(`${params.node} failed after retry: ${params.errors.join(" | ")}.${artifactDetail}`);
}