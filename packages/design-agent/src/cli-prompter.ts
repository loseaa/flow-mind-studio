/// <reference path="./inquirer.d.ts" />
import inquirer from "inquirer";

import type { ClarificationPlan, ClarificationQuestion } from "./state.js";

type PromptResult = { answer: string | string[] };
type PromptFunction = <T extends Record<string, unknown>>(questions: unknown[]) => Promise<T>;

type QuestionBoxOptions = {
  maxWidth?: number;
};

export type PromptForClarificationOptions = {
  write?: (line: string) => void;
  prompt?: PromptFunction;
  boxMaxWidth?: number;
};

export async function promptForClarification(
  plan: ClarificationPlan,
  options: PromptForClarificationOptions = {},
): Promise<string> {
  const answers: string[] = [];
  const write = options.write ?? ((line: string) => console.log(line));
  const prompt = options.prompt ?? inquirer.prompt.bind(inquirer);

  for (let index = 0; index < plan.questions.length; index += 1) {
    const question = plan.questions[index]!;
    write(formatQuestionBox(question, index + 1, plan.questions.length, { maxWidth: options.boxMaxWidth }));
    const answer = await promptQuestion(question, prompt);
    answers.push(`${question.question}: ${answer}`);
  }

  return answers.join("\n");
}

export function formatQuestionBox(
  question: ClarificationQuestion,
  index: number,
  total: number,
  options: QuestionBoxOptions = {},
): string {
  const maxWidth = Math.max(24, options.maxWidth ?? Math.min(process.stdout.columns || 80, 88));
  const maxContentWidth = maxWidth - 4;
  const rawLines = [
    `Question ${index}/${total}`,
    question.question,
    `Answer shape: ${question.expectedAnswerShape}`,
    ...(question.options?.length ? ["Options:", ...question.options.map((option, optionIndex) => `${optionIndex + 1}. ${option}`)] : []),
  ];
  const lines = rawLines.flatMap((line) => wrapDisplayLine(line, maxContentWidth));
  const width = Math.min(maxContentWidth, Math.max(...lines.map((line) => displayWidth(line)), 12));
  const border = `+${"-".repeat(width + 2)}+`;
  const body = lines.map((line) => `| ${padEndDisplay(line, width)} |`);
  return [border, ...body, border].join("\n");
}

export function displayWidth(value: string): number {
  return Array.from(value).reduce((width, char) => width + charDisplayWidth(char), 0);
}

function wrapDisplayLine(line: string, maxWidth: number): string[] {
  if (displayWidth(line) <= maxWidth) return [line];
  const wrapped: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const char of Array.from(line)) {
    const charWidth = charDisplayWidth(char);
    if (current && currentWidth + charWidth > maxWidth) {
      wrapped.push(current.trimEnd());
      current = "";
      currentWidth = 0;
    }
    current += char;
    currentWidth += charWidth;
  }

  if (current) wrapped.push(current.trimEnd());
  return wrapped;
}

function padEndDisplay(value: string, width: number) {
  return value + " ".repeat(Math.max(0, width - displayWidth(value)));
}

function charDisplayWidth(char: string) {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint === 0) return 0;
  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (isWideCodePoint(codePoint)) return 2;
  return 1;
}

function isWideCodePoint(codePoint: number) {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

async function promptQuestion(question: ClarificationQuestion, prompt: PromptFunction): Promise<string> {
  const name = "answer";
  if (question.expectedAnswerShape === "single_choice" && question.options?.length) {
    const result = await prompt<PromptResult>([
      { type: "list", name, message: "Select one", choices: question.options },
    ]);
    return normalizeAnswer(result.answer);
  }

  if (question.expectedAnswerShape === "multi_choice" && question.options?.length) {
    const result = await prompt<PromptResult>([
      { type: "checkbox", name, message: "Select one or more", choices: question.options },
    ]);
    return normalizeAnswer(result.answer);
  }

  const result = await prompt<PromptResult>([
    { type: "input", name, message: "Your answer" },
  ]);
  return normalizeAnswer(result.answer);
}

function normalizeAnswer(answer: string | string[]) {
  return Array.isArray(answer) ? answer.join(", ") : answer;
}