import { describe, expect, it, vi } from "vitest";
import { parseSseEvent, streamChatMessage } from "./api";

describe("chat stream API", () => {
  it("parses SSE events from the chat stream", () => {
    expect(parseSseEvent('event: chat.token\ndata: {"type":"chat.token","payload":{"token":"你"}}\n\n')).toEqual({
      type: "chat.token",
      payload: { token: "你" }
    });
    expect(
      parseSseEvent(
        'event: chat.part\ndata: {"type":"chat.part","payload":{"part":{"id":"part_1","type":"card","props":{"title":"风险提示","tone":"warning","meta":[]}}}}\n\n'
      )
    ).toEqual({
      type: "chat.part",
      payload: {
        part: {
          id: "part_1",
          type: "card",
          props: { title: "风险提示", tone: "warning", meta: [] }
        }
      }
    });
  });

  it("reads streamed chat events from fetch", async () => {
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('event: message.created\ndata: {"type":"message.created","payload":{"message":{"id":"msg_1","conversationId":"conv_1","role":"user","content":"你好","citations":[],"createdAt":"2026-05-21T00:00:00.000Z"}}}\n\n'));
        controller.enqueue(encoder.encode('event: chat.token\ndata: {"type":"chat.token","payload":{"token":"你好"}}\n\n'));
        controller.close();
      }
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status: 200 }));
    const events: string[] = [];

    await streamChatMessage("conv_1", "你好", (event) => events.push(event.type));

    expect(events).toEqual(["message.created", "chat.token"]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/chat/conversations/conv_1/messages/stream"), expect.objectContaining({ method: "POST" }));
  });
});
