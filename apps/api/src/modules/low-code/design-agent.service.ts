import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { DesignDocument } from "@flowmind/shared";

type AgentCommand = "run" | "resume";


export type DesignAgentProgressEvent = {
  kind: "node" | "log" | "error";
  message: string;
  raw: string;
  node?: string;
  label?: string;
};
type AgentCommandRunner = (args: string[], cwd: string, onProgress?: (event: DesignAgentProgressEvent) => void) => Promise<{ stdout: string; stderr: string }>;

type ArtifactRef = {
  node: string;
  path: string;
  version: number;
  checksum: string;
};

type RunManifest = {
  threadId: string;
  status: "running" | "needs_input" | "completed" | "failed";
  currentNode: string;
  completedNodes: string[];
  artifacts: Record<string, ArtifactRef & { createdAt: string; dependsOn: string[] }>;
};

type NodeArtifact<TOutput = unknown> = {
  threadId: string;
  node: string;
  version: number;
  status: "success" | "needs_input" | "failed";
  inputRefs: ArtifactRef[];
  output: TOutput;
  errors: string[];
  createdAt: string;
};

type ClarificationQuestion = {
  id: string;
  dimensionKey: string;
  question: string;
  options?: string[];
  expectedAnswerShape: "single_choice" | "multi_choice" | "free_text";
};

type ClarificationOutput = {
  plan?: {
    reason: string;
    questions: ClarificationQuestion[];
  };
  pendingQuestionIds?: string[];
};

type FinalOutput = {
  document?: DesignDocument;
};

type ImagePlanningOutput = {
  visualAssetPlan?: {
    imagePolicy: "required" | "none";
    visualMode: "standard" | "rich" | "none";
    minimumGeneratedAssets: 0 | 3;
    assets: Array<{ id: string }>;
  };
};

type ImageGenerationOutput = {
  images?: Array<{
    assetId: string;
    elementId: string;
    targetElementId: string;
    kind: "content_image" | "background_image";
    role: "hero" | "section" | "thumbnail" | "illustration";
    priority: "required" | "recommended" | "optional";
    width: number;
    height: number;
    attempts: number;
    status: "generated" | "failed";
    url?: string;
    error?: string;
  }>;
  generatedCount?: number;
  minimumGeneratedAssets?: 0 | 3;
  imagePolicy?: "required" | "none";
};

export type DesignAgentMessageRequest = {
  runId?: string;
  message?: string;
  answer?: string;
};

export type DesignAgentMessageResponse = {
  runId: string;
  runDir: string;
  status: RunManifest["status"];
  currentNode: string;
  completedNodes: string[];
  clarification?: ClarificationOutput["plan"];
  document?: DesignDocument;
  imagePlanning?: {
    plannedCount: number;
    imagePolicy: "required" | "none";
    visualMode: "standard" | "rich" | "none";
    minimumGeneratedAssets: 0 | 3;
  };
  imageGeneration?: ImageGenerationOutput["images"];
  imageGenerationSummary?: {
    plannedCount: number;
    generatedCount: number;
    minimumGeneratedAssets: 0 | 3;
    imagePolicy: "required" | "none";
  };
  artifacts: Array<{ node: string; version: number; path: string }>;
  stdout?: string;
  stderr?: string;
};

@Injectable()
export class DesignAgentService {
  private readonly workspaceRoot = findWorkspaceRoot(process.cwd());
  private readonly designAgentRoot = join(this.workspaceRoot, "packages", "design-agent");
  private readonly runsRoot = join(this.designAgentRoot, "artifacts", "runs");
  private commandRunner: AgentCommandRunner = runAgentCli;

  resolveGeneratedAssetPath(runId: string, fileName: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error("Invalid run id.");
    const extension = fileName.toLowerCase().split(".").at(-1);
    if (basename(fileName) !== fileName || !/^[a-zA-Z0-9_.-]+$/.test(fileName) || !extension || !["png", "jpg", "jpeg", "webp"].includes(extension)) {
      throw new Error("Invalid asset file.");
    }
    return join(this.runsRoot, runId, "images", fileName);
  }
  setCommandRunnerForTest(commandRunner: AgentCommandRunner) {
    this.commandRunner = commandRunner;
  }

  async sendMessage(input: DesignAgentMessageRequest): Promise<DesignAgentMessageResponse> {
    return this.sendMessageStreaming(input);
  }

  async sendMessageStreaming(
    input: DesignAgentMessageRequest,
    onProgress?: (event: DesignAgentProgressEvent) => void,
    onRunStarted?: (event: { runId: string; runDir: string; command: AgentCommand }) => void
  ): Promise<DesignAgentMessageResponse> {
    const message = (input.answer ?? input.message ?? "").trim();
    if (!message) throw new Error("Message cannot be empty.");

    const runId = input.runId ? sanitizeRunId(input.runId) : `web-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const runDir = join(this.runsRoot, runId);
    await mkdir(runDir, { recursive: true });

    const command: AgentCommand = input.runId ? "resume" : "run";
    const args = buildAgentArgs({ command, message, runDir });
    onRunStarted?.({ runId, runDir, command });
    const execution = await this.commandRunner(args, this.designAgentRoot, onProgress);
    const manifest = await readJson<RunManifest>(join(runDir, "manifest.json"));
    const clarification = await readArtifactOutput<ClarificationOutput>(manifest.artifacts.clarification);
    const finalOutput = await readArtifactOutput<FinalOutput>(manifest.artifacts.final_output);
    const imagePlanning = await readArtifactOutput<ImagePlanningOutput>(manifest.artifacts.image_planning);
    const imageGeneration = await readArtifactOutput<ImageGenerationOutput>(manifest.artifacts.image_generation);

    return {
      runId,
      runDir,
      status: manifest.status,
      currentNode: manifest.currentNode,
      completedNodes: manifest.completedNodes,
      clarification: clarification?.plan,
      document: finalOutput?.document,
      imagePlanning: imagePlanning?.visualAssetPlan ? {
        plannedCount: imagePlanning.visualAssetPlan.assets.length,
        imagePolicy: imagePlanning.visualAssetPlan.imagePolicy,
        visualMode: imagePlanning.visualAssetPlan.visualMode,
        minimumGeneratedAssets: imagePlanning.visualAssetPlan.minimumGeneratedAssets,
      } : undefined,
      imageGeneration: imageGeneration?.images,
      imageGenerationSummary: imageGeneration ? {
        plannedCount: imagePlanning?.visualAssetPlan?.assets.length ?? imageGeneration.images?.length ?? 0,
        generatedCount: imageGeneration.generatedCount ?? 0,
        minimumGeneratedAssets: imageGeneration.minimumGeneratedAssets ?? 0,
        imagePolicy: imageGeneration.imagePolicy ?? "none",
      } : undefined,
      artifacts: Object.entries(manifest.artifacts).map(([node, artifact]) => ({ node, version: artifact.version, path: artifact.path })),
      stdout: execution.stdout.trim() || undefined,
      stderr: execution.stderr.trim() || undefined,
    };
  }
}

function buildAgentArgs(input: { command: AgentCommand; message: string; runDir: string }) {
  if (input.command === "run") {
    return ["--no-warnings", "--loader", "ts-node/esm", "src/cli.ts", "run", "--message", input.message, "--out", input.runDir, "--no-interactive"];
  }
  return ["--no-warnings", "--loader", "ts-node/esm", "src/cli.ts", "resume", "--answer", input.message, "--run", input.runDir, "--no-interactive"];
}

async function runAgentCli(args: string[], cwd: string, onProgress?: (event: DesignAgentProgressEvent) => void) {
  const workspaceRoot = findWorkspaceRoot(cwd);
  return new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        COREPACK_HOME: process.env.COREPACK_HOME ?? join(workspaceRoot, ".corepack"),
        INIT_CWD: workspaceRoot
      },
      windowsHide: true
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutLines = createLineCollector((line) => {
      const event = parseAgentProgressLine(line);
      if (event) onProgress?.(event);
    });
    const stderrLines = createLineCollector((line) => {
      if (line.trim()) onProgress?.({ kind: "error", message: line.trim(), raw: line });
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      stdoutLines.push(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrLines.push(chunk.toString("utf8"));
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      stdoutLines.flush();
      stderrLines.flush();
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code && code !== 0) {
        reject(new Error(`Design agent failed with exit code ${code}.\n${stderr}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function createLineCollector(onLine: (line: string) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(onLine);
    },
    flush() {
      if (buffer) onLine(buffer);
      buffer = "";
    }
  };
}

function parseAgentProgressLine(line: string): DesignAgentProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const stepMatch = /^Step:\s*([^\s]+)\s*-\s*(.+)$/.exec(trimmed);
  if (stepMatch) {
    return { kind: "node", node: stepMatch[1], label: stepMatch[2], message: stepMatch[2], raw: line };
  }
  if (trimmed.startsWith("FlowMind Design Agent") || trimmed.startsWith("Run directory:") || trimmed.startsWith("LLM:")) {
    return { kind: "log", message: trimmed, raw: line };
  }
  if (trimmed === "Clarification required" || trimmed.startsWith("Reason:") || trimmed.startsWith("Resume:")) {
    return { kind: "log", message: trimmed, raw: line };
  }
  return null;
}

async function readArtifactOutput<TOutput>(ref: ArtifactRef | undefined): Promise<TOutput | undefined> {
  if (!ref) return undefined;
  const artifact = await readJson<NodeArtifact<TOutput>>(ref.path);
  return artifact.output;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function sanitizeRunId(value: string) {
  const safe = basename(value).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid runId.");
  return safe;
}

function findWorkspaceRoot(start: string) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}
