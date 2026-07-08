import type { DesignDocument } from "@flowmind/shared";

export const intentDimensionKeys = [
  "page_context",
  "content_structure",
  "data_requirements",
  "interaction_flow",
  "presentation_rules"
] as const;

export type IntentDimensionKey = (typeof intentDimensionKeys)[number];

export type IntentDimensionStatus = "complete" | "partial" | "missing" | "conflicting";

export type IntentDimension = {
  key: IntentDimensionKey;
  status: IntentDimensionStatus;
  completeness: number;
  confidence: number;
  value: unknown;
  evidence: string[];
  missingFields: string[];
  assumptions: string[];
  questionsAsked: string[];
};

export type AgentStage =
  | "intent_recognition"
  | "dimension_state_update"
  | "intent_validation"
  | "completeness_check"
  | "question_generation"
  | "clarification"
  | "intent_compaction"
  | "json_planning"
  | "layout_planning"
  | "visual_slot_review"
  | "element_planning"
  | "interaction_planning"
  | "style_planning"
  | "image_planning"
  | "document_assembly"
  | "image_generation"
  | "schema_validation"
  | "final_output"
  | "reflection_repair"
  | "document_repair"
  | "completed"
  | "failed";

export type AgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type ArtifactRef = {
  node: string;
  path: string;
  version: number;
  checksum: string;
};

export type NodeArtifactStatus = "success" | "needs_input" | "failed";

export type NodeArtifact<TOutput> = {
  threadId: string;
  node: string;
  version: number;
  status: NodeArtifactStatus;
  inputRefs: ArtifactRef[];
  output: TOutput;
  errors: string[];
  createdAt: string;
};

export type CompletenessResult = {
  allComplete: boolean;
  completedDimensions: IntentDimension[];
  incompleteDimensions: IntentDimension[];
  conflictingDimensions: IntentDimension[];
  blockingReasons: string[];
};

export type ClarificationQuestion = {
  id: string;
  dimensionKey: IntentDimensionKey;
  question: string;
  options?: string[];
  expectedAnswerShape: "single_choice" | "multi_choice" | "free_text";
};

export type ClarificationPlan = {
  reason: string;
  questions: ClarificationQuestion[];
};

export type DesignAgentEvent =
  | { type: "agent.node"; payload: { node: string; stage: AgentStage } }
  | { type: "agent.clarification"; payload: ClarificationPlan }
  | { type: "agent.validation"; payload: { node: string; valid: boolean; errors: string[] } }
  | { type: "agent.done"; payload: { document: DesignDocument; artifact: ArtifactRef } }
  | { type: "agent.error"; payload: { message: string; node?: string } };

export type DesignAgentState = {
  threadId: string;
  currentNode: string;
  stage: AgentStage;
  messages: AgentMessage[];
  dimensions: IntentDimension[];
  completenessResult?: CompletenessResult;
  clarificationPlan?: ClarificationPlan;
  latestArtifactRefs: Record<string, ArtifactRef>;
  pendingQuestionIds: string[];
  validationErrors: string[];
  repairAttempts: number;
  events: DesignAgentEvent[];
};

export function createInitialDimensions(): IntentDimension[] {
  return intentDimensionKeys.map((key) => ({
    key,
    status: "missing",
    completeness: 0,
    confidence: 0,
    value: null,
    evidence: [],
    missingFields: [],
    assumptions: [],
    questionsAsked: []
  }));
}

export function createInitialState(threadId: string): DesignAgentState {
  return {
    threadId,
    currentNode: "intent_recognition",
    stage: "intent_recognition",
    messages: [],
    dimensions: createInitialDimensions(),
    latestArtifactRefs: {},
    pendingQuestionIds: [],
    validationErrors: [],
    repairAttempts: 0,
    events: []
  };
}
