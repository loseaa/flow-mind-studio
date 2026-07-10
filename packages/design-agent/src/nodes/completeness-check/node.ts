import type { DesignAgentState } from "../../state.js";
import { evaluateCompleteness } from "../../intent/dimensions.js";
import type { GraphNodeOptions } from "../types.js";

export async function completenessCheckNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const completenessResult = evaluateCompleteness(state.dimensions);
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "completeness_check",
        status: "success",
        inputRefs: [],
        output: completenessResult,
        errors: []
      })
    : undefined;

  return {
    currentNode: "completeness_check",
    stage: "completeness_check",
    completenessResult,
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, completeness_check: artifactRef }
      : state.latestArtifactRefs,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "completeness_check", stage: "completeness_check" } }
    ]
  };
}
