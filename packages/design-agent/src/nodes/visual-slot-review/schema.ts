import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

import { layoutPlanSchema, type LayoutPlan } from "../layout-planning/schema.js";

export const visualSlotReviewIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  slotId: z.string().min(1).optional(),
}).strict();

export const visualSlotReviewDataSchema = z.object({
  layoutPlan: layoutPlanSchema,
  issues: z.array(visualSlotReviewIssueSchema),
}).strict();

export type VisualSlotReviewIssue = z.infer<typeof visualSlotReviewIssueSchema>;
export type VisualSlotReviewOutput = {
  document: DesignDocument;
  layoutPlan: LayoutPlan;
  issues: VisualSlotReviewIssue[];
};