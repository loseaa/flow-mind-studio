import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ArtifactRef } from "../state.js";
import { createArtifactStore } from "./store.js";

describe("ArtifactStore", () => {
  it("writes an artifact and records it in the run manifest", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-"));
    const store = createArtifactStore({ runDir, threadId: "thread_1" });

    const ref = await store.writeArtifact({
      node: "intent_recognition",
      status: "success",
      inputRefs: [],
      output: { message: "ok" },
      errors: []
    });

    expect(ref).toMatchObject({
      node: "intent_recognition",
      version: 1
    });
    expect(ref.checksum).toHaveLength(64);

    const artifact = await store.readArtifact<{ message: string }>(ref);
    expect(artifact.output).toEqual({ message: "ok" });
    expect(artifact.threadId).toBe("thread_1");

    const manifest = await store.readManifest();
    expect(manifest.threadId).toBe("thread_1");
    expect(manifest.currentNode).toBe("intent_recognition");
    expect(manifest.completedNodes).toEqual(["intent_recognition"]);
    expect(manifest.artifacts.intent_recognition?.path).toBe(ref.path);
  });

  it("increments artifact versions per node", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-"));
    const store = createArtifactStore({ runDir, threadId: "thread_2" });

    const first = await store.writeArtifact({
      node: "content_planning",
      status: "success",
      inputRefs: [],
      output: { revision: 1 },
      errors: []
    });
    const second = await store.writeArtifact({
      node: "content_planning",
      status: "success",
      inputRefs: [first],
      output: { revision: 2 },
      errors: []
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.path).not.toBe(first.path);

    const manifest = await store.readManifest();
    expect(manifest.artifacts.content_planning?.version).toBe(2);
    expect(manifest.artifacts.content_planning?.dependsOn).toEqual([first.path]);
  });

  it("stores artifacts as stable formatted json", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-"));
    const store = createArtifactStore({ runDir, threadId: "thread_3" });

    const ref: ArtifactRef = await store.writeArtifact({
      node: "dimension_state_update",
      status: "success",
      inputRefs: [],
      output: { dimensions: [] },
      errors: []
    });

    const raw = await readFile(ref.path, "utf8");
    expect(raw).toContain('\n  "threadId": "thread_3"');
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("retries transient Windows open failures while writing artifacts", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-"));
    let attempts = 0;
    const store = createArtifactStore({
      runDir,
      threadId: "thread_retry",
      writeFile: async (path: string, data: string, encoding: BufferEncoding) => {
        attempts += 1;
        if (attempts === 1 && path.endsWith("clarification.v1.json")) {
          const error = new Error("UNKNOWN: unknown error, open") as NodeJS.ErrnoException;
          error.code = "UNKNOWN";
          throw error;
        }
        await import("node:fs/promises").then((fs) => fs.writeFile(path, data, encoding));
      },
    });

    const ref = await store.writeArtifact({
      node: "clarification",
      status: "needs_input",
      inputRefs: [],
      output: { plan: { questions: [] } },
      errors: [],
    });

    expect(attempts).toBeGreaterThan(1);
    expect(await readFile(ref.path, "utf8")).toContain('"node": "clarification"');
    await expect(store.readManifest()).resolves.toMatchObject({
      artifacts: { clarification: { path: ref.path, version: 1 } },
    });
  });
  it("allows terminal nodes to mark the run manifest as completed", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-"));
    const store = createArtifactStore({ runDir, threadId: "thread_4" });

    await store.writeArtifact({
      node: "final_output",
      status: "success",
      runStatus: "completed",
      inputRefs: [],
      output: { document: {} },
      errors: []
    });

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("completed");
    expect(manifest.currentNode).toBe("final_output");
  });
});
