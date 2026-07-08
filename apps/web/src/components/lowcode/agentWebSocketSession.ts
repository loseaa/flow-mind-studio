import type { DesignDocument } from "@flowmind/shared";

export type AgentStatus = "running" | "needs_input" | "completed" | "failed";

export type ClarificationQuestion = {
  id: string;
  dimensionKey: string;
  question: string;
  options?: string[];
  expectedAnswerShape: "single_choice" | "multi_choice" | "free_text";
};

export type AgentImagePlanning = {
  plannedCount: number;
  imagePolicy: "required" | "none";
  visualMode: "standard" | "rich" | "none";
  minimumGeneratedAssets: 0 | 3;
};

export type AgentImageGenerationItem = {
  assetId: string;
  elementId: string;
  targetElementId: string;
  kind: "content_image" | "background_image";
  role: "hero" | "section" | "thumbnail" | "illustration";
  priority: "required" | "recommended" | "optional";
  status: "generated" | "failed";
  attempts: number;
  width: number;
  height: number;
  url?: string;
  error?: string;
};

export type AgentImageGenerationSummary = {
  plannedCount: number;
  generatedCount: number;
  minimumGeneratedAssets: 0 | 3;
  imagePolicy: "required" | "none";
};
export type AgentResponse = {
  runId: string;
  runDir: string;
  status: AgentStatus;
  currentNode: string;
  completedNodes: string[];
  clarification?: {
    reason: string;
    questions: ClarificationQuestion[];
  };
  document?: DesignDocument;
  imagePlanning?: AgentImagePlanning;
  imageGeneration?: AgentImageGenerationItem[];
  imageGenerationSummary?: AgentImageGenerationSummary;
  artifacts: Array<{ node: string; version: number; path: string }>;
};

export type AgentProgressEvent = {
  kind: "node" | "log" | "error";
  message: string;
  raw: string;
  node?: string;
  label?: string;
};

export type AgentRequest = { message?: string; answer?: string; runId?: string };

type AgentWsEvent =
  | { type: "agent.connected"; payload: { ok: true } }
  | { type: "agent.run_started"; payload: { runId: string; runDir: string; command: "run" | "resume" } }
  | { type: "agent.progress"; payload: AgentProgressEvent }
  | { type: "agent.result"; payload: AgentResponse }
  | { type: "agent.error"; payload: { message: string } };

type RequestCallbacks = {
  onProgress: (event: AgentProgressEvent) => void;
  onRunStarted: (runId: string) => void;
};

type PendingRequest = {
  callbacks: RequestCallbacks;
  payload: string;
  resolve: (response: AgentResponse) => void;
  reject: (error: Error) => void;
};

const CONNECTING = 0;
const OPEN = 1;

export class AgentWebSocketSession {
  private socket: WebSocket | undefined;
  private pending: PendingRequest | undefined;

  constructor(
    private readonly url: string,
    private readonly createSocket: (url: string) => WebSocket = (socketUrl) => new WebSocket(socketUrl),
  ) {}

  request(body: AgentRequest, callbacks: RequestCallbacks): Promise<AgentResponse> {
    if (this.pending) return Promise.reject(new Error("Design agent is already running for this connection."));

    return new Promise<AgentResponse>((resolve, reject) => {
      this.pending = {
        callbacks,
        payload: JSON.stringify({ type: "agent.message", payload: body }),
        resolve,
        reject,
      };

      const socket = this.ensureSocket();
      if (socket.readyState === OPEN) this.sendPending();
      else if (socket.readyState !== CONNECTING) this.failConnection("Agent WebSocket connection is unavailable.");
    });
  }

  close() {
    const socket = this.socket;
    this.socket = undefined;
    if (this.pending) {
      this.pending.reject(new Error("Agent WebSocket session closed."));
      this.pending = undefined;
    }
    socket?.close();
  }

  private ensureSocket() {
    if (this.socket && (this.socket.readyState === CONNECTING || this.socket.readyState === OPEN)) {
      return this.socket;
    }

    const socket = this.createSocket(this.url);
    this.socket = socket;
    socket.onopen = () => this.sendPending();
    socket.onmessage = (event) => this.handleMessage(String(event.data));
    socket.onerror = () => this.failConnection("Agent WebSocket connection failed.");
    socket.onclose = () => this.failConnection("Agent WebSocket connection closed before completion.");
    return socket;
  }

  private sendPending() {
    if (!this.pending || this.socket?.readyState !== OPEN) return;
    this.socket.send(this.pending.payload);
  }

  private handleMessage(raw: string) {
    let event: AgentWsEvent;
    try {
      event = JSON.parse(raw) as AgentWsEvent;
    } catch {
      this.rejectPending(new Error("Agent WebSocket returned invalid JSON."));
      return;
    }

    if (event.type === "agent.run_started") {
      this.pending?.callbacks.onRunStarted(event.payload.runId);
      return;
    }
    if (event.type === "agent.progress") {
      this.pending?.callbacks.onProgress(event.payload);
      return;
    }
    if (event.type === "agent.result") {
      const pending = this.pending;
      this.pending = undefined;
      pending?.resolve(event.payload);
      return;
    }
    if (event.type === "agent.error") this.rejectPending(new Error(event.payload.message));
  }

  private rejectPending(error: Error) {
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(error);
  }

  private failConnection(message: string) {
    this.socket = undefined;
    this.rejectPending(new Error(message));
  }
}
