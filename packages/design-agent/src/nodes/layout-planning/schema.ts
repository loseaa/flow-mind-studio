import { designImageSlotSchema, type DesignDocument } from "@flowmind/shared";
import { z } from "zod";

const layoutStrategySchema = z.enum([
  "hero_split",
  "editorial_sections",
  "product_showcase",
  "dashboard_grid",
]);

export const layoutPlanSchema = z.object({
  strategy: layoutStrategySchema,
  rootId: z.string().min(1),
  sectionIds: z.array(z.string().min(1)).max(40),
  rhythm: z.enum(["compact", "standard", "immersive"]),
  hierarchy: z.object({
    titleElementId: z.string().min(1),
    primaryVisualSlotId: z.string().min(1),
    primaryActionElementId: z.string().min(1),
  }).partial().strict(),
  imageSlots: z.array(designImageSlotSchema).max(10),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict();

export const layoutPlanningModelOutputSchema = z.object({
  layoutPlan: layoutPlanSchema,
}).strict();

export type LayoutPlanningModelOutput = z.infer<typeof layoutPlanningModelOutputSchema>;
export type LayoutPlan = z.infer<typeof layoutPlanSchema>;

export type LayoutPlanningOutput = {
  document: DesignDocument;
  layoutPlan: LayoutPlan;
};
