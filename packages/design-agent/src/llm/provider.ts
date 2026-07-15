import { ChatOpenAI } from "@langchain/openai";

import type { CreateStructuredOutput, StructuredOutputModel } from "../nodes/types.js";

export type LlmProvider = "none" | "openai-compatible";
export type StructuredOutputMethod = "function_calling" | "jsonSchema" | "jsonMode";

export type LlmProviderConfig = {
  provider?: LlmProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  structuredOutputMethod?: StructuredOutputMethod;
};

type Env = Record<string, string | undefined>;

type OpenAICompatibleModelConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  configuration?: {
    baseURL: string;
  };
};

type ChatModelConstructor = new (config: OpenAICompatibleModelConfig) => StructuredOutputModel;

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_STRUCTURED_OUTPUT_METHOD: StructuredOutputMethod = "function_calling";
const DEFAULT_EXECUTION_NODES = [
  "json_planning",
  "layout_planning",
  "element_planning",
  "interaction_planning",
  "style_planning",
  "image_planning",
  "visual_review",
  "reflection_repair",
];

export function createStructuredOutputFactory(
  config: LlmProviderConfig = {},
  env: Env = process.env,
  ChatModel: ChatModelConstructor = ChatOpenAI,
): CreateStructuredOutput | undefined {
  const provider = config.provider ?? readProvider(env);
  if (provider === "none") return undefined;

  const defaultSettings = readDefaultModelSettings(config, env);
  if (!defaultSettings.apiKey) return undefined;
  const executionSettings = readExecutionModelSettings(defaultSettings, env);
  const executionNodes = readExecutionNodes(env);
  const instances = new Map<string, { model: StructuredOutputModel; method: StructuredOutputMethod }>();

  return (schema, context) => {
    const useExecutionModel = Boolean(context?.node && executionSettings && executionNodes.has(context.node));
    const settings = useExecutionModel && executionSettings ? executionSettings : defaultSettings;
    const modelInstance = getModelInstance(settings, instances, ChatModel);
    const runnable = modelInstance.model.withStructuredOutput(schema, { method: modelInstance.method });
    if (modelInstance.method !== "jsonMode") return runnable;

    return {
      invoke(input: unknown) {
        const jsonInput = typeof input === "string"
          ? `Return only one valid JSON object that satisfies the provided schema.\n\n${input}`
          : input;
        return runnable.invoke(jsonInput);
      },
    };
  };
}

type ResolvedModelSettings = {
  apiKey: string;
  model: string;
  baseURL: string;
  temperature: number;
  structuredOutputMethod: StructuredOutputMethod;
};

function readDefaultModelSettings(config: LlmProviderConfig, env: Env): ResolvedModelSettings {
  return {
    apiKey: config.apiKey ?? env.DESIGN_AGENT_LLM_API_KEY ?? env.OPENAI_API_KEY ?? env.LLM_API_KEY ?? env.DEEPSEEK_API_KEY ?? "",
    model: config.model ?? env.DESIGN_AGENT_MODEL ?? env.OPENAI_MODEL ?? env.LLM_MODEL ?? env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
    temperature: config.temperature ?? 0,
    baseURL:
      config.baseURL ??
      env.DESIGN_AGENT_LLM_BASE_URL ??
      env.OPENAI_BASE_URL ??
      env.LLM_BASE_URL ??
      env.DEEPSEEK_BASE_URL ??
      DEFAULT_BASE_URL,
    structuredOutputMethod: config.structuredOutputMethod ?? readStructuredOutputMethod(env) ?? DEFAULT_STRUCTURED_OUTPUT_METHOD,
  };
}

function readExecutionModelSettings(defaults: ResolvedModelSettings, env: Env): ResolvedModelSettings | undefined {
  const model = env.DESIGN_AGENT_EXECUTION_MODEL ?? env.DESIGN_AGENT_STRONG_MODEL;
  const apiKey = env.DESIGN_AGENT_EXECUTION_LLM_API_KEY ?? env.DESIGN_AGENT_EXECUTION_API_KEY;
  const baseURL = env.DESIGN_AGENT_EXECUTION_LLM_BASE_URL ?? env.DESIGN_AGENT_EXECUTION_BASE_URL;
  const method = readStructuredOutputMethodFromValue(
    env.DESIGN_AGENT_EXECUTION_STRUCTURED_OUTPUT_METHOD ?? env.DESIGN_AGENT_STRONG_STRUCTURED_OUTPUT_METHOD,
    "DESIGN_AGENT_EXECUTION_STRUCTURED_OUTPUT_METHOD",
  );
  if (!model && !apiKey && !baseURL && !method) return undefined;
  return {
    apiKey: apiKey ?? defaults.apiKey,
    model: model ?? defaults.model,
    baseURL: baseURL ?? defaults.baseURL,
    temperature: defaults.temperature,
    structuredOutputMethod: method ?? defaults.structuredOutputMethod,
  };
}

function readExecutionNodes(env: Env) {
  const raw = env.DESIGN_AGENT_EXECUTION_NODES ?? env.DESIGN_AGENT_STRONG_NODES;
  const nodes = raw
    ? raw.split(",").map((item) => item.trim()).filter(Boolean)
    : DEFAULT_EXECUTION_NODES;
  return new Set(nodes);
}

function getModelInstance(
  settings: ResolvedModelSettings,
  instances: Map<string, { model: StructuredOutputModel; method: StructuredOutputMethod }>,
  ChatModel: ChatModelConstructor,
) {
  const key = JSON.stringify(settings);
  const existing = instances.get(key);
  if (existing) return existing;
  const created = {
    method: settings.structuredOutputMethod,
    model: new ChatModel({
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      ...(settings.baseURL ? { configuration: { baseURL: settings.baseURL } } : {}),
    }),
  };
  instances.set(key, created);
  return created;
}

function readProvider(env: Env): LlmProvider {
  const provider = env.DESIGN_AGENT_LLM_PROVIDER;
  if (!provider) return "openai-compatible";
  if (provider === "none" || provider === "openai-compatible") return provider;
  throw new Error(`Unsupported DESIGN_AGENT_LLM_PROVIDER: ${provider}`);
}

function readStructuredOutputMethod(env: Env): StructuredOutputMethod | undefined {
  return readStructuredOutputMethodFromValue(env.DESIGN_AGENT_STRUCTURED_OUTPUT_METHOD, "DESIGN_AGENT_STRUCTURED_OUTPUT_METHOD");
}

function readStructuredOutputMethodFromValue(method: string | undefined, name: string): StructuredOutputMethod | undefined {
  if (!method) return undefined;
  if (method === "function_calling" || method === "jsonSchema" || method === "jsonMode") return method;
  throw new Error(`Unsupported ${name}: ${method}`);
}
