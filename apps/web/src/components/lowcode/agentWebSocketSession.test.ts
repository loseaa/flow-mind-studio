import { describe, expect, it, vi } from "vitest";

import { AgentWebSocketSession, type AgentResponse } from "./agentWebSocketSession";

class FakeWebSocket {
  readyState = 0;
  sent: string[] = [];
  closeCount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.closeCount += 1;
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

describe("AgentWebSocketSession", () => {
  it("keeps one socket across clarification and resume messages", async () => {
    const sockets: FakeWebSocket[] = [];
    const onProgress = vi.fn();
    const onRunStarted = vi.fn();
    const session = new AgentWebSocketSession("ws://localhost/agent", () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });

    const firstResult = session.request(
      { message: "创建音乐播放器" },
      { onProgress, onRunStarted },
    );
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      type: "agent.message",
      payload: { message: "创建音乐播放器" },
    });

    sockets[0].receive({ type: "agent.run_started", payload: { runId: "run-1", runDir: "runs/run-1", command: "run" } });
    sockets[0].receive({
      type: "agent.result",
      payload: {
        runId: "run-1",
        runDir: "runs/run-1",
        status: "needs_input",
        currentNode: "clarification",
        completedNodes: [],
        clarification: { reason: "需要目标用户", questions: [] },
        artifacts: [],
      },
    });
    await expect(firstResult).resolves.toMatchObject({ status: "needs_input", runId: "run-1" });
    expect(sockets[0].closeCount).toBe(0);

    const secondResult = session.request(
      { runId: "run-1", answer: "普通听众" },
      { onProgress, onRunStarted },
    );
    expect(sockets).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[1])).toEqual({
      type: "agent.message",
      payload: { runId: "run-1", answer: "普通听众" },
    });
    const completedPayload: AgentResponse = {
      runId: "run-1",
      runDir: "runs/run-1",
      status: "completed",
      currentNode: "completed",
      completedNodes: ["image_planning", "image_generation"],
      imagePlanning: { plannedCount: 3, imagePolicy: "required", visualMode: "rich", minimumGeneratedAssets: 3 },
      imageGenerationSummary: { plannedCount: 3, generatedCount: 3, minimumGeneratedAssets: 3, imagePolicy: "required" },
      imageGeneration: [{
        assetId: "hero_background",
        elementId: "hero_section",
        targetElementId: "hero_section",
        kind: "background_image",
        role: "hero",
        priority: "required",
        status: "generated",
        attempts: 1,
        width: 1440,
        height: 720,
        url: "https://cdn.example.com/hero.png",
      }],
      artifacts: [],
    };
    sockets[0].receive({ type: "agent.result", payload: completedPayload });
    await expect(secondResult).resolves.toMatchObject({
      status: "completed",
      imagePlanning: { plannedCount: 3 },
      imageGenerationSummary: { generatedCount: 3 },
      imageGeneration: [expect.objectContaining({ kind: "background_image", attempts: 1 })],
    });
    expect(sockets[0].closeCount).toBe(0);

    session.close();
    expect(sockets[0].closeCount).toBe(1);
  });
});
