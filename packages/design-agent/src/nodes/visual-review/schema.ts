import { z } from "zod";
import { designImageSlotSchema, type DesignDocument } from "@flowmind/shared";
import type { ArtifactRef } from "../../state.js";

export const visualReviewIssueSchema = z.object({
  code: z.string().min(1),
  elementId: z.string().min(1).optional(),
  severity: z.enum(["low", "medium", "high"]),
  suggestion: z.string().min(1),
}).strict();

export const visualRepairActionSchema = z.object({
  kind: z.enum([
    "set_slot_max_height",
    "set_slot_aspect_ratio",
    "set_slot_object_fit",
    "set_slot_focal_point",
    "set_container_overflow",
    "restore_image_slot_metadata",
    "set_background_slot_metadata",
    "set_slot_stable_layout",
    "add_missing_primary_action_note",
  ]),
  elementId: z.string().min(1),
  slotId: z.string().min(1).optional(),
  value: z.union([z.string(), z.number(), z.boolean(), designImageSlotSchema]),
  reason: z.string().min(1),
}).strict();

export const visualReviewSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(visualReviewIssueSchema).max(30),
  repairActions: z.array(visualRepairActionSchema).max(20),
}).strict();

export const visualReviewModelOutputSchema = z.object({
  issues: z.array(visualReviewIssueSchema).max(12),
  notes: z.array(z.string().min(1).max(500)).max(8),
}).strict();

export type VisualReviewIssue = z.infer<typeof visualReviewIssueSchema>;
export type VisualRepairAction = z.infer<typeof visualRepairActionSchema>;
export type VisualReview = z.infer<typeof visualReviewSchema>;
export type VisualReviewOutput = {
  document: DesignDocument;
  review: VisualReview;
  sourceArtifact?: ArtifactRef;
  modelNotes: string[];
};
