import { describe, expect, it } from "vitest";

import type { StructuredOutputModel } from "../nodes/types.js";
import { createStructuredOutputFactory } from "./provider.js";

class FakeChatOpenAI implements StructuredOutputModel {
  static instances: unknown[] = [];
  static structuredOutputCalls: unknown[] = [];
  static invokeInputs: unknown[] = [];

  constructor(config: unknown) {
    FakeChatOpenAI.instances.push(config);
  }

  withStructuredOutput(schema: unknown, config?: unknown) {
    FakeChatOpenAI.structuredOutputCalls.push({ schema, config });
    return {
      invoke: async (input: unknown) => {
        FakeChatOpenAI.invokeInputs.push(input);
        return { reason: "test", questions: [] };
      },
    };
  }
}

describe("createStructuredOutputFactory", () => {
  it("returns undefined when provider is disabled", () => {
    expect(createStructuredOutputFactory({ provider: "none" }, {}, FakeChatOpenAI)).toBeUndefined();
  });

  it("creates a schema-bound runnable from project OpenAI environment variables", async () => {
    FakeChatOpenAI.instances = [];
    FakeChatOpenAI.structuredOutputCalls = [];
    const schema = { type: "object", properties: { ok: { type: "boolean" } } };
    const factory = createStructuredOutputFactory(
      {},
      {
        OPENAI_MODEL: "gpt-4.1-mini",
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://api.openai-proxy.org/v1",
      },
      FakeChatOpenAI,
    );

    const runnable = factory?.(schema);
    const output = await runnable?.invoke({ prompt: "test" });

    expect(output).toEqual({ reason: "test", questions: [] });
    expect(FakeChatOpenAI.instances).toEqual([
      {
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        temperature: 0,
        configuration: {
          baseURL: "https://api.openai-proxy.org/v1",
        },
      },
    ]);
    expect(FakeChatOpenAI.structuredOutputCalls).toEqual([
      { schema, config: { method: "function_calling" } },
    ]);
  });

  it("prefers OpenAI variables over chat LLM variables for structured output", () => {
    FakeChatOpenAI.instances = [];
    const factory = createStructuredOutputFactory(
      {},
      {
        LLM_API_KEY: "llm-key",
        LLM_BASE_URL: "https://api.deepseek.com",
        LLM_MODEL: "deepseek-v4-flash",
        OPENAI_API_KEY: "openai-key",
        OPENAI_BASE_URL: "https://api.openai-proxy.org/v1",
        OPENAI_MODEL: "gpt-4.1-mini",
      },
      FakeChatOpenAI,
    );
    factory?.({ type: "object" });

    expect(FakeChatOpenAI.instances).toEqual([
      {
        apiKey: "openai-key",
        model: "gpt-4.1-mini",
        temperature: 0,
        configuration: {
          baseURL: "https://api.openai-proxy.org/v1",
        },
      },
    ]);
  });
  it("adds an explicit JSON instruction when using jsonMode", async () => {
    FakeChatOpenAI.invokeInputs = [];
    const factory = createStructuredOutputFactory(
      { structuredOutputMethod: "jsonMode" },
      { OPENAI_API_KEY: "test-key" },
      FakeChatOpenAI,
    );

    await factory?.({ type: "object" }).invoke("Analyze the confirmed intent dimensions.");

    expect(FakeChatOpenAI.invokeInputs).toEqual([
      "Return only one valid JSON object that satisfies the provided schema.\n\nAnalyze the confirmed intent dimensions.",
    ]);
  });

  it("routes execution nodes to the configured stronger DeepSeek model", () => {
    FakeChatOpenAI.instances = [];
    FakeChatOpenAI.structuredOutputCalls = [];
    const factory = createStructuredOutputFactory(
      {},
      {
        DESIGN_AGENT_LLM_API_KEY: "default-key",
        DESIGN_AGENT_LLM_BASE_URL: "https://api.deepseek.com",
        DESIGN_AGENT_MODEL: "deepseek-v4-flash",
        DESIGN_AGENT_EXECUTION_MODEL: "deepseek-v4-pro",
        DESIGN_AGENT_EXECUTION_LLM_BASE_URL: "https://api.deepseek.com",
        DESIGN_AGENT_EXECUTION_STRUCTURED_OUTPUT_METHOD: "jsonMode",
      },
      FakeChatOpenAI,
    );

    factory?.({ type: "intent" }, { node: "intent_recognition" });
    factory?.({ type: "layout" }, { node: "layout_planning" });

    expect(FakeChatOpenAI.instances).toEqual([
      {
        apiKey: "default-key",
        model: "deepseek-v4-flash",
        temperature: 0,
        configuration: {
          baseURL: "https://api.deepseek.com",
        },
      },
      {
        apiKey: "default-key",
        model: "deepseek-v4-pro",
        temperature: 0,
        configuration: {
          baseURL: "https://api.deepseek.com",
        },
      },
    ]);
    expect(FakeChatOpenAI.structuredOutputCalls).toEqual([
      { schema: { type: "intent" }, config: { method: "function_calling" } },
      { schema: { type: "layout" }, config: { method: "jsonMode" } },
    ]);
  });
});
