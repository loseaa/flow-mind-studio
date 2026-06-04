import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 404 }));
  });

  it("renders the public landing page by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "FlowMindStudio" })).toBeInTheDocument();
    expect(screen.getByText(/面向 SaaS 团队的 AI 产品操作系统/)).toBeInTheDocument();
  });

  it("navigates from landing page to dashboard", async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("link", { name: /进入工作台/ })[0]);
    expect(await screen.findByRole("heading", { name: "总览" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/app/dashboard");
  });

  it("supports direct access to app feature routes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/chat/conversations/conv_1/messages")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/chat/conversations")) {
        return new Response(
          JSON.stringify([
            {
              id: "conv_1",
              organizationId: "org_1",
              title: "新对话",
              model: "deepseek-v4-flash",
              knowledgeBaseIds: [],
              createdAt: "2026-05-21T00:00:00.000Z",
              updatedAt: "2026-05-21T00:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    });
    window.history.pushState({}, "", "/app/chat");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "今天想探索什么？" })).toBeInTheDocument();
    expect(screen.getAllByText("聊天记录").length).toBeGreaterThan(0);
  });
});
