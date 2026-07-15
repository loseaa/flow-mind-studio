import { z } from "zod";

import { intentDimensionKeys } from "../../state.js";

const intentDimensionStatusSchema = z.enum(["complete", "partial", "missing", "conflicting"]);

const intentRecognitionObjectSchema = z.object({
  updates: z.array(
    z.object({
      key: z.enum(intentDimensionKeys),
      status: intentDimensionStatusSchema,
      completeness: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
      value: z.any().nullable(),
      evidence: z.array(z.string()),
      missingFields: z.array(z.string()),
      assumptions: z.array(z.string()),
    }),
  ),
});

export const intentRecognitionOutputSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return { updates: normalizeUpdates(value) };
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (!record.updates && Array.isArray(record.intent_dimensions)) {
    return { ...record, updates: normalizeUpdates(record.intent_dimensions) };
  }
  if (!record.updates && Array.isArray(record.dimensions)) {
    return { ...record, updates: normalizeUpdates(record.dimensions) };
  }
  if (!record.updates) {
    const dimensionUpdates = intentDimensionKeys
      .map((key) => {
        const update = record[key];
        return update && typeof update === "object" && !Array.isArray(update)
          ? { key, ...(update as Record<string, unknown>) }
          : undefined;
      })
      .filter(Boolean);
    if (dimensionUpdates.length > 0) return { ...record, updates: normalizeUpdates(dimensionUpdates) };
  }
  if (Array.isArray(record.updates)) return { ...record, updates: normalizeUpdates(record.updates) };
  return value;
}, intentRecognitionObjectSchema);

export type IntentRecognitionOutput = z.infer<typeof intentRecognitionOutputSchema>;

function normalizeUpdates(updates: unknown[]) {
  return updates.map((update) => {
    if (!update || typeof update !== "object" || Array.isArray(update)) return update;
    const record = update as Record<string, unknown>;
    return {
      ...record,
      evidence: Array.isArray(record.evidence)
        ? record.evidence.map((item) => typeof item === "string" ? item : JSON.stringify(item))
        : [],
      missingFields: Array.isArray(record.missingFields) ? record.missingFields.map(String) : [],
      assumptions: Array.isArray(record.assumptions) ? record.assumptions.map(String) : [],
    };
  });
}
