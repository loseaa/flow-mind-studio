import { describe, expect, it } from "vitest";
import { questionGenerationOutputSchema } from "./schema.js";

describe("questionGenerationOutputSchema", () => {
  it("accepts a valid clarification plan", () => {
    expect(() =>
      questionGenerationOutputSchema.parse({
        reason: "需要补充页面字段。",
        questions: [
          {
            id: "q_data_requirements",
            dimensionKey: "data_requirements",
            question: "页面里最核心要展示哪些字段？",
            options: [],
            expectedAnswerShape: "free_text"
          }
        ]
      })
    ).not.toThrow();
  });

  it("rejects unknown dimension keys", () => {
    expect(() =>
      questionGenerationOutputSchema.parse({
        reason: "bad",
        questions: [
          {
            id: "q_unknown",
            dimensionKey: "unknown",
            question: "bad",
            options: [],
            expectedAnswerShape: "free_text"
          }
        ]
      })
    ).toThrow();
  });
});