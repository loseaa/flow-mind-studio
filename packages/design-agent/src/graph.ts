import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ArtifactStore } from "./artifacts/store.js";
import type { CreateImageGeneration, CreateStructuredOutput } from "./nodes/types.js";
import type { DesignAgentState } from "./state.js";
import {
  clarificationNode,
  completedNode,
  completenessCheckNode,
  contentPlanningNode,
  documentAssemblyNode,
  documentRepairNode,
  elementPlanningNode,
  interactionPlanningNode,
  finalOutputNode,
  imageGenerationNode,
  imagePlanningNode,
  intentCompactionNode,
  intentRecognitionNode,
  jsonPlanningNode,
  layoutPlanningNode,
  preflightReviewNode,
  qualityFailureNode,
  visualSlotReviewNode,
  visualReviewNode,
  questionGenerationNode,
  reflectionRepairNode,
  routeAfterCompleteness,
  routeAfterQuestionGeneration,
  routeAfterReflectionRepair,
  routeAfterSchemaValidation,
  routeAfterVisualReview,
  schemaValidationNode,
  stylePlanningNode
} from "./nodes/index.js";
import { MAX_REPAIR_ATTEMPTS } from "./nodes/routing.js";

const DesignAgentAnnotation = Annotation.Root({
  threadId: Annotation<DesignAgentState["threadId"]>(),
  currentNode: Annotation<DesignAgentState["currentNode"]>(),
  stage: Annotation<DesignAgentState["stage"]>(),
  messages: Annotation<DesignAgentState["messages"]>(),
  dimensions: Annotation<DesignAgentState["dimensions"]>(),
  completenessResult: Annotation<DesignAgentState["completenessResult"] | undefined>(),
  clarificationPlan: Annotation<DesignAgentState["clarificationPlan"] | undefined>(),
  latestArtifactRefs: Annotation<DesignAgentState["latestArtifactRefs"]>(),
  pendingQuestionIds: Annotation<DesignAgentState["pendingQuestionIds"]>(),
  validationErrors: Annotation<DesignAgentState["validationErrors"]>(),
  repairAttempts: Annotation<DesignAgentState["repairAttempts"]>(),
  events: Annotation<DesignAgentState["events"]>()
});

export type DesignAgentGraphOptions = {
  artifactStore?: ArtifactStore;
  createStructuredOutput?: CreateStructuredOutput;
  createImageGeneration?: CreateImageGeneration;
  onNodeStart?: (node: string) => void;
  onNodeEnd?: (node: string) => void;
  startNode?: DesignAgentGraphStartNode;
};

export type DesignAgentGraphStartNode =
  | "intent_recognition"
  | "content_planning"
  | "json_planning"
  | "layout_planning"
  | "visual_slot_review"
  | "element_planning"
  | "interaction_planning"
  | "style_planning"
  | "preflight_review"
  | "image_planning"
  | "document_assembly"
  | "image_generation"
  | "schema_validation"
  | "visual_review"
  | "reflection_repair"
  | "document_repair"
  | "final_output";

export function designAgentRecursionLimit(maxRepairAttempts = MAX_REPAIR_ATTEMPTS) {
  const baselineSteps = 18;
  const stepsPerRepairLoop = 3;
  const safetyBuffer = 8;
  return Math.max(64, baselineSteps + (maxRepairAttempts * stepsPerRepairLoop) + safetyBuffer);
}

export function createDesignAgentGraph(options: DesignAgentGraphOptions = {}) {
  const startNode = options.startNode ?? "intent_recognition";
  return new StateGraph(DesignAgentAnnotation)
    .addNode("intent_recognition", (state) => runGraphNode(options, "intent_recognition", () => intentRecognitionNode(state, options)))
    .addNode("completeness_check", (state) => runGraphNode(options, "completeness_check", () => completenessCheckNode(state, options)))
    .addNode("question_generation", (state) => runGraphNode(options, "question_generation", () => questionGenerationNode(state, options)))
    .addNode("clarification", (state) => runGraphNode(options, "clarification", () => clarificationNode(state, options)))
    .addNode("intent_compaction", (state) => runGraphNode(options, "intent_compaction", () => intentCompactionNode(state, options)))
    .addNode("content_planning", (state) => runGraphNode(options, "content_planning", () => contentPlanningNode(state, options)))
    .addNode("json_planning", (state) => runGraphNode(options, "json_planning", () => jsonPlanningNode(state, options)))
    .addNode("layout_planning", (state) => runGraphNode(options, "layout_planning", () => layoutPlanningNode(state, options)))
    .addNode("visual_slot_review", (state) => runGraphNode(options, "visual_slot_review", () => visualSlotReviewNode(state, options)))
    .addNode("element_planning", (state) => runGraphNode(options, "element_planning", () => elementPlanningNode(state, options)))
    .addNode("interaction_planning", (state) => runGraphNode(options, "interaction_planning", () => interactionPlanningNode(state, options)))
    .addNode("style_planning", (state) => runGraphNode(options, "style_planning", () => stylePlanningNode(state, options)))
    .addNode("preflight_review", (state) => runGraphNode(options, "preflight_review", () => preflightReviewNode(state, options)))
    .addNode("quality_failure", (state) => runGraphNode(options, "quality_failure", () => qualityFailureNode(state, options)))
    .addNode("image_planning", (state) => runGraphNode(options, "image_planning", () => imagePlanningNode(state, options)))
    .addNode("document_assembly", (state) => runGraphNode(options, "document_assembly", () => documentAssemblyNode(state, options)))
    .addNode("image_generation", (state) => runGraphNode(options, "image_generation", () => imageGenerationNode(state, options)))
    .addNode("document_repair", (state) => runGraphNode(options, "document_repair", () => documentRepairNode(state, options)))
    .addNode("schema_validation", (state) => runGraphNode(options, "schema_validation", () => schemaValidationNode(state, options)))
    .addNode("visual_review", (state) => runGraphNode(options, "visual_review", () => visualReviewNode(state, options)))
    .addNode("reflection_repair", (state) => runGraphNode(options, "reflection_repair", () => reflectionRepairNode(state, options)))
    .addNode("final_output", (state) => runGraphNode(options, "final_output", () => finalOutputNode(state, options)))
    .addNode("completed", (state) => runGraphNode(options, "completed", () => completedNode(state)))
    .addConditionalEdges(START, () => startNode, {
      intent_recognition: "intent_recognition",
      content_planning: "content_planning",
      json_planning: "json_planning",
      layout_planning: "layout_planning",
      visual_slot_review: "visual_slot_review",
      element_planning: "element_planning",
      interaction_planning: "interaction_planning",
      style_planning: "style_planning",
      preflight_review: "preflight_review",
      image_planning: "image_planning",
      document_assembly: "document_assembly",
      image_generation: "image_generation",
      schema_validation: "schema_validation",
      visual_review: "visual_review",
      reflection_repair: "reflection_repair",
      document_repair: "document_repair",
      final_output: "final_output",
    })
    .addEdge("intent_recognition", "completeness_check")
    .addConditionalEdges("completeness_check", routeAfterCompleteness, {
      question_generation: "question_generation",
      intent_compaction: "intent_compaction"
    })
    .addConditionalEdges("question_generation", routeAfterQuestionGeneration, {
      clarification: "clarification",
      intent_compaction: "intent_compaction"
    })
    .addEdge("intent_compaction", "content_planning")
    .addEdge("content_planning", "json_planning")
    .addEdge("json_planning", "layout_planning")
    .addEdge("layout_planning", "visual_slot_review")
    .addEdge("visual_slot_review", "element_planning")
    .addEdge("element_planning", "interaction_planning")
    .addEdge("interaction_planning", "style_planning")
    .addEdge("style_planning", "preflight_review")
    .addEdge("preflight_review", "image_planning")
    .addEdge("image_planning", "document_assembly")
    .addEdge("document_assembly", "image_generation")
    .addEdge("image_generation", "schema_validation")
    .addConditionalEdges("schema_validation", routeAfterSchemaValidation, {
      reflection_repair: "reflection_repair",
      visual_review: "visual_review"
    })
    .addConditionalEdges("visual_review", routeAfterVisualReview, {
      document_repair: "document_repair",
      final_output: "final_output",
      failed: "quality_failure",
    })
    .addConditionalEdges("reflection_repair", routeAfterReflectionRepair, {
      document_repair: "document_repair",
      failed: END
    })
    .addEdge("document_repair", "schema_validation")
    .addEdge("final_output", "completed")
    .addEdge("clarification", END)
    .addEdge("completed", END)
    .compile();
}

async function runGraphNode<T>(options: DesignAgentGraphOptions, node: string, run: () => Promise<T> | T): Promise<T> {
  options.onNodeStart?.(node);
  try {
    const result = await run();
    options.onNodeEnd?.(node);
    return result;
  } catch (error) {
    options.onNodeEnd?.(node);
    throw error;
  }
}
