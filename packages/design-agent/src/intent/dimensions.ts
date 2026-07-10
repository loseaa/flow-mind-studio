import type { ClarificationPlan, CompletenessResult, IntentDimension, IntentDimensionKey, IntentDimensionStatus } from "../state.js";

const MAX_QUESTIONS_PER_TURN = 3;

const questionByDimension: Record<IntentDimensionKey, string> = {
  page_context: "这个设计图面向什么业务目标、页面类型和使用角色？",
  content_structure: "页面需要哪些核心区块？例如筛选区、指标卡、表格、表单或操作区。",
  data_requirements: "页面里最核心要展示或录入哪些字段？",
  interaction_flow: "用户在这个页面里需要执行哪些操作？",
  presentation_rules: "页面展示上有什么风格、密度或限制要求？"
};

export type DimensionUpdate = {
  key: IntentDimensionKey;
  status: IntentDimensionStatus;
  completeness: number;
  confidence: number;
  value: unknown;
  evidence?: string[];
  missingFields?: string[];
  assumptions?: string[];
};

export function updateDimensionState(dimensions: IntentDimension[], updates: DimensionUpdate[]): IntentDimension[] {
  const updatesByKey = new Map(updates.map((update) => [update.key, update]));

  return dimensions.map((dimension) => {
    const update = updatesByKey.get(dimension.key);
    if (!update) return dimension;

    return {
      ...dimension,
      status: update.status,
      completeness: clamp01(update.completeness),
      confidence: clamp01(update.confidence),
      value: update.value,
      evidence: uniqueStrings([...dimension.evidence, ...(update.evidence ?? [])]),
      missingFields: uniqueStrings(update.missingFields ?? []),
      assumptions: uniqueStrings([...dimension.assumptions, ...(update.assumptions ?? [])])
    };
  });
}

export function evaluateCompleteness(dimensions: IntentDimension[]): CompletenessResult {
  const completedDimensions = dimensions.filter((dimension) => isComplete(dimension));
  const conflictingDimensions = dimensions.filter((dimension) => dimension.status === "conflicting");
  const incompleteDimensions = dimensions.filter((dimension) => !isComplete(dimension) && dimension.status !== "conflicting");
  const blockingReasons = [
    ...incompleteDimensions.map((dimension) => `${dimension.key} is ${dimension.status}`),
    ...conflictingDimensions.map((dimension) => `${dimension.key} is conflicting`)
  ];

  return {
    allComplete: dimensions.length > 0 && completedDimensions.length === dimensions.length,
    completedDimensions,
    incompleteDimensions,
    conflictingDimensions,
    blockingReasons
  };
}

export function generateClarificationPlan(result: CompletenessResult): ClarificationPlan {
  const blockingDimensions = [...result.conflictingDimensions, ...result.incompleteDimensions].slice(0, MAX_QUESTIONS_PER_TURN);

  return {
    reason: result.blockingReasons.length > 0 ? `需要补全：${result.blockingReasons.join("；")}` : "需要补充设计意图。",
    questions: blockingDimensions.map((dimension) => ({
      id: `q_${dimension.key}`,
      dimensionKey: dimension.key,
      question: questionByDimension[dimension.key],
      options: [],
      expectedAnswerShape: "free_text"
    }))
  };
}

export function recordQuestionsAsked(dimensions: IntentDimension[], plan: ClarificationPlan): IntentDimension[] {
  return dimensions.map((dimension) => {
    const questions = plan.questions
      .filter((question) => question.dimensionKey === dimension.key)
      .map((question) => question.question);
    if (questions.length === 0) return dimension;

    return {
      ...dimension,
      questionsAsked: uniqueStrings([...dimension.questionsAsked, ...questions])
    };
  });
}

function isComplete(dimension: IntentDimension) {
  return dimension.status === "complete" && dimension.completeness >= 0.8 && dimension.confidence > 0;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
