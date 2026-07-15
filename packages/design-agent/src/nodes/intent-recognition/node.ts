import type { DesignAgentState } from "../../state.js";
import { updateDimensionState, type DimensionUpdate } from "../../intent/dimensions.js";
import type { GraphNodeOptions } from "../types.js";
import { intentRecognitionPrompt } from "./prompt.js";
import { intentRecognitionOutputSchema } from "./schema.js";

export async function intentRecognitionNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const errors: string[] = [];
  let output = intentRecognitionOutputSchema.parse(recognizeIntentWithRules(state));
  if (options.createStructuredOutput) {
    try {
      output = intentRecognitionOutputSchema.parse(
        await options.createStructuredOutput(intentRecognitionOutputSchema, { node: "intent_recognition" }).invoke(buildIntentRecognitionInput(state)),
      );
    } catch (error) {
      errors.push(formatError(error));
    }
  }
  const updates: DimensionUpdate[] = output.updates.map((update) => ({
    ...update,
    value: update.value ?? null,
  }));
  const dimensions = updateDimensionState(state.dimensions, updates);
  const inputRefs = state.latestArtifactRefs.clarification_answer ? [state.latestArtifactRefs.clarification_answer] : [];
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "intent_recognition",
        status: "success",
        inputRefs,
        output,
        errors,
      })
    : undefined;

  return {
    currentNode: "intent_recognition",
    stage: "intent_recognition",
    dimensions,
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, intent_recognition: artifactRef }
      : state.latestArtifactRefs,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "intent_recognition", stage: "intent_recognition" } },
    ],
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function buildIntentRecognitionInput(state: DesignAgentState): string {
  return [
    intentRecognitionPrompt,
    "",
    "Conversation messages:",
    JSON.stringify(state.messages, null, 2),
    "",
    "Current intent dimensions:",
    JSON.stringify(state.dimensions, null, 2),
  ].join("\n");
}

function recognizeIntentWithRules(state: DesignAgentState) {
  const latestUserMessage = [...state.messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage?.content.trim()) return { updates: [] };

  const content = latestUserMessage.content.trim();
  const pageContext = {
    businessGoal: extractLabeledValue(content, ["业务目标", "营销目的", "目标"]),
    pageType: extractLabeledValue(content, ["页面类型", "页面"]),
    targetUser: extractLabeledValue(content, ["目标用户", "使用角色", "用户"]),
    rawPrompt: content,
  };
  const sections = splitList(extractLabeledValue(content, ["核心区块", "页面需要哪些核心区块", "区块"]));
  const fields = splitList(extractLabeledValue(content, ["核心字段", "字段", "数据字段"]));
  const interactions = splitList(extractLabeledValue(content, ["交互", "用户操作", "操作"]));
  const presentation = extractLabeledValue(content, ["视觉要求", "视觉", "风格", "展示要求"]);
  const updates: DimensionUpdate[] = [
    {
      key: "page_context",
      status: pageContext.businessGoal && pageContext.pageType && pageContext.targetUser ? "complete" : "partial",
      completeness: pageContext.businessGoal && pageContext.pageType && pageContext.targetUser ? 0.95 : 0.5,
      confidence: pageContext.businessGoal || pageContext.pageType || pageContext.targetUser ? 0.75 : 0.45,
      value: pageContext,
      evidence: [content],
      missingFields: [
        ...(pageContext.businessGoal ? [] : ["业务目标"]),
        ...(pageContext.pageType ? [] : ["页面类型"]),
        ...(pageContext.targetUser ? [] : ["使用角色"]),
      ],
      assumptions: [],
    },
  ];

  if (sections.length > 0 || /(列表|表格|筛选|指标|卡片|表单|详情|看板|英雄图|卖点|按钮|CTA)/i.test(content)) {
    updates.push({
      key: "content_structure",
      status: sections.length > 0 ? "complete" : "partial",
      completeness: sections.length > 0 ? 0.9 : 0.45,
      confidence: sections.length > 0 ? 0.75 : 0.45,
      value: { sections, rawPrompt: content },
      evidence: [content],
      missingFields: sections.length > 0 ? [] : ["核心区块优先级", "布局关系"],
      assumptions: [],
    });
  }

  if (fields.length > 0) {
    updates.push({
      key: "data_requirements",
      status: "complete",
      completeness: 0.9,
      confidence: 0.75,
      value: { fields, rawPrompt: content },
      evidence: [content],
      missingFields: [],
      assumptions: [],
    });
  }

  if (interactions.length > 0) {
    updates.push({
      key: "interaction_flow",
      status: "complete",
      completeness: 0.9,
      confidence: 0.75,
      value: { interactions, rawPrompt: content },
      evidence: [content],
      missingFields: [],
      assumptions: [],
    });
  }

  if (presentation) {
    updates.push({
      key: "presentation_rules",
      status: "complete",
      completeness: 0.9,
      confidence: 0.75,
      value: { style: presentation, rawPrompt: content },
      evidence: [content],
      missingFields: [],
      assumptions: [],
    });
  }

  return { updates };
}

function extractLabeledValue(content: string, labels: string[]) {
  const escapedLabels = labels.map((label) => escapeRegExp(label));
  const labelPattern = escapedLabels.join("|");
  const nextLabelPattern = [
    "业务目标",
    "营销目的",
    "目标",
    "页面类型",
    "页面",
    "目标用户",
    "使用角色",
    "用户",
    "核心区块",
    "页面需要哪些核心区块",
    "区块",
    "核心字段",
    "字段",
    "数据字段",
    "交互",
    "用户操作",
    "操作",
    "视觉要求",
    "视觉",
    "风格",
    "展示要求",
  ].map((label) => escapeRegExp(label)).join("|");
  const match = content.match(new RegExp(`(?:${labelPattern})\\s*[：: ]\\s*([\\s\\S]*?)(?=(?:。|\\n)?\\s*(?:${nextLabelPattern})\\s*[：: ]|$)`));
  return match?.[1]?.trim().replace(/[。；;，,]+$/, "") || undefined;
}

function splitList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(/[、,，;；。]|\s+and\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
