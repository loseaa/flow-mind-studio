import { describe, expect, it } from "vitest";

import { createInitialState } from "../../state.js";
import { parseQuestionGenerationOutput, questionGenerationNode } from "./node.js";
import { questionGenerationOutputSchema } from "./schema.js";

describe("questionGenerationNode", () => {
  it("binds the output schema to the model with structured output", async () => {
    const expectedPlan = {
      reason: "missing context",
      questions: [
        {
          id: "q_page_context",
          dimensionKey: "page_context",
          question: "这个页面服务于哪个业务场景？",
          options: [],
          expectedAnswerShape: "free_text",
        },
      ],
    };
    const calls: unknown[] = [];
    const inputs: unknown[] = [];
    const createStructuredOutput = (schema: unknown) => {
      calls.push(schema);
      return {
        async invoke(input: unknown) {
          inputs.push(input);
          return expectedPlan;
        },
      };
    };
    const state = createInitialState("thread-test");

    const result = await questionGenerationNode(state, { createStructuredOutput });

    expect(calls).toEqual([questionGenerationOutputSchema]);
    expect(typeof inputs[0]).toBe("string");
    expect(inputs[0]).toContain("question_generation node");
    expect(inputs[0]).toContain("completenessResult");
    expect(result.clarificationPlan).toEqual(expectedPlan);
    expect(result.pendingQuestionIds).toEqual(["q_page_context"]);
  });

  it("repairs model output by keeping at most three questions", () => {
    const output = parseQuestionGenerationOutput({
      reason: "too many",
      questions: ["page_context", "content_structure", "data_requirements", "interaction_flow"].map((dimensionKey) => ({
        id: `q_${dimensionKey}`,
        dimensionKey,
        question: `${dimensionKey}?`,
        options: [],
        expectedAnswerShape: "free_text",
      })),
    });

    expect(output.questions).toHaveLength(3);
    expect(output.questions.map((question) => question.dimensionKey)).toEqual([
      "page_context",
      "content_structure",
      "data_requirements",
    ]);
  });
  it("does not repeat a previously asked question for the same dimension", async () => {
    const repeatedQuestion = "What is the business goal?";
    const state = createInitialState("thread-test-repeat");
    state.dimensions = state.dimensions.map((dimension) =>
      dimension.key === "page_context"
        ? {
            ...dimension,
            status: "partial",
            completeness: 0.4,
            confidence: 0.7,
            missingFields: ["business goal"],
            questionsAsked: [repeatedQuestion],
          }
        : {
            ...dimension,
            status: "complete",
            completeness: 1,
            confidence: 0.9,
          },
    );
    const createStructuredOutput = () => ({
      invoke() {
        return {
          reason: "missing goal",
          questions: [
            {
              id: "q_page_context",
              dimensionKey: "page_context",
              question: repeatedQuestion,
              options: [],
              expectedAnswerShape: "free_text",
            },
          ],
        };
      },
    });

    const result = await questionGenerationNode(state, { createStructuredOutput });

    expect(result.clarificationPlan?.questions).toHaveLength(1);
    expect(result.clarificationPlan?.questions[0].question).not.toBe(repeatedQuestion);
    expect(result.clarificationPlan?.questions[0].question).toContain("business goal");
    expect(result.pendingQuestionIds).toEqual([result.clarificationPlan?.questions[0].id]);
  });

  it("stops asking a dimension after the repeat limit and records an assumption", async () => {
    const state = createInitialState("thread-test-question-limit");
    state.dimensions = state.dimensions.map((dimension) =>
      dimension.key === "page_context"
        ? {
            ...dimension,
            status: "partial",
            completeness: 0.6,
            confidence: 0.7,
            missingFields: ["business goal"],
            questionsAsked: ["Question 1", "Question 2"],
          }
        : {
            ...dimension,
            status: "complete",
            completeness: 1,
            confidence: 0.9,
          },
    );
    const createStructuredOutput = () => ({
      invoke() {
        throw new Error("model should not be called when every incomplete dimension reached the question limit");
      },
    });

    const result = await questionGenerationNode(state, { createStructuredOutput });
    const pageContext = result.dimensions?.find((dimension) => dimension.key === "page_context");

    expect(result.clarificationPlan?.questions).toEqual([]);
    expect(result.pendingQuestionIds).toEqual([]);
    expect(pageContext).toMatchObject({
      status: "complete",
      completeness: 0.8,
    });
    expect(pageContext?.assumptions.some((assumption) => assumption.includes("question limit"))).toBe(true);
  });
});