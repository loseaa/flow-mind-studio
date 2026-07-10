import type { DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { reflectionRepairPrompt } from "./prompt.js";
import {
  reflectionRepairModelOutputSchema,
  type ReflectionRepairOutput,
  type ReflectionRepairPlan,
} from "./schema.js";

type SchemaValidationArtifactOutput = {
  document?: unknown;
  valid?: boolean;
  errors?: string[];
};

export async function reflectionRepairNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const sourceArtifact = state.latestArtifactRefs.schema_validation;
  const validationOutput = sourceArtifact && options.artifactStore
    ? (await options.artifactStore.readArtifact<SchemaValidationArtifactOutput>(sourceArtifact)).output
    : undefined;
  const errors = validationOutput?.errors?.length ? validationOutput.errors : state.validationErrors;
  const modelOutput = options.createStructuredOutput
    ? reflectionRepairModelOutputSchema.parse(
        await options.createStructuredOutput(reflectionRepairModelOutputSchema).invoke(
          buildReflectionRepairInput(state, validationOutput),
        ),
      )
    : reflectionRepairModelOutputSchema.parse({ repairPlan: planRepairWithRules(errors) });
  const output: ReflectionRepairOutput = {
    reason: "schema_validation_failed",
    errors,
    sourceArtifact,
    repairPlan: modelOutput.repairPlan,
    nextAction: "repair_plan_ready",
  };

  return writePipelineArtifact({
    state,
    options,
    node: "reflection_repair",
    stage: "reflection_repair",
    status: "failed",
    inputRefs: sourceArtifact ? [sourceArtifact] : [],
    output,
    errors,
  });
}

export function buildReflectionRepairInput(state: DesignAgentState, validationOutput: SchemaValidationArtifactOutput | undefined): string {
  return [
    reflectionRepairPrompt,
    "",
    "Validation errors:",
    JSON.stringify(validationOutput?.errors ?? state.validationErrors, null, 2),
    "",
    "Invalid or partial document:",
    JSON.stringify(validationOutput?.document ?? null, null, 2),
    "",
    "Latest artifact refs:",
    JSON.stringify(state.latestArtifactRefs, null, 2),
  ].join("\n");
}

function planRepairWithRules(errors: string[]): ReflectionRepairPlan {
  return {
    summary: errors.length ? "Repair schema validation failures before final output." : "Repair failed schema validation.",
    operations: errors.map((error) => ({
      target: error.split(":")[0] || "document",
      action: "repair_schema_violation",
      reason: error,
    })),
    requiresRegeneration: true,
  };
}
