import { createArtifactStore, type ArtifactStore, type RunManifest } from "./artifacts/store.js";
import { createDesignAgentGraph, designAgentRecursionLimit } from "./graph.js";
import type { CreateImageGeneration, CreateStructuredOutput } from "./nodes/types.js";
import type { DesignAgentState } from "./state.js";
import { createInitialState } from "./state.js";

export type RunDesignAgentInput = {
  threadId: string;
  runDir: string;
  message: string;
  artifactStore?: ArtifactStore;
  createStructuredOutput?: CreateStructuredOutput;
  createImageGeneration?: CreateImageGeneration;
  createdAt?: string;
};

export type RunDesignAgentResult = {
  runDir: string;
  state: DesignAgentState;
  manifest: RunManifest;
};

export async function runDesignAgent(input: RunDesignAgentInput): Promise<RunDesignAgentResult> {
  const store = input.artifactStore ?? createArtifactStore({ runDir: input.runDir, threadId: input.threadId });
  const graph = createDesignAgentGraph({
    artifactStore: store,
    createStructuredOutput: input.createStructuredOutput,
    createImageGeneration: input.createImageGeneration,
  });
  const state = await graph.invoke({
    ...createInitialState(input.threadId),
    messages: [
      {
        role: "user",
        content: input.message,
        createdAt: input.createdAt ?? new Date().toISOString(),
      },
    ],
  }, { recursionLimit: designAgentRecursionLimit() });

  return {
    runDir: store.runDir,
    state,
    manifest: await store.readManifest(),
  };
}
