import { z } from "zod";

import { intentDimensionKeys } from "../../state.js";

const intentDimensionStatusSchema = z.enum(["complete", "partial", "missing", "conflicting"]);

export const intentRecognitionOutputSchema = z.object({
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

export type IntentRecognitionOutput = z.infer<typeof intentRecognitionOutputSchema>;