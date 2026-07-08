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
});