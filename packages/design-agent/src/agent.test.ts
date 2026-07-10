import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runDesignAgent } from "./agent.js";

describe("runDesignAgent", () => {
  it("runs the graph with a user message and persists artifacts", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-api-"));

    const result = await runDesignAgent({
      threadId: "thread_api_1",
      runDir,
      message: "做一个物料编排看板",
    });

    expect(result.runDir).toBe(runDir);
    expect(result.state.threadId).toBe("thread_api_1");
    expect(result.state.messages).toEqual([
      expect.objectContaining({ role: "user", content: "做一个物料编排看板" }),
    ]);
    expect(result.state.latestArtifactRefs.intent_recognition).toBeDefined();
    expect(result.manifest.threadId).toBe("thread_api_1");
    expect(result.manifest.artifacts.intent_recognition).toBeDefined();
  });
});
