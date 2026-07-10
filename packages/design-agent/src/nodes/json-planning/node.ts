import type { DesignAgentState } from "../../state.js";
import { failPipelineNode } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { compilePageStructurePlan } from "./compiler.js";
import { jsonPlanningPrompt } from "./prompt.js";
import {
  jsonPlanningModelOutputSchema,
  type JsonPlanningOutput,
  type PageStructurePlan,
} from "./schema.js";

export async function jsonPlanningNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const inputRefs = state.latestArtifactRefs.intent_compaction ? [state.latestArtifactRefs.intent_compaction] : [];
  const { structurePlan, errors } = await createStructurePlan(state, options, inputRefs);
  const document = compilePageStructurePlan(structurePlan);
  const output: JsonPlanningOutput = { structurePlan, document };
  const artifactRef = options.artifactStore
    ? await options.artifactStore.writeArtifact({
        node: "json_planning",
        status: "success",
        inputRefs,
        output,
        errors,
      })
    : undefined;

  return {
    currentNode: "json_planning",
    stage: "json_planning",
    latestArtifactRefs: artifactRef
      ? { ...state.latestArtifactRefs, json_planning: artifactRef }
      : state.latestArtifactRefs,
    validationErrors: errors.length ? errors : state.validationErrors,
    events: [
      ...state.events,
      { type: "agent.node", payload: { node: "json_planning", stage: "json_planning" } },
    ],
  };
}

async function createStructurePlan(
  state: DesignAgentState,
  options: GraphNodeOptions,
  inputRefs: DesignAgentState["latestArtifactRefs"][string][],
) {
  const fallback = buildFallbackStructurePlan(state);
  if (!options.createStructuredOutput) return { structurePlan: fallback, errors: [] };

  try {
    const modelOutput = await invokeStructureModel(options, buildJsonPlanningInput(state));
    return { structurePlan: modelOutput.structurePlan, errors: [] };
  } catch (firstError) {
    try {
      const modelOutput = await invokeStructureModel(options, buildStructureRetryInput(state, firstError, fallback));
      return { structurePlan: modelOutput.structurePlan, errors: [] };
    } catch (retryError) {
      const errors = [
        `${formatJsonPlanningError(firstError)}\nRetry failed: ${formatJsonPlanningError(retryError)}`,
      ];
      return failPipelineNode({
        options,
        node: "json_planning",
        inputRefs,
        output: { structurePlan: null, document: null },
        errors,
      });
    }
  }
}

async function invokeStructureModel(options: GraphNodeOptions, input: string) {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  return jsonPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(jsonPlanningModelOutputSchema).invoke(input),
  );
}

export function buildJsonPlanningInput(state: DesignAgentState): string {
  return [
    jsonPlanningPrompt,
    "",
    "Confirmed intent dimensions:",
    JSON.stringify(state.dimensions, null, 2),
    "",
    "Conversation messages:",
    JSON.stringify(state.messages, null, 2),
  ].join("\n");
}

function buildStructureRetryInput(
  state: DesignAgentState,
  error: unknown,
  validExample: PageStructurePlan,
): string {
  return [
    buildJsonPlanningInput(state),
    "",
    "The previous generation was rejected by the PageStructurePlan schema.",
    `Validation error: ${formatJsonPlanningError(error)}`,
    "Generate the complete flat structurePlan again. Do not return tree, elements, props, layout, or style fields.",
    "Use this valid structurePlan as the exact shape reference, then adapt its regions to the confirmed intent:",
    JSON.stringify(validExample, null, 2),
  ].join("\n");
}

function buildFallbackStructurePlan(state: DesignAgentState): PageStructurePlan {
  const pageContext = state.dimensions.find((dimension) => dimension.key === "page_context")?.value;
  const name = inferDocumentName(pageContext);
  return {
    document: {
      id: "design_generated_page",
      name,
      viewport: "desktop",
      width: 1440,
      background: "muted",
    },
    nodes: [
      {
        id: "page_root",
        parentId: null,
        order: 0,
        type: "page",
        name: "Page",
        purpose: "Application root",
      },
      {
        id: "header_section",
        parentId: "page_root",
        order: 0,
        type: "section",
        name: "Header",
        purpose: "Page title, context, and primary actions",
      },
      {
        id: "main_section",
        parentId: "page_root",
        order: 1,
        type: "section",
        name: "Main Content",
        purpose: "Primary information and workflows",
      },
      {
        id: "footer_section",
        parentId: "page_root",
        order: 2,
        type: "section",
        name: "Footer",
        purpose: "Supporting information and provenance",
      },
    ],
  };
}

function inferDocumentName(value: unknown) {
  if (isObject(value)) {
    const pageType = value.pageType ?? value.name ?? value.title ?? value.application ?? value.type;
    if (typeof pageType === "string" && pageType.trim()) return pageType.trim();
  }
  return "AI Generated Design";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatJsonPlanningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 4000 ? message : `${message.slice(0, 4000)}\n[error truncated]`;
}