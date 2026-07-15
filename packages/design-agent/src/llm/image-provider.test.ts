import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createImageGenerationFactory } from "./image-provider.js";

describe("createImageGenerationFactory", () => {
  it("creates an OpenAI-compatible image generator from env config", async () => {
    const calls: Array<{ url: string; body: unknown; authorization?: string }> = [];
    const generator = createImageGenerationFactory(
      {},
      {
        DESIGN_AGENT_IMAGE_API_KEY: "image-key",
        DESIGN_AGENT_IMAGE_MODEL: "dall-e-3",
        DESIGN_AGENT_IMAGE_BASE_URL: "https://image.example.com/v1/",
      },
      async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body), authorization: init.headers.Authorization });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ url: "https://cdn.example.com/generated.png", revised_prompt: "revised" }] }),
        };
      },
    );

    expect(generator).toBeDefined();
    const result = await generator!({
      assetId: "hero_visual",
      slotId: "hero_slot",
      elementId: "hero_image",
      targetElementId: "hero_image",
      kind: "content_image",
      role: "hero",
      priority: "required",
      purpose: "Show the ecommerce hero product",
      prompt: "Generate a 800x200 ecommerce hero image",
      width: 800,
      height: 200,
      aspectRatio: "wide",
    });

    expect(result).toEqual({
      url: "https://cdn.example.com/generated.png",
      provider: "openai-compatible",
      model: "dall-e-3",
      revisedPrompt: "revised",
    });
    expect(calls).toEqual([
      {
        url: "https://image.example.com/v1/images/generations",
        authorization: "Bearer image-key",
        body: expect.objectContaining({
          model: "dall-e-3",
          prompt: "Generate a 800x200 ecommerce hero image",
          size: "1792x1024",
        }),
      },
    ]);
    expect(calls[0].body).not.toHaveProperty("response_format");
  });

  it("keeps custom OpenAI-compatible image model sizes unchanged", async () => {
    const calls: Array<{ body: unknown }> = [];
    const generator = createImageGenerationFactory(
      {},
      {
        DESIGN_AGENT_IMAGE_API_KEY: "image-key",
        DESIGN_AGENT_IMAGE_MODEL: "custom-image-model",
        DESIGN_AGENT_IMAGE_BASE_URL: "https://image.example.com/v1/",
      },
      async (_url, init) => {
        calls.push({ body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ url: "https://cdn.example.com/generated.png" }] }),
        };
      },
    );

    await generator!({ ...imageRequest(), width: 800, height: 200, aspectRatio: "wide" });

    expect(calls[0].body).toEqual(expect.objectContaining({ size: "800x200" }));
  });

  it("stores OpenAI-compatible base64 image data and returns an API asset URL", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-openai-compatible-image-"));
    const generator = createImageGenerationFactory(
      {
        runDir,
        publicBaseUrl: "/api/low-code/design-agent/assets/test-run",
      },
      {
        DESIGN_AGENT_IMAGE_API_KEY: "image-key",
        DESIGN_AGENT_IMAGE_MODEL: "gpt-image-1",
        DESIGN_AGENT_IMAGE_BASE_URL: "https://image.example.com/v1/",
      },
      async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output_format: "png",
          data: [{ b64_json: Buffer.from("png-data").toString("base64"), revised_prompt: "revised" }],
        }),
      }),
    );

    const result = await generator!(imageRequest());

    expect(result).toEqual({
      url: "/api/low-code/design-agent/assets/test-run/hero_visual.png",
      provider: "openai-compatible",
      model: "gpt-image-1",
      revisedPrompt: "revised",
    });
    await expect(readFile(join(runDir, "images", "hero_visual.png"), "utf8")).resolves.toBe("png-data");
  });

  it("returns undefined when no image API key is configured", () => {
    expect(createImageGenerationFactory({}, {})).toBeUndefined();
  });

  it("submits and polls Volcengine visual image tasks", async () => {
    const calls: Array<{ url: string; body: unknown; authorization?: string; xDate?: string }> = [];
    const generator = createImageGenerationFactory(
      {
        provider: "volcengine-visual",
        runDir: await mkdtemp(join(tmpdir(), "flowmind-volcengine-image-")),
        publicBaseUrl: "/api/low-code/design-agent/assets/test-run",
      },
      {
        VOLCENGINE_ACCESS_KEY_ID: "volc-ak",
        VOLCENGINE_SECRET_ACCESS_KEY: "volc-sk",
      },
      async (url, init) => {
        calls.push({
          url,
          body: JSON.parse(init.body),
          authorization: init.headers.Authorization,
          xDate: init.headers["X-Date"],
        });
        if (url.includes("CVSync2AsyncSubmitTask")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ code: 10000, message: "Success", data: { task_id: "task-1" } }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ code: 10000, message: "Success", data: { status: "done", image_urls: ["https://cdn.example.com/volc.jpeg"] } }),
        };
      },
    );

    const result = await generator!(imageRequest());

    expect(result).toEqual({
      url: "https://cdn.example.com/volc.jpeg",
      provider: "volcengine-visual",
      model: "high_aes_general_v30l_zt2i",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      url: "https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31",
      body: expect.objectContaining({
        req_key: "high_aes_general_v30l_zt2i",
        width: 1664,
        height: 936,
      }),
    });
    expect(calls[1]).toMatchObject({
      url: "https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31",
      body: expect.objectContaining({
        req_key: "high_aes_general_v30l_zt2i",
        task_id: "task-1",
      }),
    });
    expect(calls[0].authorization).toContain("HMAC-SHA256 Credential=volc-ak/");
    expect(calls[0].xDate).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("stores Gemini native inline image data and returns an API asset URL", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-gemini-image-"));
    const calls: Array<{ url: string; body: unknown; apiKey?: string }> = [];
    const generator = createImageGenerationFactory(
      {
        provider: "gemini-native",
        model: "gemini-3.1-flash-image",
        apiKey: "image-key",
        baseURL: "https://image.example.com/google/",
        runDir,
        publicBaseUrl: "/api/low-code/design-agent/assets/test-run",
      },
      {},
      async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body), apiKey: init.headers["x-goog-api-key"] });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("png-data").toString("base64") } }] } }],
          }),
        };
      },
    );

    const result = await generator!(imageRequest());

    expect(calls).toEqual([expect.objectContaining({
      url: "https://image.example.com/google/v1beta/models/gemini-3.1-flash-image:generateContent",
      apiKey: "image-key",
      body: expect.objectContaining({ generationConfig: expect.objectContaining({ responseModalities: ["TEXT", "IMAGE"] }) }),
    })]);
    expect(result).toMatchObject({
      url: "/api/low-code/design-agent/assets/test-run/hero_visual.png",
      provider: "gemini-native",
      model: "gemini-3.1-flash-image",
    });
    await expect(readFile(join(runDir, "images", "hero_visual.png"), "utf8")).resolves.toBe("png-data");
  });
});

function imageRequest() {
  return {
    assetId: "hero_visual",
    slotId: "hero_slot",
    elementId: "hero_image",
    targetElementId: "hero_image",
    kind: "content_image" as const,
    role: "hero" as const,
    priority: "required" as const,
    purpose: "Show the product",
    prompt: "Generate a product hero",
    width: 1200,
    height: 675,
    aspectRatio: "wide" as const,
  };
}
