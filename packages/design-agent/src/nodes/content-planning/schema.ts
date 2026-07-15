import { z } from "zod";

export const contentSectionRoleSchema = z.enum([
  "hero",
  "proof",
  "features",
  "story",
  "specifications",
  "social_proof",
  "cta",
  "content",
  "actions",
  "filters",
  "metrics",
  "table",
  "form",
]);

export const contentPlanSchema = z.object({
  archetype: z.enum(["product_marketing", "operational", "general"]),
  subject: z.string().min(1).max(200),
  narrative: z.string().min(1).max(1000),
  sections: z.array(z.object({
    id: z.string().min(1),
    role: contentSectionRoleSchema,
    purpose: z.string().min(1).max(500),
    requiredBlocks: z.array(z.enum([
      "eyebrow",
      "headline",
      "section_heading",
      "body",
      "primary_action",
      "secondary_action",
      "metric",
      "feature_card",
      "specification",
      "testimonial",
      "image",
      "filter",
      "table",
      "form",
    ])).min(1).max(12),
  }).strict()).min(3).max(10),
  qualityTargets: z.object({
    minimumSections: z.number().int().min(3).max(10),
    minimumTreeDepth: z.number().int().min(2).max(6),
    minimumTextElements: z.number().int().nonnegative().max(60),
    minimumActions: z.number().int().nonnegative().max(10),
    minimumStats: z.number().int().nonnegative().max(20),
    maximumImages: z.number().int().nonnegative().max(10),
  }).strict(),
}).strict();

export type ContentPlan = z.infer<typeof contentPlanSchema>;
