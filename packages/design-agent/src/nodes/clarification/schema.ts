import type { ClarificationPlan } from "../../state.js";

export type ClarificationOutput = {
  plan: ClarificationPlan;
  pendingQuestionIds: string[];
};
