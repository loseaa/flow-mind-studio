import { runDesignAgentCli } from "../src/cli.js";
import type { ImageGenerationRequest } from "../src/nodes/types.js";

const runDir = process.argv[2];
const startNode = process.argv[3] ?? "image_planning";
if (!runDir) throw new Error("Usage: continue-local <runDir> [startNode]");

await runDesignAgentCli(
  ["continue", "--run", runDir, "--node", startNode, "--no-interactive"],
  { write: (line) => console.log(line), isInteractive: false },
  {
    envFilePath: false,
    env: { DESIGN_AGENT_LLM_PROVIDER: "none" },
    createImageGeneration: createLocalImage,
  },
);

function createLocalImage(request: ImageGenerationRequest) {
  const background = request.kind === "background_image" ? "#172033" : "#eef3f8";
  const foreground = request.kind === "background_image" ? "#f8fafc" : "#172033";
  const accent = request.kind === "background_image" ? "#48a9ff" : "#2563eb";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${request.width}" height="${request.height}" viewBox="0 0 ${request.width} ${request.height}">`,
    `<rect width="100%" height="100%" fill="${background}"/>`,
    `<circle cx="18%" cy="35%" r="18%" fill="${accent}" opacity="0.22"/>`,
    `<rect x="12%" y="18%" width="76%" height="64%" rx="24" fill="none" stroke="${accent}" stroke-width="4" opacity="0.7"/>`,
    `<text x="50%" y="48%" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="${foreground}">Laptop Product Visual</text>`,
    `<text x="50%" y="57%" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="${foreground}" opacity="0.72">${request.assetId} / ${request.width}x${request.height}</text>`,
    "</svg>",
  ].join("");
  return {
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    provider: "local-placeholder",
    model: "deterministic-svg",
  };
}
