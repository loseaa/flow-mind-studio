import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ArtifactStore } from "./artifacts/store.js";
import type { CreateImageGeneration, CreateStructuredOutput } from "./nodes/types.js";
import type { DesignAgentState } from "./state.js";
import {
  clarificationNode,
  completedNode,
  completenessCheckNode,
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
  visualSlotReviewNode,
  questionGenerationNode,
  reflectionRepairNode,
  routeAfterCompleteness,
  routeAfterQuestionGeneration,
  routeAfterReflectionRepair,
  routeAfterSchemaValidation,
  schemaValidationNode,
  stylePlanningNode
} from "./nodes/index.js";

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
  | "reflection_repair"
  | "document_repair"
  | "final_output";

export function createDesignAgentGraph(options: DesignAgentGraphOptions = {}) {
  const startNode = options.startNode ?? "intent_recognition";
  return new StateGraph(DesignAgentAnnotation)
    .addNode("intent_recognition", (state) => runGraphNode(options, "intent_recognition", () => intentRecognitionNode(state, options)))
    .addNode("completeness_check", (state) => runGraphNode(options, "completeness_check", () => completenessCheckNode(state, options)))
    .addNode("question_generation", (state) => runGraphNode(options, "question_generation", () => questionGenerationNode(state, options)))
    .addNode("clarification", (state) => runGraphNode(options, "clarification", () => clarificationNode(state, options)))
    .addNode("intent_compaction", (state) => runGraphNode(options, "intent_compaction", () => intentCompactionNode(state, options)))
    .addNode("json_planning", (state) => runGraphNode(options, "json_planning", () => jsonPlanningNode(state, options)))
    .addNode("layout_planning", (state) => runGraphNode(options, "layout_planning", () => layoutPlanningNode(state, options)))
    .addNode("visual_slot_review", (state) => runGraphNode(options, "visual_slot_review", () => visualSlotReviewNode(state, options)))
    .addNode("element_planning", (state) => runGraphNode(options, "element_planning", () => elementPlanningNode(state, options)))
    .addNode("interaction_planning", (state) => runGraphNode(options, "interaction_planning", () => interactionPlanningNode(state, options)))
    .addNode("style_planning", (state) => runGraphNode(options, "style_planning", () => stylePlanningNode(state, options)))
    .addNode("image_planning", (state) => runGraphNode(options, "image_planning", () => imagePlanningNode(state, options)))
    .addNode("document_assembly", (state) => runGraphNode(options, "document_assembly", () => documentAssemblyNode(state, options)))
    .addNode("image_generation", (state) => runGraphNode(options, "image_generation", () => imageGenerationNode(state, options)))
    .addNode("document_repair", (state) => runGraphNode(options, "document_repair", () => documentRepairNode(state, options)))
    .addNode("schema_validation", (state) => runGraphNode(options, "schema_validation", () => schemaValidationNode(state, options)))
    .addNode("reflection_repair", (state) => runGraphNode(options, "reflection_repair", () => reflectionRepairNode(state, options)))
    .addNode("final_output", (state) => runGraphNode(options, "final_output", () => finalOutputNode(state, options)))
    .addNode("completed", (state) => runGraphNode(options, "completed", () => completedNode(state)))
    .addConditionalEdges(START, () => startNode, {
      intent_recognition: "intent_recognition",
      json_planning: "json_planning",
      layout_planning: "layout_planning",
      visual_slot_review: "visual_slot_review",
      element_planning: "element_planning",
      interaction_planning: "interaction_planning",
      style_planning: "style_planning",
      image_planning: "image_planning",
      document_assembly: "document_assembly",
      image_generation: "image_generation",
      schema_validation: "schema_validation",
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
    .addEdge("intent_compaction", "json_planning")
    .addEdge("json_planning", "layout_planning")
    .addEdge("layout_planning", "visual_slot_review")
    .addEdge("visual_slot_review", "element_planning")
    .addEdge("element_planning", "interaction_planning")
    .addEdge("interaction_planning", "style_planning")
    .addEdge("style_planning", "image_planning")
    .addEdge("image_planning", "document_assembly")
    .addEdge("document_assembly", "image_generation")
    .addEdge("image_generation", "schema_validation")
    .addConditionalEdges("schema_validation", routeAfterSchemaValidation, {
      reflection_repair: "reflection_repair",
      final_output: "final_output"
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
