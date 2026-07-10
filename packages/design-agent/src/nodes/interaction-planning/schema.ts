import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

const interactionValueSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(10),
]);

export const interactionPlanSchema = z.object({
  interactions: z.array(z.object({
    id: z.string().min(1),
    sourceElementId: z.string().min(1),
    event: z.enum(["click", "change", "submit", "select", "toggle"]),
    action: z.enum(["navigate", "filter", "toggle", "open", "update", "submit", "refresh", "zoom", "select"]),
    targetElementId: z.string().min(1).optional(),
    description: z.string().min(1).max(500),
    payload: z.array(z.object({
      key: z.string().min(1).max(100),
      value: interactionValueSchema,
    }).strict()).max(10),
  }).strict()).max(50),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((plan, context) => {
  const ids = new Set<string>();
  for (const [index, interaction] of plan.interactions.entries()) {
    if (ids.has(interaction.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate interaction id: ${interaction.id}`,
        path: ["interactions", index, "id"],
      });
    }
    ids.add(interaction.id);
  }
});

export type InteractionPlan = z.infer<typeof interactionPlanSchema>;

export const interactionPlanningModelOutputSchema = z.object({
  interactionPlan: interactionPlanSchema,
}).strict();

export type InteractionPlanningOutput = {
  document: DesignDocument;
  interactionPlan: InteractionPlan;
};
