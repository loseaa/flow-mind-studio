import type { DesignAgentState } from "../../state.js";
import type { GraphNodeOptions } from "../types.js";
import type { IntentCompactionOutput } from "./schema.js";

export async function intentCompactionNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const output: IntentCompactionOutput = {
    summary: buildSummary(state),
    dimensions: state.dimensions.map((dimension) => ({
      key: dimension.key,
      value: dimension.value,
      evidence: dimension.evidence,
      assumptions: dimension.assumptions,
    })),
  };
  const inputRefs = state.latestArtifactRefs.completeness_check ? [state.latestArtifactRefs.completeness_check] : [];
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "intent_compaction",
        status: "success",
        inputRefs,
        output,
        errors: [],
      })
    : undefined;

  return {
    currentNode: "intent_compaction",
    stage: "intent_compaction",
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, intent_compaction: artifactRef }
      : state.latestArtifactRefs,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "intent_compaction", stage: "intent_compaction" } },
    ],
  };
}

function buildSummary(state: DesignAgentState) {
  const completedKeys = state.dimensions
    .filter((dimension) => dimension.status === "complete")
    .map((dimension) => dimension.key)
    .join(", ");
  return completedKeys ? `已确认设计意图维度：${completedKeys}` : "已确认设计意图。";
}