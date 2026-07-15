import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash, createHmac } from "node:crypto";

import type { CreateImageGeneration, ImageGenerationRequest, ImageGenerationResult } from "../nodes/types.js";

export type ImageProvider = "none" | "openai-compatible" | "gemini-native" | "volcengine-visual";

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
const DEFAULT_VOLCENGINE_BASE_URL = "https://visual.volcengineapi.com";
const DEFAULT_VOLCENGINE_REQ_KEY = "high_aes_general_v30l_zt2i";
const VOLCENGINE_REGION = "cn-north-1";
const VOLCENGINE_SERVICE = "cv";

export function createImageGenerationFactory(
  config: ImageProviderConfig = {},
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
): CreateImageGeneration | undefined {
  const provider = config.provider ?? readImageProvider(env);
  if (provider === "none") return undefined;

  const apiKey = config.apiKey ?? env.DESIGN_AGENT_IMAGE_API_KEY ?? env.IMAGE_API_KEY ?? env.OPENAI_API_KEY;
  if (provider !== "volcengine-visual" && !apiKey) return undefined;

  const model = config.model ?? env.DESIGN_AGENT_IMAGE_MODEL ?? env.IMAGE_MODEL ?? env.OPENAI_IMAGE_MODEL
    ?? (provider === "gemini-native"
      ? DEFAULT_GEMINI_IMAGE_MODEL
      : provider === "volcengine-visual"
        ? DEFAULT_VOLCENGINE_REQ_KEY
        : DEFAULT_IMAGE_MODEL);
  const configuredBaseUrl = config.baseURL ?? env.DESIGN_AGENT_IMAGE_BASE_URL ?? env.IMAGE_BASE_URL;
  const baseURL = stripTrailingSlashes(
    configuredBaseUrl
    ?? (provider === "gemini-native"
      ? env.GEMINI_BASE_URL ?? DEFAULT_GEMINI_BASE_URL
      : provider === "volcengine-visual"
        ? env.VOLCENGINE_VISUAL_BASE_URL ?? DEFAULT_VOLCENGINE_BASE_URL
        : env.OPENAI_BASE_URL ?? DEFAULT_IMAGE_BASE_URL)
  );
  const endpoint = config.endpoint ?? env.DESIGN_AGENT_IMAGE_ENDPOINT;
  const runDir = config.runDir;
  const publicBaseUrl = config.publicBaseUrl
    ?? env.DESIGN_AGENT_IMAGE_PUBLIC_BASE_URL
    ?? (runDir ? "/api/low-code/design-agent/assets/" + encodeURIComponent(basename(runDir)) : undefined);

  if (provider === "gemini-native") {
    return async (request) => generateGeminiNativeImage({
      request,
      apiKey: apiKey!,
      model,
      endpoint: endpoint ?? baseURL + "/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      fetchImpl,
      runDir,
      publicBaseUrl,
    });
  }

  if (provider === "volcengine-visual") {
    const accessKeyId = config.apiKey ?? env.VOLCENGINE_ACCESS_KEY_ID ?? env.VOLCENGINE_AK ?? env.DESIGN_AGENT_IMAGE_ACCESS_KEY_ID;
    const secretAccessKey = env.VOLCENGINE_SECRET_ACCESS_KEY ?? env.VOLCENGINE_SK ?? env.DESIGN_AGENT_IMAGE_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return undefined;
    if (!runDir || !publicBaseUrl) return undefined;

    return async (request) => generateVolcengineVisualImage({
      request,
      accessKeyId,
      secretAccessKey,
      reqKey: model,
      baseURL,
      fetchImpl,
      runDir,
      publicBaseUrl,
    });
  }

  return async (request) => generateOpenAICompatibleImage({
    request,
    apiKey: apiKey!,
    model,
    endpoint: endpoint ?? baseURL + "/images/generations",
    fetchImpl,
    runDir,
    publicBaseUrl,
  });
}

async function generateVolcengineVisualImage(input: {
  request: ImageGenerationRequest;
  accessKeyId: string;
  secretAccessKey: string;
  reqKey: string;
  baseURL: string;
  fetchImpl: FetchLike;
  runDir: string;
  publicBaseUrl: string;
}): Promise<ImageGenerationResult> {
  const size = volcengineImageSize(input.request);
  const submitBody = {
    req_key: input.reqKey,
    prompt: input.request.prompt,
    seed: -1,
    width: size.width,
    height: size.height,
  };
  const submit = await volcenginePost<VolcengineSubmitResponse>({
    baseURL: input.baseURL,
    action: "CVSync2AsyncSubmitTask",
    body: submitBody,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    fetchImpl: input.fetchImpl,
  });

  const taskId = submit.data?.task_id;
  if (submit.code !== 10000 || !taskId) {
    throw new Error("Volcengine submit failed with code " + submit.code + ": " + (submit.message ?? "unknown error"));
  }

  const queryBody = {
    req_key: input.reqKey,
    task_id: taskId,
    req_json: JSON.stringify({
      logo_info: { add_logo: false },
      return_url: true,
    }),
  };
  const maxPolls = Number(process.env.VOLCENGINE_IMAGE_MAX_POLLS ?? 40);
  const pollIntervalMs = Number(process.env.VOLCENGINE_IMAGE_POLL_INTERVAL_MS ?? 3000);
  let lastStatus = "unknown";
  for (let index = 0; index < maxPolls; index += 1) {
    if (index > 0) await delay(pollIntervalMs);
    const result = await volcenginePost<VolcengineResultResponse>({
      baseURL: input.baseURL,
      action: "CVSync2AsyncGetResult",
      body: queryBody,
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      fetchImpl: input.fetchImpl,
    });

    if (result.code !== 10000) {
      throw new Error("Volcengine result failed with code " + result.code + ": " + (result.message ?? "unknown error"));
    }

    lastStatus = result.data?.status ?? "unknown";
    const url = result.data?.image_urls?.[0];
    if (lastStatus === "done" && url) {
      return {
        url,
        provider: "volcengine-visual",
        model: input.reqKey,
      };
    }

    const base64Image = result.data?.binary_data_base64?.[0];
    if (lastStatus === "done" && base64Image) {
      const fileName = sanitizeFilePart(input.request.assetId) + ".png";
      const imagesDir = join(input.runDir, "images");
      await mkdir(imagesDir, { recursive: true });
      await writeFile(join(imagesDir, fileName), Buffer.from(base64Image, "base64"));
      return {
        url: stripTrailingSlashes(input.publicBaseUrl) + "/" + encodeURIComponent(fileName),
        provider: "volcengine-visual",
        model: input.reqKey,
      };
    }

    if (lastStatus === "not_found" || lastStatus === "expired") {
      throw new Error("Volcengine task ended with status " + lastStatus + ".");
    }
  }

  throw new Error("Volcengine image generation timed out; last status: " + lastStatus + ".");
}

async function volcenginePost<T>(input: {
  baseURL: string;
  action: string;
  body: unknown;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl: FetchLike;
}): Promise<T> {
  const query = "Action=" + encodeURIComponent(input.action) + "&Version=2022-08-31";
  const url = input.baseURL + "?" + query;
  const body = JSON.stringify(input.body);
  const headers = signVolcengineRequest({
    method: "POST",
    path: "/",
    query,
    host: new URL(input.baseURL).host,
    body,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
  });
  const response = await input.fetchImpl(url, { method: "POST", headers, body });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error("Volcengine API failed with " + response.status + ": " + bodyText);
  }
  return JSON.parse(bodyText) as T;
}

async function generateOpenAICompatibleImage(input: {
  request: ImageGenerationRequest;
  apiKey: string;
  model: string;
  endpoint: string;
  fetchImpl: FetchLike;
  runDir?: string;
  publicBaseUrl?: string;
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
      size: openAICompatibleImageSize(input.request, input.model),
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error("Image generation API failed with " + response.status + ": " + bodyText);
  }

  const body = JSON.parse(bodyText) as OpenAICompatibleImageResponse;
  const first = body.data?.[0];
  if (first?.url) {
    return {
      url: first.url,
      provider: "openai-compatible",
      model: input.model,
      revisedPrompt: first.revised_prompt,
    };
  }

  if (first?.b64_json) {
    if (!input.runDir || !input.publicBaseUrl) {
      throw new Error("OpenAI-compatible base64 image generation requires runDir and publicBaseUrl.");
    }
    const extension = extensionForImageResponse(body);
    const fileName = sanitizeFilePart(input.request.assetId) + "." + extension;
    const imagesDir = join(input.runDir, "images");
    await mkdir(imagesDir, { recursive: true });
    await writeFile(join(imagesDir, fileName), Buffer.from(first.b64_json, "base64"));

    return {
      url: stripTrailingSlashes(input.publicBaseUrl) + "/" + encodeURIComponent(fileName),
      provider: "openai-compatible",
      model: input.model,
      revisedPrompt: first.revised_prompt,
    };
  }

  throw new Error("Image generation API did not return a URL or base64 image data.");
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
  if (provider === "none" || provider === "openai-compatible" || provider === "gemini-native" || provider === "volcengine-visual") return provider;
  throw new Error("Unsupported DESIGN_AGENT_IMAGE_PROVIDER: " + provider);
}

function geminiAspectRatio(aspectRatio: ImageGenerationRequest["aspectRatio"]) {
  if (aspectRatio === "square") return "1:1";
  if (aspectRatio === "portrait") return "3:4";
  return "16:9";
}

function openAICompatibleImageSize(request: ImageGenerationRequest, model: string) {
  const normalizedModel = model.toLowerCase();
  if (normalizedModel.includes("dall-e-3")) {
    if (request.aspectRatio === "portrait") return "1024x1792";
    if (request.aspectRatio === "wide") return "1792x1024";
    return "1024x1024";
  }
  if (normalizedModel.includes("gpt-image-1")) {
    if (request.aspectRatio === "portrait") return "1024x1536";
    if (request.aspectRatio === "wide") return "1536x1024";
    return "1024x1024";
  }
  return request.width + "x" + request.height;
}

function volcengineImageSize(request: ImageGenerationRequest) {
  if (request.aspectRatio === "square") return { width: 1328, height: 1328 };
  if (request.aspectRatio === "portrait") return { width: 1104, height: 1472 };
  return { width: 1664, height: 936 };
}

function extensionForMimeType(mimeType?: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function extensionForImageResponse(response: OpenAICompatibleImageResponse) {
  if (response.output_format === "jpeg") return "jpg";
  if (response.output_format === "webp") return "webp";
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

function signVolcengineRequest(input: {
  method: string;
  path: string;
  query: string;
  host: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const now = new Date();
  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Host: input.host,
    "X-Content-Sha256": payloadHash,
    "X-Date": xDate,
  };
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalHeaders = [
    "content-type:" + headers["Content-Type"],
    "host:" + headers.Host,
    "x-content-sha256:" + headers["X-Content-Sha256"],
    "x-date:" + headers["X-Date"],
    "",
  ].join("\n");
  const canonicalRequest = [
    input.method,
    input.path,
    input.query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = [shortDate, VOLCENGINE_REGION, VOLCENGINE_SERVICE, "request"].join("/");
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(input.secretAccessKey, shortDate),
        VOLCENGINE_REGION,
      ),
      VOLCENGINE_SERVICE,
    ),
    "request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    ...headers,
    Authorization: "HMAC-SHA256 Credential=" + input.accessKeyId + "/" + credentialScope
      + ", SignedHeaders=" + signedHeaders
      + ", Signature=" + signature,
  };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type OpenAICompatibleImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  output_format?: "png" | "webp" | "jpeg";
};

type VolcengineSubmitResponse = {
  code: number;
  message?: string;
  data?: {
    task_id?: string;
  };
};

type VolcengineResultResponse = {
  code: number;
  message?: string;
  data?: {
    status?: string;
    image_urls?: string[] | null;
    binary_data_base64?: string[] | null;
  } | null;
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
