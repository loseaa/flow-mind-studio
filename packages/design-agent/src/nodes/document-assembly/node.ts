import { designDocumentSchema, type DesignDocument } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import type { DocumentAssemblyOutput } from "./schema.js";

type PlanningArtifactOutput = {
  document?: DesignDocument;
  contentPlan?: unknown;
  structurePlan?: unknown;
  layoutPlan?: unknown;
  issues?: unknown;
  elementPlan?: unknown;
  interactionPlan?: unknown;
  stylePlan?: unknown;
  visualAssetPlan?: unknown;
};

export async function documentAssemblyNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const { document } = await readDocumentFromLatestArtifact(state, options, "image_planning");
  const content = await readOptionalPlanningArtifact(state, options, "content_planning");
  const structure = await readPlanningArtifact(state, options, "json_planning");
  const layout = await readPlanningArtifact(state, options, "layout_planning");
  const visualSlot = await readPlanningArtifact(state, options, "visual_slot_review");
  const element = await readPlanningArtifact(state, options, "element_planning");
  const interaction = await readPlanningArtifact(state, options, "interaction_planning");
  const style = await readPlanningArtifact(state, options, "style_planning");
  const image = await readPlanningArtifact(state, options, "image_planning");
  const visualSlotReview = {
    layoutPlan: visualSlot.output.layoutPlan ?? null,
    issues: visualSlot.output.issues ?? [],
  };
  const assembledDocument = designDocumentSchema.parse({
    ...document,
    variables: {
      ...document.variables,
      agentPlanning: {
        contentPlan: content?.output.contentPlan ?? null,
        structurePlan: structure.output.structurePlan ?? null,
        layoutPlan: layout.output.layoutPlan ?? null,
        visualSlotReview,
        elementPlan: element.output.elementPlan ?? null,
        interactionPlan: interaction.output.interactionPlan ?? null,
        stylePlan: style.output.stylePlan ?? null,
        visualAssetPlan: image.output.visualAssetPlan ?? null,
      },
    },
  });
  const output: DocumentAssemblyOutput = {
    document: assembledDocument,
    sourcePlans: {
      ...(content ? { contentPlanning: content.output.contentPlan ?? null } : {}),
      structurePlanning: structure.output.structurePlan ?? null,
      layoutPlanning: layout.output.layoutPlan ?? null,
      visualSlotReview,
      elementPlanning: element.output.elementPlan ?? null,
      interactionPlanning: interaction.output.interactionPlan ?? null,
      stylePlanning: style.output.stylePlan ?? null,
      imagePlanning: image.output.visualAssetPlan ?? null,
    },
    sourceArtifacts: {
      ...(content ? { contentPlanning: content.ref } : {}),
      structurePlanning: structure.ref,
      layoutPlanning: layout.ref,
      visualSlotReview: visualSlot.ref,
      elementPlanning: element.ref,
      interactionPlanning: interaction.ref,
      stylePlanning: style.ref,
      imagePlanning: image.ref,
    },
  };

  return writePipelineArtifact({
    state,
    options,
    node: "document_assembly",
    stage: "document_assembly",
    inputRefs: [content?.ref, structure.ref, layout.ref, visualSlot.ref, element.ref, interaction.ref, style.ref, image.ref].filter((ref): ref is ArtifactRef => Boolean(ref)),
    output,
  });
}

async function readOptionalPlanningArtifact(state: DesignAgentState, options: GraphNodeOptions, key: string) {
  const ref = state.latestArtifactRefs[key];
  if (!options.artifactStore || !ref) return undefined;
  const artifact = await options.artifactStore.readArtifact<PlanningArtifactOutput>(ref);
  return { ref: ref as ArtifactRef, output: artifact.output };
}

async function readPlanningArtifact(state: DesignAgentState, options: GraphNodeOptions, key: string) {
  const ref = state.latestArtifactRefs[key];
  if (!options.artifactStore || !ref) {
    throw new Error(`Missing required artifact for ${key}.`);
  }
  const artifact = await options.artifactStore.readArtifact<PlanningArtifactOutput>(ref);
  return { ref: ref as ArtifactRef, output: artifact.output };
}
