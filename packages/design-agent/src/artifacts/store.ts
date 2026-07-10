import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile as nodeWriteFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import type { ArtifactRef, NodeArtifact, NodeArtifactStatus } from "../state.js";

export type RunStatus = "running" | "needs_input" | "completed" | "failed";

export type ManifestArtifactEntry = ArtifactRef & {
  createdAt: string;
  dependsOn: string[];
};

export type RunManifest = {
  threadId: string;
  status: RunStatus;
  currentNode: string;
  completedNodes: string[];
  artifacts: Record<string, ManifestArtifactEntry>;
};

type JsonFileWriter = (path: string, data: string, encoding: BufferEncoding) => Promise<void>;

export type ArtifactStoreOptions = {
  runDir: string;
  threadId: string;
  writeFile?: JsonFileWriter;
};

export type WriteArtifactInput<TOutput> = {
  node: string;
  status: NodeArtifactStatus;
  runStatus?: RunStatus;
  inputRefs: ArtifactRef[];
  output: TOutput;
  errors: string[];
};

export type ArtifactStore = {
  runDir: string;
  threadId: string;
  writeArtifact<TOutput>(input: WriteArtifactInput<TOutput>): Promise<ArtifactRef>;
  readArtifact<TOutput>(ref: ArtifactRef): Promise<NodeArtifact<TOutput>>;
  readManifest(): Promise<RunManifest>;
};

const MANIFEST_FILE = "manifest.json";

export function createArtifactStore(options: ArtifactStoreOptions): ArtifactStore {
  const runDir = resolve(options.runDir);
  const writeFile = options.writeFile ?? nodeWriteFile;

  return {
    runDir,
    threadId: options.threadId,
    async writeArtifact<TOutput>(input: WriteArtifactInput<TOutput>) {
      await mkdir(runDir, { recursive: true });
      const manifest = await readManifestFile(runDir, options.threadId);
      const version = (manifest.artifacts[input.node]?.version ?? 0) + 1;
      const createdAt = new Date().toISOString();
      const fileName = `${sanitizeFilePart(input.node)}.v${version}.json`;
      const filePath = join(runDir, fileName);
      const artifact: NodeArtifact<TOutput> = {
        threadId: options.threadId,
        node: input.node,
        version,
        status: input.status,
        inputRefs: input.inputRefs,
        output: input.output,
        errors: input.errors,
        createdAt
      };

      await writeJson(filePath, artifact, writeFile);
      const checksum = await checksumFile(filePath);
      const ref: ArtifactRef = {
        node: input.node,
        path: filePath,
        version,
        checksum
      };

      manifest.status = input.runStatus ?? manifestStatusFromArtifactStatus(input.status);
      manifest.currentNode = input.node;
      manifest.completedNodes = appendUnique(manifest.completedNodes, input.node);
      manifest.artifacts[input.node] = {
        ...ref,
        createdAt,
        dependsOn: input.inputRefs.map((item) => item.path)
      };
      await writeJson(join(runDir, MANIFEST_FILE), manifest, writeFile);
      return ref;
    },
    async readArtifact<TOutput>(ref: ArtifactRef) {
      const raw = await readFile(ref.path, "utf8");
      const actualChecksum = hash(raw);
      if (actualChecksum !== ref.checksum) {
        throw new Error(`Artifact checksum mismatch for ${ref.path}.`);
      }
      return JSON.parse(raw) as NodeArtifact<TOutput>;
    },
    async readManifest() {
      return readManifestFile(runDir, options.threadId);
    }
  };
}

async function readManifestFile(runDir: string, threadId: string): Promise<RunManifest> {
  try {
    const raw = await readFile(join(runDir, MANIFEST_FILE), "utf8");
    return JSON.parse(raw) as RunManifest;
  } catch {
    return {
      threadId,
      status: "running",
      currentNode: "intent_recognition",
      completedNodes: [],
      artifacts: {}
    };
  }
}

async function writeJson(path: string, value: unknown, writeFile: JsonFileWriter) {
  await mkdir(dirname(path), { recursive: true });
  const data = `${JSON.stringify(value, null, 2)}\n`;
  await writeFileWithRetry(path, data, writeFile);
}

async function writeFileWithRetry(path: string, data: string, writeFile: JsonFileWriter) {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await writeFile(path, data, "utf8");
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetriableFileOpenError(error)) break;
      await delay(50 * attempt);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to write JSON file ${path}: ${detail}`);
}

function isRetriableFileOpenError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "UNKNOWN" || code === "EPERM" || code === "EBUSY";
}

async function checksumFile(path: string) {
  return hash(await readFile(path, "utf8"));
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

function manifestStatusFromArtifactStatus(status: NodeArtifactStatus): RunStatus {
  if (status === "needs_input") return "needs_input";
  if (status === "failed") return "failed";
  return "running";
}
