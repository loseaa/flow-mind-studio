import type { DesignAgentState } from "../../state.js";
import type { GraphNodeOptions } from "../types.js";

export async function clarificationNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const clarificationPlan = state.clarificationPlan ?? { reason: "需要补充设计意图。", questions: [] };
  const inputRefs = state.latestArtifactRefs.question_generation ? [state.latestArtifactRefs.question_generation] : [];
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "clarification",
        status: "needs_input",
        inputRefs,
        output: {
          plan: clarificationPlan,
          pendingQuestionIds: state.pendingQuestionIds
        },
        errors: []
      })
    : undefined;

  return {
    currentNode: "clarification",
    stage: "clarification",
    clarificationPlan,
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, clarification: artifactRef }
      : state.latestArtifactRefs,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "clarification", stage: "clarification" } }
    ]
  };
}
