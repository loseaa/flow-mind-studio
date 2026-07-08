import type { DesignAgentState } from "../../state.js";
import { updateDimensionState, type DimensionUpdate } from "../../intent/dimensions.js";
import type { GraphNodeOptions } from "../types.js";
import { intentRecognitionPrompt } from "./prompt.js";
import { intentRecognitionOutputSchema } from "./schema.js";

export async function intentRecognitionNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const output = options.createStructuredOutput
    ? intentRecognitionOutputSchema.parse(
        await options.createStructuredOutput(intentRecognitionOutputSchema).invoke(buildIntentRecognitionInput(state)),
      )
    : intentRecognitionOutputSchema.parse(recognizeIntentWithRules(state));
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
        errors: [],
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
  const updates: DimensionUpdate[] = [
    {
      key: "page_context",
      status: "partial",
      completeness: 0.5,
      confidence: 0.45,
      value: { rawPrompt: content },
      evidence: [content],
      missingFields: ["业务目标", "使用角色"],
      assumptions: [],
    },
  ];

  if (/(列表|表格|筛选|指标|卡片|表单|详情|看板)/.test(content)) {
    updates.push({
      key: "content_structure",
      status: "partial",
      completeness: 0.45,
      confidence: 0.45,
      value: { rawPrompt: content },
      evidence: [content],
      missingFields: ["核心区块优先级", "布局关系"],
      assumptions: [],
    });
  }

  return { updates };
}