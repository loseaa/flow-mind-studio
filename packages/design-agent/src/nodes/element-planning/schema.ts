import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";
const semanticAttributeValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(10),
]);

export const semanticElementSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1),
  order: z.number().int().nonnegative(),
  type: z.enum([
    "text",
    "image",
    "button",
    "input",
    "filter",
    "form",
    "badge",
    "divider",
    "stat",
    "table",
  ]),
  name: z.string().min(1),
  purpose: z.string().min(1).max(500),
  content: z.string().max(2000).optional(),
  attributes: z.array(z.object({
    key: z.string().min(1).max(100),
    value: semanticAttributeValueSchema,
  }).strict()).max(12),
}).strict();

export const semanticElementPlanSchema = z.object({
  elements: z.array(semanticElementSchema).max(80),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((plan, context) => {
  const seen = new Set<string>();
  for (const [index, element] of plan.elements.entries()) {
    if (seen.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate element id: ${element.id}`,
        path: ["elements", index, "id"],
      });
    }
    seen.add(element.id);
  }
});

export type SemanticElementPlan = z.infer<typeof semanticElementPlanSchema>;

export const elementPlanningModelOutputSchema = z.object({
  elementPlan: semanticElementPlanSchema,
}).strict();

export type ElementPlanningModelOutput = z.infer<typeof elementPlanningModelOutputSchema>;
export type ElementPlan = SemanticElementPlan;

export type ElementPlanningOutput = {
  document: DesignDocument;
  elementPlan: ElementPlan;
};
