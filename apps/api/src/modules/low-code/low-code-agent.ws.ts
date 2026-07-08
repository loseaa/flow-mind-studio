import { createHash } from "node:crypto";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { DesignAgentMessageRequest, DesignAgentMessageResponse, DesignAgentProgressEvent, DesignAgentService } from "./design-agent.service";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const WS_PATH = "/api/low-code/agent/ws";

type LowCodeAgentClientEvent = {
  type: "agent.message";
  payload: DesignAgentMessageRequest;
};

type LowCodeAgentServerEvent =
  | { type: "agent.connected"; payload: { ok: true } }
  | { type: "agent.run_started"; payload: { runId: string; runDir: string; command: "run" | "resume" } }
  | { type: "agent.progress"; payload: DesignAgentProgressEvent }
  | { type: "agent.result"; payload: DesignAgentMessageResponse }
  | { type: "agent.error"; payload: { message: string } };

export function attachLowCodeAgentWebSocket(server: HttpServer, designAgentService: DesignAgentService) {
  server.on("upgrade", (request, socket) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== WS_PATH) return;

    const peer = acceptWebSocket(request, socket as Socket);
    if (!peer) return;
    let running = false;
    peer.send({ type: "agent.connected", payload: { ok: true } });

    peer.onMessage(async (raw) => {
      let event: LowCodeAgentClientEvent;
      try {
        event = JSON.parse(raw) as LowCodeAgentClientEvent;
      } catch {
        peer.send({ type: "agent.error", payload: { message: "Invalid websocket message JSON." } });
        return;
      }

      if (event.type !== "agent.message") {
        peer.send({ type: "agent.error", payload: { message: `Unsupported websocket event: ${event.type}` } });
        return;
      }
      if (running) {
        peer.send({ type: "agent.error", payload: { message: "Design agent is already running for this connection." } });
        return;
      }

      running = true;
      try {
        const result = await designAgentService.sendMessageStreaming(event.payload, (progress) => {
          peer.send({ type: "agent.progress", payload: progress });
        }, (started) => {
          peer.send({ type: "agent.run_started", payload: started });
        });
        peer.send({ type: "agent.result", payload: result });
      } catch (error) {
        peer.send({ type: "agent.error", payload: { message: error instanceof Error ? error.message : String(error) } });
      } finally {
        running = false;
      }
    });
  });
}

function acceptWebSocket(request: IncomingMessage, socket: Socket) {
  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return null;
  }

  const acceptKey = createHash("sha1").update(`${key}${WS_MAGIC}`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
    ""
  ].join("\r\n"));

  return new WebSocketPeer(socket);
}

class WebSocketPeer {
  private buffer = Buffer.alloc(0);
  private messageHandler: ((message: string) => void) | undefined;

  constructor(private readonly socket: Socket) {
    socket.on("data", (chunk) => this.handleData(chunk));
  }

  onMessage(handler: (message: string) => void) {
    this.messageHandler = handler;
  }

  send(event: LowCodeAgentServerEvent) {
    const payload = Buffer.from(JSON.stringify(event), "utf8");
    const header = createFrameHeader(payload.length);
    this.socket.write(Buffer.concat([header, payload]));
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const frame = readClientFrame(this.buffer);
      if (!frame) return;
      this.buffer = this.buffer.subarray(frame.frameLength);

      if (frame.opcode === 0x8) {
        this.socket.end();
        return;
      }
      if (frame.opcode === 0x9) {
        this.socket.write(Buffer.from([0x8a, 0x00]));
        continue;
      }
      if (frame.opcode !== 0x1) continue;
      this.messageHandler?.(frame.payload.toString("utf8"));
    }
  }
}

function readClientFrame(buffer: Buffer): { opcode: number; payload: Buffer; frameLength: number } | null {
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    if (high !== 0) throw new Error("WebSocket payload is too large.");
    payloadLength = low;
    offset += 8;
  }

  if (!masked) throw new Error("Client websocket frames must be masked.");
  if (buffer.length < offset + 4 + payloadLength) return null;

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];

  return { opcode, payload, frameLength: offset + payloadLength };
}

function createFrameHeader(payloadLength: number) {
  if (payloadLength < 126) return Buffer.from([0x81, payloadLength]);
  if (payloadLength <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
    return header;
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(payloadLength, 6);
  return header;
}