import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ports = [4000, 5173];
let failed = false;

async function findPidsByPort(port) {
  if (process.platform !== "win32") {
    const { stdout } = await execFileAsync("sh", ["-c", `lsof -ti tcp:${port} || true`]);
    return stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const { stdout } = await execFileAsync("netstat", ["-ano"]);
  const pids = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts.at(-1);
    if (pid && pid !== "0") pids.add(pid);
  }
  return [...pids];
}

async function killPid(pid) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", pid, "/T", "/F"]);
    } catch {
      await execFileAsync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`]);
    }
    return;
  }
  await execFileAsync("kill", ["-TERM", pid]);
}

const killed = new Set();
for (const port of ports) {
  const pids = await findPidsByPort(port);
  for (const pid of pids) {
    if (killed.has(pid)) continue;
    try {
      await killPid(pid);
      killed.add(pid);
      console.log(`Stopped process ${pid} on port ${port}.`);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to stop process ${pid} on port ${port}: ${message}`);
    }
  }
}

if (killed.size === 0 && !failed) {
  console.log("No FlowMindStudio dev processes were listening on 4000 or 5173.");
}

if (failed) {
  process.exitCode = 1;
}
