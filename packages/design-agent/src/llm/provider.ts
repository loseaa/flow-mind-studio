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

export function createStructuredOutputFactory(
  config: LlmProviderConfig = {},
  env: Env = process.env,
  ChatModel: ChatModelConstructor = ChatOpenAI,
): CreateStructuredOutput | undefined {
  const provider = config.provider ?? readProvider(env);
  if (provider === "none") return undefined;

  const apiKey = config.apiKey ?? env.DESIGN_AGENT_LLM_API_KEY ?? env.OPENAI_API_KEY ?? env.LLM_API_KEY ?? env.DEEPSEEK_API_KEY;
  if (!apiKey) return undefined;

  const model = config.model ?? env.DESIGN_AGENT_MODEL ?? env.OPENAI_MODEL ?? env.LLM_MODEL ?? env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const temperature = config.temperature ?? 0;
  const baseURL =
    config.baseURL ??
    env.DESIGN_AGENT_LLM_BASE_URL ??
    env.OPENAI_BASE_URL ??
    env.LLM_BASE_URL ??
    env.DEEPSEEK_BASE_URL ??
    DEFAULT_BASE_URL;
  const structuredOutputMethod =
    config.structuredOutputMethod ?? readStructuredOutputMethod(env) ?? DEFAULT_STRUCTURED_OUTPUT_METHOD;

  const modelInstance = new ChatModel({
    apiKey,
    model,
    temperature,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });

  return (schema) => {
    const runnable = modelInstance.withStructuredOutput(schema, { method: structuredOutputMethod });
    if (structuredOutputMethod !== "jsonMode") return runnable;

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

function readProvider(env: Env): LlmProvider {
  const provider = env.DESIGN_AGENT_LLM_PROVIDER;
  if (!provider) return "openai-compatible";
  if (provider === "none" || provider === "openai-compatible") return provider;
  throw new Error(`Unsupported DESIGN_AGENT_LLM_PROVIDER: ${provider}`);
}

function readStructuredOutputMethod(env: Env): StructuredOutputMethod | undefined {
  const method = env.DESIGN_AGENT_STRUCTURED_OUTPUT_METHOD;
  if (!method) return undefined;
  if (method === "function_calling" || method === "jsonSchema" || method === "jsonMode") return method;
  throw new Error(`Unsupported DESIGN_AGENT_STRUCTURED_OUTPUT_METHOD: ${method}`);
}