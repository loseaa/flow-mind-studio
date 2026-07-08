import type { ArtifactStore } from "../artifacts/store.js";

export type StructuredOutputRunnable<TOutput = unknown> = {
  invoke(input: unknown): Promise<TOutput> | TOutput;
};

export type StructuredOutputModel<TSchema = unknown, TOutput = unknown> = {
  withStructuredOutput(schema: TSchema, config?: unknown): StructuredOutputRunnable<TOutput>;
};

export type CreateStructuredOutput = (schema: unknown) => StructuredOutputRunnable<unknown>;

export type ImageGenerationRequest = {
  assetId: string;
  elementId: string;
  targetElementId: string;
  kind: "content_image" | "background_image";
  role: "hero" | "section" | "thumbnail" | "illustration";
  priority: "required" | "recommended" | "optional";
  purpose: string;
  prompt: string;
  width: number;
  height: number;
  aspectRatio: "wide" | "square" | "portrait";
};

export type ImageGenerationResult = {
  url: string;
  provider?: string;
  model?: string;
  revisedPrompt?: string;
};

export type CreateImageGeneration = (request: ImageGenerationRequest) => Promise<ImageGenerationResult> | ImageGenerationResult;

export type GraphNodeOptions = {
  artifactStore?: ArtifactStore;
  createStructuredOutput?: CreateStructuredOutput;
  createImageGeneration?: CreateImageGeneration;
};