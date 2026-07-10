import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import type { FinalOutput } from "./schema.js";

export async function finalOutputNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "schema_validation");
  const output: FinalOutput = { document };
  const update = await writePipelineArtifact({
    state,
    options,
    node: "final_output",
    stage: "final_output",
    runStatus: "completed",
    inputRefs,
    output,
  });
  const artifact = update.latestArtifactRefs?.final_output as ArtifactRef | undefined;

  return {
    ...update,
    events: artifact
      ? [
          ...(update.events ?? state.events),
          { type: "agent.done", payload: { document, artifact } },
        ]
      : update.events,
  };
}
