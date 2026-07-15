import { designDocumentSchema, designImageSlotSchema, type DesignDocument, type DesignImageSlot } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { compileVisualAssetPlan } from "./compiler.js";
import { imagePlanningPrompt } from "./prompt.js";
import {
  hasExplicitNoImageIntent,
  imagePlanningModelOutputSchema,
  validateImagePolicy,
  visualAssetPlanSchema,
  type ImageAssetDraft,
  type ImagePlanningModelOutput,
  type VisualAsset,
  type VisualAssetPlan,
} from "./schema.js";

type StylePlanningSource = {
  document?: DesignDocument;
  stylePlan?: { theme?: string; tone?: string };
};
type VisualSlotSource = { layoutPlan?: { imageSlots?: DesignImageSlot[] } };

export async function imagePlanningNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const styleRef = state.latestArtifactRefs.style_planning;
  const visualRef = state.latestArtifactRefs.visual_slot_review;
  if (!options.artifactStore || !styleRef) throw new Error("Missing required artifact for style_planning.");
  if (!visualRef) throw new Error("Missing required artifact for visual_slot_review.");
  const styleSource = await readStyleSource(options, styleRef);
  const visualSource = await options.artifactStore.readArtifact<VisualSlotSource>(visualRef);
  const document = readStylePlanningDocument(styleSource);
  const slots = (visualSource.output.layoutPlan?.imageSlots ?? []).map((slot) => designImageSlotSchema.parse(slot));
  const inputRefs = [styleRef, visualRef];
  const planned = await createImagePlan(state, document, slots, styleSource, options, inputRefs);
  const output = { visualAssetPlan: planned.visualAssetPlan, document: planned.document };
  return writePipelineArtifact({ state, options, node: "image_planning", stage: "image_planning", inputRefs, output, errors: planned.errors });
}

async function createImagePlan(state: DesignAgentState, document: DesignDocument, slots: DesignImageSlot[], style: StylePlanningSource, options: GraphNodeOptions, inputRefs: ArtifactRef[]) {
  if (!options.createStructuredOutput) {
    const plan = resolveDraftPlan(createRuleBasedImageDraft(state, slots), state, document, slots, style);
    return { visualAssetPlan: plan, document: compileVisualAssetPlan(document, plan), errors: [] as string[] };
  }
  const invoke = async (input: string) => {
    const output = imagePlanningModelOutputSchema.parse(await options.createStructuredOutput!(imagePlanningModelOutputSchema, { node: "image_planning" }).invoke(input));
    const plan = resolveDraftPlan(output, state, document, slots, style);
    return { visualAssetPlan: plan, document: compileVisualAssetPlan(document, plan), errors: [] as string[] };
  };
  try {
    return await invoke(buildImagePlanningInput(state, document, slots, style));
  } catch (firstError) {
    try {
      return await invoke(`${buildImagePlanningInput(state, document, slots, style)}\n\nPrevious plan rejected: ${formatError(firstError)}\nReturn a complete slot-only plan using each listed slot at most once.`);
    } catch (retryError) {
      const fallback = resolveDraftPlan(createRuleBasedImageDraft(state, slots), state, document, slots, style);
      return {
        visualAssetPlan: fallback,
        document: compileVisualAssetPlan(document, fallback),
        errors: [`${formatError(firstError)}\nRetry failed: ${formatError(retryError)}`],
      };
    }
  }
}

export function resolveDraftPlan(output: ImagePlanningModelOutput, state: DesignAgentState, document: DesignDocument, slots: DesignImageSlot[], style: StylePlanningSource = {}): VisualAssetPlan {
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const ids = new Set<string>();
  const usedSlots = new Set<string>();
  const assets: VisualAsset[] = output.visualAssetPlan.assets.map((draft) => {
    if (ids.has(draft.id)) throw new Error(`Duplicate visual asset id: ${draft.id}`);
    if (usedSlots.has(draft.slotId)) throw new Error(`Duplicate image slot id: ${draft.slotId}`);
    const slot = slotMap.get(draft.slotId);
    if (!slot) throw new Error(`Unknown image slot: ${draft.slotId}`);
    ids.add(draft.id); usedSlots.add(draft.slotId);
    const target = document.elements.find((element) => element.props.imageSlotId === slot.id);
    if (!target) throw new Error(`No compiled element owns image slot: ${slot.id}`);
    const derived = {
      ...draft,
      role: roleFor(slot.role), targetElementId: target.id,
      width: slot.generation.width, height: slot.generation.height,
      aspectRatio: ratioFor(slot.display.aspectRatio),
    };
    return slot.placement === "background"
      ? { ...derived, kind: "background_image" as const, foregroundTone: foregroundFor(slot, style) }
      : { ...derived, kind: "content_image" as const };
  });
  const plan = visualAssetPlanSchema.parse({ ...output.visualAssetPlan, assets });
  return validateImagePolicy(plan, { messages: state.messages, dimensions: state.dimensions, allowNoImages: slots.length === 0 });
}

export function buildImagePlanningInput(state: DesignAgentState, document: DesignDocument, slots: DesignImageSlot[], style: StylePlanningSource = {}): string {
  return [imagePlanningPrompt, "", "Confirmed intent:", JSON.stringify(state.dimensions, null, 2), "", "Theme:", JSON.stringify(style.stylePlan ?? document.variables.designTheme ?? null, null, 2), "", "Reviewed image slots:", JSON.stringify(slots, null, 2), "", "Nearby text:", JSON.stringify(document.elements.filter((e) => e.type === "text").map((e) => e.props.text).filter(Boolean).slice(0, 12), null, 2)].join("\n");
}

function createRuleBasedImageDraft(state: DesignAgentState, slots: DesignImageSlot[]): ImagePlanningModelOutput {
  if (slots.length === 0 || hasExplicitNoImageIntent({ messages: state.messages, dimensions: state.dimensions })) return { visualAssetPlan: { imagePolicy: "none", visualMode: "none", minimumGeneratedAssets: 0, assets: [], notes: [slots.length === 0 ? "Reviewed layout does not require generated imagery." : "Explicit no-image intent."] } };
  if (slots.length < 3) throw new Error("Required image policy needs at least three reviewed slots.");
  return { visualAssetPlan: { imagePolicy: "required", visualMode: slots.length > 3 ? "rich" : "standard", minimumGeneratedAssets: 3, assets: slots.map((slot, index) => ({ id: `visual_${slot.id}`, slotId: slot.id, purpose: `${slot.role} visual`, promptBrief: `Create a ${slot.role} image composed for the reviewed ${slot.display.aspectRatio} slot with ${slot.generation.safeArea} safe area`, priority: index < 3 ? "required" : "recommended" })), notes: ["Deterministic slot-based fallback."] } };
}

function readStylePlanningDocument(styleSource: StylePlanningSource): DesignDocument {
  const parsed = designDocumentSchema.safeParse(styleSource.document);
  if (!parsed.success) {
    throw new Error(`Invalid style_planning.output.document: ${parsed.error.message}`);
  }
  return parsed.data;
}
async function readStyleSource(options: GraphNodeOptions, ref: ArtifactRef): Promise<StylePlanningSource> {
  const artifact = await options.artifactStore!.readArtifact<StylePlanningSource>(ref); return artifact.output;
}
function roleFor(role: DesignImageSlot["role"]): VisualAsset["role"] { return role === "card" ? "thumbnail" : role === "gallery" ? "illustration" : role; }
function ratioFor(ratio: DesignImageSlot["display"]["aspectRatio"]): VisualAsset["aspectRatio"] { return ratio === "1:1" ? "square" : ratio === "3:4" ? "portrait" : "wide"; }
function foregroundFor(slot: DesignImageSlot, style: StylePlanningSource): "light" | "dark" {
  const theme = `${style.stylePlan?.theme ?? ""} ${style.stylePlan?.tone ?? ""}`.toLowerCase();
  return slot.generation.safeArea === "none" && /(light|minimal|clean)/.test(theme) ? "dark" : "light";
}
function formatError(error: unknown) { const message = error instanceof Error ? error.message : String(error); return message.slice(0, 4_000); }
