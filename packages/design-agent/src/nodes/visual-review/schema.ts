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

const visualReviewModelOutputObjectSchema = z.object({
  issues: z.array(visualReviewIssueSchema).max(12),
  notes: z.array(z.string().min(1).max(500)).max(8),
}).strict();

export const visualReviewModelOutputSchema = z.preprocess((value) => {
  const record = normalizeObject(value);
  if (!record) return value;
  return {
    issues: Array.isArray(record.issues) ? record.issues.slice(0, 12).map(normalizeModelIssue) : [],
    notes: Array.isArray(record.notes) ? record.notes.slice(0, 8).map(String) : [],
  };
}, visualReviewModelOutputObjectSchema);

export type VisualReviewIssue = z.infer<typeof visualReviewIssueSchema>;
export type VisualRepairAction = z.infer<typeof visualRepairActionSchema>;
export type VisualReview = z.infer<typeof visualReviewSchema>;
export type VisualReviewOutput = {
  document: DesignDocument;
  review: VisualReview;
  sourceArtifact?: ArtifactRef;
  modelNotes: string[];
};

function normalizeModelIssue(value: unknown, index: number) {
  const issue = normalizeObject(value) ?? {};
  const elementId = normalizeOptionalText(issue.elementId);
  return {
    code: normalizeCode(issue.code, issue.severity, index),
    ...(elementId ? { elementId } : {}),
    severity: normalizeSeverity(issue.severity),
    suggestion: normalizeText(issue.suggestion ?? issue.description ?? issue.message, "Review the generated element for visual consistency."),
  };
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" {
  if (value === "high" || value === "error" || value === "critical") return "high";
  if (value === "medium" || value === "warning" || value === "warn") return "medium";
  return "low";
}

function normalizeCode(value: unknown, severity: unknown, index: number) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  }
  const level = normalizeSeverity(severity).toUpperCase();
  return `MODEL_VISUAL_${level}_${index + 1}`;
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
