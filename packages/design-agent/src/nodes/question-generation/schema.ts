import { z } from "zod";

import { intentDimensionKeys } from "../../state.js";

const expectedAnswerShapeSchema = z.enum(["single_choice", "multi_choice", "free_text"]);

export const questionGenerationOutputSchema = z.object({
  reason: z.string().min(1),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        dimensionKey: z.enum(intentDimensionKeys),
        question: z.string().min(1),
        options: z.array(z.string().min(1)),
        expectedAnswerShape: expectedAnswerShapeSchema,
      }),
    )
    .max(3),
});

export type QuestionGenerationOutput = z.infer<typeof questionGenerationOutputSchema>;

export const questionGenerationOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reason", "questions"],
  properties: {
    reason: {
      type: "string",
      minLength: 1,
    },
    questions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "dimensionKey", "question", "options", "expectedAnswerShape"],
        properties: {
          id: {
            type: "string",
            minLength: 1,
          },
          dimensionKey: {
            type: "string",
            enum: [...intentDimensionKeys],
          },
          question: {
            type: "string",
            minLength: 1,
          },
          options: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
          expectedAnswerShape: {
            type: "string",
            enum: expectedAnswerShapeSchema.options,
          },
        },
      },
    },
  },
} as const;