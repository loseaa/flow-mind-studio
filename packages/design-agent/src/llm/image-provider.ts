import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { CreateImageGeneration, ImageGenerationRequest, ImageGenerationResult } from "../nodes/types.js";

export type ImageProvider = "none" | "openai-compatible" | "gemini-native";

export type ImageProviderConfig = {
  provider?: ImageProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  endpoint?: string;
  runDir?: string;
  publicBaseUrl?: string;
};

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "dall-e-3";
const DEFAULT_GEMINI_BASE_URL = "https://api.openai-proxy.org/google";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

export function createImageGenerationFactory(
  config: ImageProviderConfig = {},
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
): CreateImageGeneration | undefined {
  const provider = config.provider ?? readImageProvider(env);
  if (provider === "none") return undefined;

  const apiKey = config.apiKey ?? env.DESIGN_AGENT_IMAGE_API_KEY ?? env.IMAGE_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const model = config.model ?? env.DESIGN_AGENT_IMAGE_MODEL ?? env.IMAGE_MODEL ?? env.OPENAI_IMAGE_MODEL
    ?? (provider === "gemini-native" ? DEFAULT_GEMINI_IMAGE_MODEL : DEFAULT_IMAGE_MODEL);
  const configuredBaseUrl = config.baseURL ?? env.DESIGN_AGENT_IMAGE_BASE_URL ?? env.IMAGE_BASE_URL;
  const baseURL = stripTrailingSlashes(
    configuredBaseUrl
    ?? (provider === "gemini-native" ? env.GEMINI_BASE_URL ?? DEFAULT_GEMINI_BASE_URL : env.OPENAI_BASE_URL ?? DEFAULT_IMAGE_BASE_URL)
  );
  const endpoint = config.endpoint ?? env.DESIGN_AGENT_IMAGE_ENDPOINT;
  const runDir = config.runDir;
  const publicBaseUrl = config.publicBaseUrl
    ?? env.DESIGN_AGENT_IMAGE_PUBLIC_BASE_URL
    ?? (runDir ? "/api/low-code/design-agent/assets/" + encodeURIComponent(basename(runDir)) : undefined);

  if (provider === "gemini-native") {
    return async (request) => generateGeminiNativeImage({
      request,
      apiKey,
      model,
      endpoint: endpoint ?? baseURL + "/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      fetchImpl,
      runDir,
      publicBaseUrl,
    });
  }

  return async (request) => generateOpenAICompatibleImage({
    request,
    apiKey,
    model,
    endpoint: endpoint ?? baseURL + "/images/generations",
    fetchImpl,
  });
}

async function generateOpenAICompatibleImage(input: {
  request: ImageGenerationRequest;
  apiKey: string;
  model: string;
  endpoint: string;
  fetchImpl: FetchLike;
}): Promise<ImageGenerationResult> {
  const response = await input.fetchImpl(input.endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.request.prompt,
      n: 1,
      size: input.request.width + "x" + input.request.height,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error("Image generation API failed with " + response.status + ": " + bodyText);
  }

  const body = JSON.parse(bodyText) as OpenAICompatibleImageResponse;
  const first = body.data?.[0];
  if (!first?.url) {
    throw new Error("Image generation API did not return a URL.");
  }

  return {
    url: first.url,
    provider: "openai-compatible",
    model: input.model,
    revisedPrompt: first.revised_prompt,
  };
}

async function generateGeminiNativeImage(input: {
  request: ImageGenerationRequest;
  apiKey: string;
  model: string;
  endpoint: string;
  fetchImpl: FetchLike;
  runDir?: string;
  publicBaseUrl?: string;
}): Promise<ImageGenerationResult> {
  if (!input.runDir || !input.publicBaseUrl) {
    throw new Error("Gemini native image generation requires runDir and publicBaseUrl.");
  }

  const response = await input.fetchImpl(input.endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: input.request.prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: geminiAspectRatio(input.request.aspectRatio) },
      },
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error("Gemini image generation API failed with " + response.status + ": " + bodyText);
  }

  const body = JSON.parse(bodyText) as GeminiImageResponse;
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inlineData = imagePart?.inlineData ?? imagePart?.inline_data;
  if (!inlineData?.data) throw new Error("Gemini image generation API did not return inline image data.");

  const mimeFields = inlineData as { mimeType?: string; mime_type?: string };
  const mimeType = mimeFields.mimeType ?? mimeFields.mime_type;
  const extension = extensionForMimeType(mimeType);
  const fileName = sanitizeFilePart(input.request.assetId) + "." + extension;
  const imagesDir = join(input.runDir, "images");
  await mkdir(imagesDir, { recursive: true });
  await writeFile(join(imagesDir, fileName), Buffer.from(inlineData.data, "base64"));

  return {
    url: stripTrailingSlashes(input.publicBaseUrl) + "/" + encodeURIComponent(fileName),
    provider: "gemini-native",
    model: input.model,
    revisedPrompt: parts.find((part) => typeof part.text === "string")?.text,
  };
}

function readImageProvider(env: Env): ImageProvider {
  const provider = env.DESIGN_AGENT_IMAGE_PROVIDER;
  if (!provider) return "openai-compatible";
  if (provider === "none" || provider === "openai-compatible" || provider === "gemini-native") return provider;
  throw new Error("Unsupported DESIGN_AGENT_IMAGE_PROVIDER: " + provider);
}

function geminiAspectRatio(aspectRatio: ImageGenerationRequest["aspectRatio"]) {
  if (aspectRatio === "square") return "1:1";
  if (aspectRatio === "portrait") return "3:4";
  return "16:9";
}

function extensionForMimeType(mimeType?: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function stripTrailingSlashes(value: string) {
  let result = value;
  while (result.endsWith("/")) result = result.slice(0, -1);
  return result;
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

type OpenAICompatibleImageResponse = {
  data?: Array<{
    url?: string;
    revised_prompt?: string;
  }>;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
  }>;
};