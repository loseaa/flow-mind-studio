import type { DesignAgentState } from "../state.js";

export const MAX_REPAIR_ATTEMPTS = 2;

export function routeAfterCompleteness(state: DesignAgentState) {
  return state.completenessResult?.allComplete ? "intent_compaction" : "question_generation";
}

export function routeAfterQuestionGeneration(state: DesignAgentState) {
  return state.pendingQuestionIds.length > 0 ? "clarification" : "intent_compaction";
}

export function routeAfterSchemaValidation(state: DesignAgentState) {
  return state.validationErrors.length > 0 || state.stage === "failed" ? "reflection_repair" : "final_output";
}

export function routeAfterReflectionRepair(state: DesignAgentState) {
  return state.repairAttempts >= MAX_REPAIR_ATTEMPTS ? "failed" : "document_repair";
}
