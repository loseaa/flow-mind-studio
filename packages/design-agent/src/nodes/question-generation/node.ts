import type { ClarificationPlan, DesignAgentState, IntentDimension } from "../../state.js";
import { evaluateCompleteness, generateClarificationPlan, recordQuestionsAsked } from "../../intent/dimensions.js";
import type { GraphNodeOptions } from "../types.js";
import { questionGenerationPrompt } from "./prompt.js";
import { questionGenerationOutputSchema, type QuestionGenerationOutput } from "./schema.js";

const MAX_QUESTIONS_PER_DIMENSION = 2;

export async function questionGenerationNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const dimensionsWithLimits = applyQuestionLimitAssumptions(state.dimensions);
  const completenessResult = evaluateCompleteness(dimensionsWithLimits);
  const errors: string[] = [];
  let rawPlan = completenessResult.allComplete
    ? questionGenerationOutputSchema.parse({ reason: "No clarification needed after applying question limits.", questions: [] })
    : questionGenerationOutputSchema.parse(generateClarificationPlan(completenessResult));
  if (!completenessResult.allComplete && options.createStructuredOutput) {
    try {
      rawPlan = parseQuestionGenerationOutput(
        await options.createStructuredOutput(questionGenerationOutputSchema, { node: "question_generation" }).invoke(buildQuestionGenerationInput({ ...state, dimensions: dimensionsWithLimits, completenessResult })),
      );
    } catch (error) {
      errors.push(formatError(error));
    }
  }
  const clarificationPlan = removeRepeatedQuestions(rawPlan, dimensionsWithLimits);
  const dimensions = recordQuestionsAsked(dimensionsWithLimits, clarificationPlan);
  const inputRefs = state.latestArtifactRefs.completeness_check ? [state.latestArtifactRefs.completeness_check] : [];
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "question_generation",
        status: "success",
        inputRefs,
        output: clarificationPlan,
        errors
      })
    : undefined;

  return {
    currentNode: "question_generation",
    stage: "question_generation",
    dimensions,
    completenessResult,
    clarificationPlan,
    pendingQuestionIds: clarificationPlan.questions.map((question) => question.id),
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, question_generation: artifactRef }
      : state.latestArtifactRefs,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "question_generation", stage: "question_generation" } },
      { type: "agent.clarification", payload: clarificationPlan }
    ]
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function buildQuestionGenerationInput(state: DesignAgentState): string {
  const completenessResult = state.completenessResult ?? evaluateCompleteness(state.dimensions);
  return [
    questionGenerationPrompt,
    "",
    "questionsAsked is a deny-list. Do not ask any question that repeats or paraphrases a value already present in questionsAsked.",
    "If a dimension is still incomplete after a prior question, ask a narrower question based on missingFields.",
    "Prefer answer options when they can make the user's reply more precise.",
    "",
    "completenessResult:",
    JSON.stringify(completenessResult, null, 2),
    "",
    "dimensions:",
    JSON.stringify(state.dimensions, null, 2),
    "",
    "messages:",
    JSON.stringify(state.messages, null, 2),
  ].join("\n");
}

export function parseQuestionGenerationOutput(rawOutput: unknown): QuestionGenerationOutput {
  const parsed = questionGenerationOutputSchema.safeParse(rawOutput);
  if (parsed.success) return parsed.data;

  if (isObject(rawOutput) && Array.isArray(rawOutput.questions)) {
    return questionGenerationOutputSchema.parse({
      ...rawOutput,
      questions: rawOutput.questions.slice(0, 3).map((question) =>
        isObject(question) ? { options: [], ...question } : question,
      ),
    });
  }

  return questionGenerationOutputSchema.parse(rawOutput);
}

function applyQuestionLimitAssumptions(dimensions: IntentDimension[]): IntentDimension[] {
  return dimensions.map((dimension) => {
    if (isDimensionCompleteEnough(dimension) || dimension.questionsAsked.length < MAX_QUESTIONS_PER_DIMENSION) return dimension;

    return {
      ...dimension,
      status: "complete",
      completeness: Math.max(dimension.completeness, 0.8),
      confidence: Math.max(dimension.confidence, 0.5),
      assumptions: uniqueStrings([
        ...dimension.assumptions,
        `Reached question limit for ${dimension.key}; continue with reasonable design assumptions for: ${dimension.missingFields.join(", ") || "unspecified details"}.`,
      ]),
    };
  });
}

function removeRepeatedQuestions(plan: QuestionGenerationOutput, dimensions: IntentDimension[]): QuestionGenerationOutput {
  const dimensionsByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const usedQuestionTexts = new Set<string>();
  const questions: QuestionGenerationOutput["questions"] = [];

  for (const question of plan.questions) {
    const dimension = dimensionsByKey.get(question.dimensionKey);
    if (!dimension || isDimensionCompleteEnough(dimension)) continue;

    const candidate = normalizeQuestionOptions(
      isRepeatedQuestion(question.question, dimension.questionsAsked)
        ? buildFallbackQuestion(dimension)
        : question,
    );
    const normalized = normalizeQuestion(candidate.question);
    if (!normalized || usedQuestionTexts.has(normalized)) continue;
    if (isRepeatedQuestion(candidate.question, dimension.questionsAsked)) continue;

    usedQuestionTexts.add(normalized);
    questions.push(candidate);
    if (questions.length >= 3) break;
  }

  return { ...plan, questions };
}

function buildFallbackQuestion(dimension: IntentDimension): ClarificationPlan["questions"][number] {
  const missingField = dimension.missingFields[0] ?? "the most important missing detail";
  return {
    id: `q_${dimension.key}_followup_${dimension.questionsAsked.length + 1}`,
    dimensionKey: dimension.key,
    question: `Please clarify ${missingField} for ${dimension.key} with one concrete answer.`,
    options: [],
    expectedAnswerShape: "free_text",
  };
}

function normalizeQuestionOptions(question: ClarificationPlan["questions"][number]): QuestionGenerationOutput["questions"][number] {
  return { ...question, options: question.options ?? [] };
}

function isRepeatedQuestion(question: string, history: string[]) {
  return history.some((asked) => areQuestionsSimilar(question, asked));
}

function areQuestionsSimilar(left: string, right: string) {
  const normalizedLeft = normalizeQuestion(left);
  const normalizedRight = normalizeQuestion(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
  return diceCoefficient(normalizedLeft, normalizedRight) >= 0.86;
}

function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function diceCoefficient(left: string, right: string) {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;
  const rightCounts = new Map<string, number>();
  for (const pair of rightPairs) rightCounts.set(pair, (rightCounts.get(pair) ?? 0) + 1);
  let intersection = 0;
  for (const pair of leftPairs) {
    const count = rightCounts.get(pair) ?? 0;
    if (count <= 0) continue;
    intersection += 1;
    rightCounts.set(pair, count - 1);
  }
  return (2 * intersection) / (leftPairs.length + rightPairs.length);
}

function bigrams(value: string) {
  if (value.length < 2) return value ? [value] : [];
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
}

function isDimensionCompleteEnough(dimension: IntentDimension) {
  return dimension.status === "complete" && dimension.completeness >= 0.8 && dimension.confidence > 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
