import { z } from "zod";

import { hasExplicitNoImageIntent, type ImagePolicyContext } from "../image-policy.js";
export { hasExplicitNoImageIntent } from "../image-policy.js";

const minimumGeneratedAssetsInputSchema = z.number().int().min(0).max(10).transform((count): 0 | 3 => count === 0 ? 0 : 3);
const prioritySchema = z.enum(["required", "recommended", "optional"]);
const planHeader = {
  imagePolicy: z.enum(["required", "none"]),
  visualMode: z.enum(["standard", "rich", "none"]),
  minimumGeneratedAssets: minimumGeneratedAssetsInputSchema,
};

export const imageAssetDraftSchema = z.object({
  id: z.string().min(1).max(120),
  slotId: z.string().min(1).max(120),
  purpose: z.string().min(1).max(500),
  promptBrief: z.string().min(1).max(1_500),
  priority: prioritySchema,
}).strict();

export const imagePlanningModelOutputSchema = z.object({
  visualAssetPlan: z.object({
    ...planHeader,
    assets: z.array(imageAssetDraftSchema).max(10),
    notes: z.array(z.string().min(1).max(500)).max(10).default([]),
  }).strict(),
}).strict();

const visualAssetBaseSchema = z.object({
  id: z.string().min(1).max(120),
  slotId: z.string().min(1).max(120).optional(),
  purpose: z.string().min(1).max(500),
  promptBrief: z.string().min(1).max(1_500),
  priority: prioritySchema,
  role: z.enum(["hero", "section", "thumbnail", "illustration"]),
  targetElementId: z.string().min(1).optional(),
  width: z.number().int().positive().max(4_096),
  height: z.number().int().positive().max(4_096),
  aspectRatio: z.enum(["wide", "square", "portrait"]),
});
const contentVisualAssetSchema = visualAssetBaseSchema.extend({
  kind: z.literal("content_image"),
  parentId: z.string().min(1).optional(),
  order: z.number().int().nonnegative().optional(),
}).strict().superRefine((asset, context) => {
  if (!asset.targetElementId && !asset.parentId) context.addIssue({ code: z.ZodIssueCode.custom, message: "Content image requires a targetElementId or legacy parentId.", path: ["targetElementId"] });
});
const backgroundVisualAssetSchema = visualAssetBaseSchema.extend({
  targetElementId: z.string().min(1),
  kind: z.literal("background_image"),
  foregroundTone: z.enum(["light", "dark"]),
}).strict();
export const visualAssetSchema = z.union([contentVisualAssetSchema, backgroundVisualAssetSchema]);

export const visualAssetPlanSchema = z.object({
  ...planHeader,
  assets: z.array(visualAssetSchema).max(10),
  notes: z.array(z.string().min(1).max(500)).max(10).default([]),
}).strict().superRefine((plan, context) => {
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const [index, asset] of plan.assets.entries()) {
    if (ids.has(asset.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate visual asset id: ${asset.id}`, path: ["assets", index, "id"] });
    if (asset.slotId && slots.has(asset.slotId)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate image slot id: ${asset.slotId}`, path: ["assets", index, "slotId"] });
    ids.add(asset.id);
    if (asset.slotId) slots.add(asset.slotId);
  }
  if (plan.imagePolicy === "required") {
    const count = plan.assets.filter((asset) => asset.priority !== "optional").length;
    if (plan.visualMode === "none" || plan.minimumGeneratedAssets !== 3 || count < 3) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Required image policy needs at least three required or recommended assets.", path: ["assets"] });
    }
  } else if (plan.visualMode !== "none" || plan.minimumGeneratedAssets !== 0 || plan.assets.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "No-image policy must use none mode, zero minimum, and no assets.", path: ["imagePolicy"] });
  }
});

export type ImageAssetDraft = z.infer<typeof imageAssetDraftSchema>;
export type ImagePlanningModelOutput = z.infer<typeof imagePlanningModelOutputSchema>;
export type VisualAsset = z.infer<typeof visualAssetSchema>;
export type VisualAssetPlan = z.infer<typeof visualAssetPlanSchema>;

export function validateImagePolicy(plan: VisualAssetPlan, context: ImagePolicyContext): VisualAssetPlan {
  const parsed = visualAssetPlanSchema.parse(plan);
  const noImageRequested = hasExplicitNoImageIntent(context);
  if (!noImageRequested && parsed.imagePolicy === "none") throw new Error("imagePolicy none requires explicit no-image intent from the user.");
  if (noImageRequested && (parsed.imagePolicy !== "none" || parsed.assets.length > 0)) throw new Error("An explicit no-image request must not contain assets.");
  return parsed;
}