import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

export const stylePresetSchema = z.enum([
  "page",
  "section",
  "panel",
  "heading",
  "subheading",
  "body",
  "muted",
  "media",
  "primary_action",
  "secondary_action",
  "control",
  "status",
  "metric",
  "data_table",
]);

export const stylePlanSchema = z.object({
  theme: z.enum(["neutral_workspace", "enterprise_light", "commerce_editorial", "data_dense"]),
  tone: z.enum(["quiet", "expressive", "premium", "operational"]),
  assignments: z.array(z.object({
    elementId: z.string().min(1),
    preset: stylePresetSchema,
  }).strict()).max(80),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((plan, context) => {
  const elementIds = new Set<string>();
  for (const [index, assignment] of plan.assignments.entries()) {
    if (elementIds.has(assignment.elementId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate style assignment: ${assignment.elementId}`,
        path: ["assignments", index, "elementId"],
      });
    }
    elementIds.add(assignment.elementId);
  }
});

export const stylePlanningModelOutputSchema = z.object({
  stylePlan: stylePlanSchema,
}).strict();

export type StylePlanningModelOutput = z.infer<typeof stylePlanningModelOutputSchema>;
export type StylePlan = z.infer<typeof stylePlanSchema>;
export type StylePreset = z.infer<typeof stylePresetSchema>;

export type StylePlanningOutput = {
  document: DesignDocument;
  stylePlan: StylePlan;
};