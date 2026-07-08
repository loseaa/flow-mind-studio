import type { IntentDimension } from "../../state.js";

export type IntentCompactionOutput = {
  summary: string;
  dimensions: Array<Pick<IntentDimension, "key" | "value" | "evidence" | "assumptions">>;
};