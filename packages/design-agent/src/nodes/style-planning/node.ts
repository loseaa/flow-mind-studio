import type { DesignDocument, DesignElement } from "@flowmind/shared";

import type { DesignAgentState } from "../../state.js";
import { readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { compileStylePlan, repairStylePlan } from "./compiler.js";
import { stylePlanningPrompt } from "./prompt.js";
import { stylePlanningModelOutputSchema, type StylePlan, type StylePlanningOutput } from "./schema.js";

export async function stylePlanningNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "interaction_planning");
  const planned = await createStyledDocument(state, document, options);
  const output: StylePlanningOutput = {
    document: planned.document,
    stylePlan: planned.stylePlan,
  };

  return writePipelineArtifact({
    state,
    options,
    node: "style_planning",
    stage: "style_planning",
    inputRefs,
    output,
    errors: planned.errors,
  });
}

async function createStyledDocument(
  state: DesignAgentState,
  document: DesignDocument,
  options: GraphNodeOptions,
) {
  const fallback = planStyleWithRules(document);
  if (!options.createStructuredOutput) {
    return { stylePlan: fallback, document: compileStylePlan(document, fallback), errors: [] };
  }

  try {
    const stylePlan = repairStylePlan(document, await invokeStyleModel(options, buildStylePlanningInput(state, document)));
    return { stylePlan, document: compileStylePlan(document, stylePlan), errors: [] };
  } catch (firstError) {
    try {
      const stylePlan = repairStylePlan(document, await invokeStyleModel(options, buildStyleRetryInput(state, document, firstError)));
      return { stylePlan, document: compileStylePlan(document, stylePlan), errors: [] };
    } catch (retryError) {
      const errors = [`${formatError(firstError)}\nRetry failed: ${formatError(retryError)}`];
      return {
        stylePlan: fallback,
        document: compileStylePlan(document, fallback),
        errors,
      };
    }
  }
}

async function invokeStyleModel(options: GraphNodeOptions, input: string): Promise<StylePlan> {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  const output = stylePlanningModelOutputSchema.parse(
    await options.createStructuredOutput(stylePlanningModelOutputSchema, { node: "style_planning" }).invoke(input),
  );
  return output.stylePlan;
}

export function buildStylePlanningInput(state: DesignAgentState, document: DesignDocument): string {
  return [
    stylePlanningPrompt,
    "",
    "Confirmed presentation intent:",
    JSON.stringify(
      state.dimensions.find((dimension) => dimension.key === "presentation_rules") ?? null,
      null,
      2,
    ),
    "",
    "Available elements:",
    JSON.stringify(elementSummaries(document), null, 2),
  ].join("\n");
}

function buildStyleRetryInput(state: DesignAgentState, document: DesignDocument, error: unknown) {
  return [
    buildStylePlanningInput(state, document),
    "",
    "The previous style plan was rejected by schema or preset compatibility validation.",
    `Validation error: ${formatError(error)}`,
    "Generate the complete stylePlan again. Assign only compatible presets to available element ids.",
  ].join("\n");
}

function elementSummaries(document: DesignDocument) {
  return document.elements.map((element) => ({
    id: element.id,
    name: element.name,
    type: element.type,
    purpose: element.props.purpose ?? null,
  }));
}

function planStyleWithRules(document: DesignDocument): StylePlan {
  return {
    theme: "neutral_workspace",
    tone: "operational",
    assignments: document.elements.flatMap((element) => {
      const preset = defaultPreset(element);
      return preset ? [{ elementId: element.id, preset }] : [];
    }),
    notes: ["Deterministic fallback applies type-compatible operational presets."],
  };
}

function defaultPreset(element: DesignElement): StylePlan["assignments"][number]["preset"] | undefined {
  if (element.type === "page") return "page";
  if (element.type === "section") return "section";
  if (element.type === "stack") return "panel";
  if (element.type === "text") {
    const hint = `${element.id} ${element.name} ${String(element.props.purpose ?? "")}`.toLowerCase();
    if (/(page|hero|header|main)[_\s-]?(title|headline)/.test(hint)) return "heading";
    if (/(^|[_\s-])(title|heading)([_\s-]|$)/.test(hint)) return "subheading";
    if (/eyebrow|caption|description|helper|note/.test(hint)) return "muted";
    return "body";
  }
  if (element.type === "image") return "media";
  if (element.type === "button") {
    return inferButtonPreset(element);
  }
  if (element.type === "input" || element.type === "filter" || element.type === "form") return "control";
  if (element.type === "badge") return "status";
  if (element.type === "stat") return "metric";
  if (element.type === "table") return "data_table";
  return undefined;
}

function inferButtonPreset(element: DesignElement): StylePlan["assignments"][number]["preset"] {
  const identity = `${element.id} ${element.name} ${String(element.props.label ?? "")} ${String(element.props.purpose ?? "")}`.toLowerCase();
  if (/secondary|cancel|back|close|learn|contact|more|details|explore|view|browse|咨询|联系|了解|更多|查看/.test(identity)) {
    return "secondary_action";
  }
  if (/primary|submit|create|save|confirm|buy|start|shop|cart|checkout|order|add|purchase|立即|马上|开始|购买|选购|下单|结算|加入购物车|购物车/.test(identity)) {
    return "primary_action";
  }
  return "secondary_action";
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 4000 ? message : `${message.slice(0, 4000)}\n[error truncated]`;
}
