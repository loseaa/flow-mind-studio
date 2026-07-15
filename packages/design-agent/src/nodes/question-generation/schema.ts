import { z } from "zod";

import { intentDimensionKeys } from "../../state.js";

const expectedAnswerShapeSchema = z.enum(["single_choice", "multi_choice", "free_text"]);

const questionGenerationObjectSchema = z.object({
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

export const questionGenerationOutputSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.questions) && typeof record.question === "string") {
    return {
      ...record,
      reason: typeof record.reason === "string" && record.reason.trim() ? record.reason : "Need clarification before generating the design.",
      questions: [{
        id: "q_model_1",
        dimensionKey: intentDimensionKeys.includes(record.dimension as (typeof intentDimensionKeys)[number])
          ? record.dimension
          : "page_context",
        question: record.question,
        options: Array.isArray(record.options) ? record.options.map(String) : [],
        expectedAnswerShape: Array.isArray(record.options) && record.options.length > 0 ? "single_choice" : "free_text",
      }],
    };
  }
  if (!Array.isArray(record.questions)) return value;

  const questions = record.questions.slice(0, 3).map((question, index) => {
    if (question && typeof question === "object" && !Array.isArray(question)) {
      const questionRecord = question as Record<string, unknown>;
      const dimension = typeof questionRecord.dimensionKey === "string"
        ? questionRecord.dimensionKey
        : questionRecord.dimension;
      const options = Array.isArray(questionRecord.options) ? questionRecord.options.map(String) : [];
      return {
        ...questionRecord,
        options,
        expectedAnswerShape: typeof questionRecord.expectedAnswerShape === "string"
          ? questionRecord.expectedAnswerShape
          : options.length > 0 ? "single_choice" : "free_text",
        id: typeof questionRecord.id === "string" && questionRecord.id.trim() ? questionRecord.id : `q_model_${index + 1}`,
        dimensionKey: typeof dimension === "string"
          ? dimension
          : intentDimensionKeys[index] ?? "page_context",
        question: typeof questionRecord.question === "string"
          ? questionRecord.question
          : String(questionRecord.text ?? ""),
      };
    }
    return {
      id: `q_model_${index + 1}`,
      dimensionKey: intentDimensionKeys[index] ?? "page_context",
      question: String(question ?? ""),
      options: [],
      expectedAnswerShape: "free_text",
    };
  });

  return {
    ...record,
    reason: typeof record.reason === "string" && record.reason.trim() ? record.reason : "Need clarification before generating the design.",
    questions,
  };
}, questionGenerationObjectSchema);

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
