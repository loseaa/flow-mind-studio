import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");
const corepackHome = process.env.COREPACK_HOME ?? path.join(rootDir, ".corepack");
const isWindows = process.platform === "win32";

const services = [
  {
    name: "api",
    args: ["pnpm", "--filter", "@flowmind/api", "dev"]
  },
  {
    name: "web",
    args: ["pnpm", "--filter", "@flowmind/web", "dev"]
  }
];

const children = new Map();
let shuttingDown = false;

function prefixLines(name, stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`[${name}] ${line}`);
      }
    }
  });
}

function startService(service) {
  const command = isWindows ? "cmd.exe" : "corepack";
  const args = isWindows ? ["/d", "/s", "/c", `corepack ${service.args.join(" ")}`] : service.args;
  const child = spawn(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      COREPACK_HOME: corepackHome
    },
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
    windowsHide: false
  });

  children.set(service.name, child);
  prefixLines(service.name, child.stdout);
  prefixLines(service.name, child.stderr);

  child.on("exit", (code, signal) => {
    children.delete(service.name);
    if (!shuttingDown) {
      console.log(`[dev] ${service.name} exited with ${signal ?? code}. Stopping the other service...`);
      void stopAll(code ?? 1);
    }
  });
}

function killProcessTree(pid) {
  if (!pid) return Promise.resolve();
  return new Promise((resolve) => {
    if (isWindows) {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process is already gone.
      }
    }
    resolve();
  });
}

async function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[dev] Stopping API and Web...");
  await Promise.all([...children.values()].map((child) => killProcessTree(child.pid)));
  process.exit(exitCode);
}

process.on("SIGINT", () => void stopAll(0));
process.on("SIGTERM", () => void stopAll(0));
process.on("uncaughtException", async (error) => {
  console.error(error);
  await stopAll(1);
});

console.log("[dev] Starting API on 4000 and Web on 5173. Press Ctrl+C to stop both.");
for (const service of services) {
  startService(service);
}
