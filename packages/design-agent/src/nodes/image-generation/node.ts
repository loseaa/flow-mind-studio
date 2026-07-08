import { designDocumentSchema, type DesignDocument } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { failPipelineNode, readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import { visualAssetPlanSchema, type VisualAsset, type VisualAssetPlan } from "../image-planning/schema.js";
import type {
  CreateImageGeneration,
  GraphNodeOptions,
  ImageGenerationRequest,
} from "../types.js";
import { imageGenerationPrompt } from "./prompt.js";
import type { ImageGenerationItem, ImageGenerationOutput } from "./schema.js";

const MAX_CONCURRENCY = 2;
const MAX_ATTEMPTS = 2;
const PRIORITY_ORDER = { required: 0, recommended: 1, optional: 2 } as const;

export async function imageGenerationNode(
  state: DesignAgentState,
  options: GraphNodeOptions,
): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "document_assembly");
  const visualAssetPlan = await readVisualAssetPlan(options, inputRefs[0]);

  if (visualAssetPlan.imagePolicy === "none") {
    return writePipelineArtifact({
      state,
      options,
      node: "image_generation",
      stage: "image_generation",
      inputRefs,
      output: createOutput(document, visualAssetPlan, []),
    });
  }

  if (!options.createImageGeneration) {
    return failPipelineNode({
      options,
      node: "image_generation",
      inputRefs,
      output: createOutput(document, visualAssetPlan, []),
      errors: ["Required image provider is unavailable."],
    });
  }

  const scheduledAssets = visualAssetPlan.assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => PRIORITY_ORDER[left.asset.priority] - PRIORITY_ORDER[right.asset.priority] || left.index - right.index)
    .map(({ asset }) => asset);
  const images = await mapWithConcurrency(
    scheduledAssets,
    MAX_CONCURRENCY,
    (asset) => generateAsset(state, document, asset, options.createImageGeneration!),
  );
  const documentWithImages = structuredClone(document) as DesignDocument;
  for (const image of images) applyGeneratedImage(documentWithImages, image);
  const parsedDocument = designDocumentSchema.parse(documentWithImages);
  const output = createOutput(parsedDocument, visualAssetPlan, images);
  const failedImages = images.filter((image) => image.status === "failed");
  const blockingFailures = failedImages.filter((image) => image.priority !== "optional");
  const errors = failedImages.map((image) => image.error ?? `Image generation failed for ${image.assetId}.`);

  if (output.generatedCount < visualAssetPlan.minimumGeneratedAssets || blockingFailures.length > 0) {
    const minimumError = output.generatedCount < visualAssetPlan.minimumGeneratedAssets
      ? `Generated ${output.generatedCount} assets; at least ${visualAssetPlan.minimumGeneratedAssets} are required.`
      : undefined;
    return failPipelineNode({
      options,
      node: "image_generation",
      inputRefs,
      output,
      errors: [...errors, ...(minimumError ? [minimumError] : [])],
    });
  }

  return writePipelineArtifact({
    state,
    options,
    node: "image_generation",
    stage: "image_generation",
    inputRefs,
    output,
    errors,
  });
}

export function buildImageGenerationRequest(
  state: DesignAgentState,
  document: DesignDocument,
  asset: VisualAsset,
): ImageGenerationRequest {
  const targetElementId = asset.kind === "content_image"
    ? asset.targetElementId ?? asset.id
    : asset.targetElementId;
  const textContext = collectTextContext(document);
  const theme = document.variables.designTheme ?? null;
  const confirmedIntent = state.dimensions.map((dimension) => ({
    key: dimension.key,
    value: dimension.value,
  }));
  const prompt = [
    imageGenerationPrompt,
    "",
    `Design document: ${document.name}`,
    `Page purpose and audience: ${JSON.stringify(confirmedIntent)}`,
    `Visual theme and tone: ${JSON.stringify(theme)}`,
    `Asset id: ${asset.id}`,
    `Asset kind and role: ${asset.kind} / ${asset.role}`,
    `Target UI element: ${targetElementId}`,
    `Purpose: ${asset.purpose}`,
    `Composition brief: ${asset.promptBrief}`,
    `Required pixel size: ${asset.width}x${asset.height}px`,
    `Aspect ratio token: ${asset.aspectRatio}`,
    `Nearby UI text context: ${textContext.join(" | ") || document.name}`,
    asset.kind === "background_image"
      ? `Background requirement: keep contrast restrained, preserve a safe text area, and support ${asset.foregroundTone} foreground content.`
      : "Content image requirement: keep the primary subject inside the safe crop area and match the surrounding UI hierarchy.",
    "Do not include watermarks, logos, unreadable text, UI chrome, or accidental text overlays.",
  ].join("\n");

  return {
    assetId: asset.id,
    elementId: targetElementId,
    targetElementId,
    kind: asset.kind,
    role: asset.role,
    priority: asset.priority,
    purpose: asset.purpose,
    prompt,
    width: asset.width,
    height: asset.height,
    aspectRatio: asset.aspectRatio,
  };
}

async function generateAsset(
  state: DesignAgentState,
  document: DesignDocument,
  asset: VisualAsset,
  createImageGeneration: CreateImageGeneration,
): Promise<ImageGenerationItem> {
  const request = buildImageGenerationRequest(state, document, asset);
  let lastError: unknown;

  for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts += 1) {
    try {
      const result = await createImageGeneration(request);
      return {
        ...request,
        attempts,
        status: "generated",
        url: result.url,
        provider: result.provider,
        model: result.model,
        revisedPrompt: result.revisedPrompt,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ...request,
    attempts: MAX_ATTEMPTS,
    status: "failed",
    error: formatImageGenerationError(asset.id, lastError),
  };
}

function applyGeneratedImage(document: DesignDocument, image: ImageGenerationItem) {
  if (image.status !== "generated" || !image.url) return;
  const index = document.elements.findIndex((element) => element.id === image.targetElementId);
  const target = document.elements[index];
  if (!target) throw new Error(`Generated image target does not exist: ${image.targetElementId}`);

  if (image.kind === "content_image") {
    if (target.type !== "image") throw new Error(`Generated content target must be an image: ${image.targetElementId}`);
    document.elements[index] = {
      ...target,
      props: {
        ...target.props,
        src: image.url,
        alt: typeof target.props.alt === "string" ? target.props.alt : target.name,
        generatedImagePrompt: image.prompt,
        generatedImageSize: `${image.width}x${image.height}`,
      },
    };
    return;
  }

  if (target.type !== "page" && target.type !== "section" && target.type !== "stack") {
    throw new Error(`Generated background target must be a container: ${image.targetElementId}`);
  }
  document.elements[index] = {
    ...target,
    props: {
      ...target.props,
      generatedImagePrompt: image.prompt,
      generatedImageSize: `${image.width}x${image.height}`,
    },
    style: {
      ...target.style,
      base: { ...target.style.base, backgroundImage: image.url },
    },
  };
}

async function readVisualAssetPlan(options: GraphNodeOptions, ref: ArtifactRef) {
  if (!options.artifactStore) throw new Error("Artifact store is required for image generation.");
  const artifact = await options.artifactStore.readArtifact<{
    sourcePlans?: { imagePlanning?: unknown };
  }>(ref);
  return visualAssetPlanSchema.parse(artifact.output.sourcePlans?.imagePlanning);
}

function createOutput(
  document: DesignDocument,
  plan: VisualAssetPlan,
  images: ImageGenerationItem[],
): ImageGenerationOutput {
  return {
    document,
    images,
    generatedCount: images.filter((image) => image.status === "generated").length,
    minimumGeneratedAssets: plan.minimumGeneratedAssets,
    imagePolicy: plan.imagePolicy,
  };
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function collectTextContext(document: DesignDocument) {
  return document.elements
    .filter((element) => element.type === "text")
    .map((element) => element.props.text)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, 12);
}

function formatImageGenerationError(assetId: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return `Image generation failed for ${assetId} after ${MAX_ATTEMPTS} attempts: ${detail}`;
}