import { describe, expect, it } from "vitest";

import { displayWidth, formatQuestionBox, promptForClarification } from "./cli-prompter.js";

describe("cli prompter", () => {
  it("formats each clarification question in a visible box", () => {
    const box = formatQuestionBox(
      {
        id: "q1",
        dimensionKey: "page_context",
        question: "Who is this ecommerce page for?",
        options: ["consumer", "merchant"],
        expectedAnswerShape: "single_choice",
      },
      1,
      2,
    );

    expect(box).toContain("+--");
    expect(box).toContain("Question 1/2");
    expect(box).toContain("Who is this ecommerce page for?");
    expect(box).toContain("1. consumer");
  });


  it("wraps long Chinese clarification questions inside the box", () => {
    const box = formatQuestionBox(
      {
        id: "q_long",
        dimensionKey: "page_context",
        question: "这个设计图面向什么业务目标页面类型和使用角色需要描述清楚不要把边框顶出去",
        options: ["面向消费者的电商首页", "面向商家的商品管理后台"],
        expectedAnswerShape: "single_choice",
      },
      1,
      1,
      { maxWidth: 36 },
    );

    const lines = box.split("\n");
    expect(lines.length).toBeGreaterThan(6);
    expect(box).not.toContain("这个设计图面向什么业务目标页面类型和使用角色需要描述清楚不要把边框顶出去");
    for (const line of lines) {
      expect(displayWidth(line)).toBeLessThanOrEqual(36);
    }
  });
  it("asks questions one by one and combines answers", async () => {
    const output: string[] = [];
    const prompts: unknown[][] = [];
    const answer = await promptForClarification(
      {
        reason: "Need more info",
        questions: [
          {
            id: "q1",
            dimensionKey: "page_context",
            question: "Who is this ecommerce page for?",
            options: ["consumer", "merchant"],
            expectedAnswerShape: "single_choice",
          },
          {
            id: "q2",
            dimensionKey: "content_structure",
            question: "What sections are needed?",
            options: [],
            expectedAnswerShape: "free_text",
          },
        ],
      },
      {
        write: (line) => output.push(line),
        prompt: async <T extends Record<string, unknown>>(questions: unknown[]): Promise<T> => {
          prompts.push(questions);
          return { answer: prompts.length === 1 ? "consumer" : "hero and product grid" } as unknown as T;
        },
      },
    );

    expect(prompts).toHaveLength(2);
    expect(output.join("\n")).toContain("Question 1/2");
    expect(output.join("\n")).toContain("Question 2/2");
    expect(answer).toContain("Who is this ecommerce page for?: consumer");
    expect(answer).toContain("What sections are needed?: hero and product grid");
  });
});
