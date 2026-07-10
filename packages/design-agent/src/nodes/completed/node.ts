import type { DesignAgentState } from "../../state.js";

export function completedNode(state: DesignAgentState): Partial<DesignAgentState> {
  return {
    currentNode: "completed",
    stage: "completed",
    clarificationPlan: undefined,
    pendingQuestionIds: [],
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "completed", stage: "completed" } }
    ]
  };
}
