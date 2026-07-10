import { describe, expect, it } from "vitest";
import { buildQuestionGenerationPrompt } from "./prompt.js";

describe("buildQuestionGenerationPrompt", () => {
  it("keeps schema binding outside of the prompt text", () => {
    const prompt = buildQuestionGenerationPrompt();

    expect(prompt).toContain("question_generation node");
    expect(prompt).toContain("Simplified Chinese");
    expect(prompt).toContain("at most 3 questions");
    expect(prompt).not.toContain("Return only JSON");
    expect(prompt).not.toContain('"dimensionKey"');
    expect(prompt).not.toContain('"maxItems"');
  });
});