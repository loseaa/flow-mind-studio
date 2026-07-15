import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { intentRecognitionNode } from "./node.js";
import { intentRecognitionOutputSchema } from "./schema.js";

describe("intentRecognitionNode", () => {
  it("uses structured output to update intent dimensions", async () => {
    const calls: unknown[] = [];
    const inputs: unknown[] = [];
    const createStructuredOutput = (schema: unknown) => {
      calls.push(schema);
      return {
        async invoke(input: unknown) {
          inputs.push(input);
          return {
            updates: [
              {
                key: "page_context",
                status: "partial",
                completeness: 0.6,
                confidence: 0.8,
                value: { pageType: "客户管理列表页", audience: "后台运营" },
                evidence: ["客户管理列表页"],
                missingFields: ["业务目标"],
                assumptions: [],
              },
            ],
          };
        },
      };
    };
    const state = {
      ...createInitialState("thread-intent"),
      messages: [{ role: "user" as const, content: "做一个后台运营用的客户管理列表页", createdAt: "2026-06-20T00:00:00.000Z" }],
    };

    const result = await intentRecognitionNode(state, { createStructuredOutput });

    expect(calls).toEqual([intentRecognitionOutputSchema]);
    expect(typeof inputs[0]).toBe("string");
    expect(inputs[0]).toContain("intent_recognition node");
    expect(inputs[0]).toContain("做一个后台运营用的客户管理列表页");
    expect(result.stage).toBe("intent_recognition");
    expect(result.dimensions?.find((dimension) => dimension.key === "page_context")).toMatchObject({
      status: "partial",
      completeness: 0.6,
      confidence: 0.8,
      value: { pageType: "客户管理列表页", audience: "后台运营" },
      evidence: ["客户管理列表页"],
      missingFields: ["业务目标"],
    });
  });

  it("writes an intent recognition artifact", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-intent-"));
    const store = createArtifactStore({ runDir, threadId: "thread-intent-artifact" });
    const state = {
      ...createInitialState("thread-intent-artifact"),
      messages: [{ role: "user" as const, content: "客户管理列表页", createdAt: "2026-06-20T00:00:00.000Z" }],
    };

    const result = await intentRecognitionNode(state, { artifactStore: store });

    const artifactRef = result.latestArtifactRefs?.intent_recognition;
    expect(artifactRef).toBeDefined();
    await expect(store.readArtifact(artifactRef!)).resolves.toMatchObject({
      node: "intent_recognition",
      status: "success",
    });
  });

  it("extracts complete Chinese clarification answers when structured output fails", async () => {
    const state = {
      ...createInitialState("thread-intent-rules"),
      messages: [{
        role: "user" as const,
        content: "业务目标：促进 iPhone 15 Pro Max 销售转化。页面类型：新手机产品营销落地页。目标用户：普通消费者。核心区块：首屏英雄图、核心卖点、影像能力、价格和立即购买按钮。核心字段：产品名、宣传语、起售价、卖点、购买按钮。交互：点击立即购买跳转购买页。视觉要求：高端、简洁、科技感，需要生成真实产品风格图片。",
        createdAt: "2026-06-20T00:00:00.000Z",
      }],
    };
    const createStructuredOutput = () => ({
      async invoke() {
        throw new Error("Connection error.");
      },
    });

    const result = await intentRecognitionNode(state, { createStructuredOutput });

    expect(result.dimensions?.map((dimension) => [dimension.key, dimension.status])).toEqual([
      ["page_context", "complete"],
      ["content_structure", "complete"],
      ["data_requirements", "complete"],
      ["interaction_flow", "complete"],
      ["presentation_rules", "complete"],
    ]);
    expect(result.dimensions?.find((dimension) => dimension.key === "content_structure")?.value).toMatchObject({
      sections: expect.arrayContaining(["首屏英雄图", "核心卖点"]),
    });
    expect(result.dimensions?.find((dimension) => dimension.key === "data_requirements")?.value).toMatchObject({
      fields: expect.arrayContaining(["产品名", "宣传语"]),
    });
  });
});
