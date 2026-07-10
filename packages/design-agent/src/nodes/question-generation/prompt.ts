export function buildQuestionGenerationPrompt(): string {
  return [
    "You are the question_generation node.",
    "Generate concise clarification questions only for incomplete or conflicting dimensions.",
    "Use Simplified Chinese for all user-facing questions.",
    "Ask at most 3 questions in one turn.",
    "Prefer one clear question that can complete the most important missing design intent dimension.",
    "Avoid asking about dimensions that are already complete.",
    "Treat questionsAsked as a deny-list: never repeat or closely paraphrase previous questions.",
    "If a dimension remains incomplete after prior answers, ask a narrower question based on missingFields.",
    "Prefer answer options when they reduce ambiguity.",
  ].join("\n");
}

export const questionGenerationPrompt = buildQuestionGenerationPrompt();