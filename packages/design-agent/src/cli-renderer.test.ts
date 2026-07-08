import { describe, expect, it } from "vitest";

import { createCliRenderer } from "./cli-renderer.js";
import type { RunManifest } from "./artifacts/store.js";
import type { DesignAgentState } from "./state.js";

function manifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    threadId: "thread_1",
    status: "completed",
    currentNode: "final_output",
    completedNodes: ["intent_recognition", "final_output"],
    artifacts: {
      final_output: {
        node: "final_output",
        path: "E:\\FlowMindStudio\\packages\\design-agent\\artifacts\\runs\\thread_1\\final_output.v1.json",
        version: 1,
        checksum: "abc",
        createdAt: "2026-06-22T00:00:00.000Z",
        dependsOn: [],
      },
    },
    ...overrides,
  };
}

function state(overrides: Partial<DesignAgentState> = {}): DesignAgentState {
  return {
    threadId: "thread_1",
    currentNode: "final_output",
    stage: "completed",
    messages: [],
    dimensions: [],
    latestArtifactRefs: {},
    pendingQuestionIds: [],
    validationErrors: [],
    repairAttempts: 0,
    events: [],
    ...overrides,
  };
}

describe("CliRenderer", () => {

  it("labels the image planning stage in Chinese", () => {
    const output: string[] = [];
    const renderer = createCliRenderer({ write: (line) => output.push(line), color: false });

    renderer.writeStep("image_planning");

    expect(output).toEqual(["Step: image_planning - 图片规划"]);
  });
  it("prints compact completed output with final artifact and inspect command", () => {
    const output: string[] = [];
    const renderer = createCliRenderer({ write: (line) => output.push(line), color: false });

    renderer.writeResult(state(), manifest(), "artifacts/runs/thread_1");

    const text = output.join("\n");
    expect(text).toContain("Stage: completed");
    expect(text).toContain("final_output.v1.json");
    expect(text).toContain("inspect --run artifacts/runs/thread_1 --node final_output");
    expect(text).not.toContain("Artifacts:");
    expect(text).not.toContain("Flow:");
  });

  it("prints a compact interactive clarification intro without listing every question", () => {
    const output: string[] = [];
    const renderer = createCliRenderer({ write: (line) => output.push(line), color: false });

    renderer.writeClarification(
      {
        reason: "Need target buyer",
        questions: [
          {
            id: "q1",
            dimensionKey: "page_context",
            question: "Who is this ecommerce page for?",
            options: ["consumer", "merchant"],
            expectedAnswerShape: "single_choice",
          },
        ],
      },
      "artifacts/runs/thread_1",
      true,
    );

    const text = output.join("\n");
    expect(text).toContain("Clarification required");
    expect(text).toContain("1 question will be asked one by one");
    expect(text).not.toContain("Who is this ecommerce page for?");
    expect(text).not.toContain("consumer");
  });

  it("prints clarification questions with options and resume command in non-interactive mode", () => {
    const output: string[] = [];
    const renderer = createCliRenderer({ write: (line) => output.push(line), color: false });

    renderer.writeClarification(
      {
        reason: "Need target buyer",
        questions: [
          {
            id: "q1",
            dimensionKey: "page_context",
            question: "Who is this ecommerce page for?",
            options: ["consumer", "merchant"],
            expectedAnswerShape: "single_choice",
          },
        ],
      },
      "artifacts/runs/thread_1",
      false,
    );

    const text = output.join("\n");
    expect(text).toContain("Clarification required");
    expect(text).toContain("Who is this ecommerce page for?");
    expect(text).toContain("1. consumer");
    expect(text).toContain("resume --run artifacts/runs/thread_1 --answer");
  });

  it("prints failed output with failed node and inspect command", () => {
    const output: string[] = [];
    const renderer = createCliRenderer({ write: (line) => output.push(line), color: false });

    renderer.writeResult(
      state({ stage: "failed", currentNode: "schema_validation" }),
      manifest({ status: "failed", currentNode: "schema_validation" }),
      "artifacts/runs/thread_1",
    );

    const text = output.join("\n");
    expect(text).toContain("Stage: failed");
    expect(text).toContain("Failed node: schema_validation");
    expect(text).toContain("inspect --run artifacts/runs/thread_1 --node schema_validation");
  });

  it("prints a compact persisted planning failure", () => {
    const output: string[] = [];
    const renderer = createCliRenderer({ write: (line) => output.push(line), color: false });
    const failedManifest = manifest({
      status: "failed",
      currentNode: "json_planning",
      artifacts: {
        json_planning: {
          node: "json_planning",
          path: "artifacts/runs/thread_1/json_planning.v1.json",
          version: 1,
          checksum: "failed",
          createdAt: "2026-06-28T00:00:00.000Z",
          dependsOn: [],
        },
      },
    });

    renderer.writeFailure(failedManifest, "artifacts/runs/thread_1", new Error("large schema error\nsecond line"));

    const text = output.join("\n");
    expect(text).toContain("Run failed");
    expect(text).toContain("Failed node: json_planning");
    expect(text).toContain("json_planning.v1.json");
    expect(text).toContain("inspect --run artifacts/runs/thread_1 --node json_planning");
    expect(text).not.toContain("second line");
  });});