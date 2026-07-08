import { z } from "zod";
import type { ArtifactRef } from "../../state.js";

export const reflectionRepairModelOutputSchema = z.object({
  repairPlan: z.object({
    summary: z.string().min(1),
    operations: z.array(
      z.object({
        target: z.string().min(1),
        action: z.string().min(1),
        reason: z.string().min(1),
      }),
    ),
    requiresRegeneration: z.boolean(),
  }),
});

export type ReflectionRepairModelOutput = z.infer<typeof reflectionRepairModelOutputSchema>;
export type ReflectionRepairPlan = ReflectionRepairModelOutput["repairPlan"];

export type ReflectionRepairOutput = {
  reason: "schema_validation_failed";
  errors: string[];
  sourceArtifact?: ArtifactRef;
  repairPlan: ReflectionRepairPlan;
  nextAction: "repair_plan_ready";
};
