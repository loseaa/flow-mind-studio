import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DesignAgentService } from "./design-agent.service";

describe("DesignAgentService", () => {
  it("resolves generated image paths inside the run images directory", () => {
    const service = new DesignAgentService();

    expect(service.resolveGeneratedAssetPath("web-123", "hero.png")).toContain(
      join("packages", "design-agent", "artifacts", "runs", "web-123", "images", "hero.png"),
    );
    expect(() => service.resolveGeneratedAssetPath("../outside", "hero.png")).toThrow(/invalid run id/i);
    expect(() => service.resolveGeneratedAssetPath("web-123", "../secret.env")).toThrow(/invalid asset file/i);
  });
  it("projects image planning and generation metadata from artifacts", async () => {
    const service = new DesignAgentService();
    let runDir = "";
    service.setCommandRunnerForTest(async (args) => {
      const runIndex = args.indexOf("--run");
      runDir = args[runIndex + 1];
      await mkdir(runDir, { recursive: true });
      const imagePlanningPath = join(runDir, "image_planning.v1.json");
      const imageGenerationPath = join(runDir, "image_generation.v1.json");
      await writeJson(imagePlanningPath, artifact("image_planning", {
        visualAssetPlan: {
          imagePolicy: "required",
          visualMode: "rich",
          minimumGeneratedAssets: 3,
          assets: [{ id: "hero_background" }, { id: "feature_one" }, { id: "feature_two" }],
        },
      }));
      await writeJson(imageGenerationPath, artifact("image_generation", {
        images: [{
          assetId: "hero_background",
          elementId: "hero_section",
          targetElementId: "hero_section",
          kind: "background_image",
          role: "hero",
          priority: "required",
          purpose: "Hero background",
          width: 1440,
          height: 720,
          aspectRatio: "wide",
          prompt: "fixture",
          attempts: 1,
          status: "generated",
          url: "https://cdn.example.com/hero.png",
        }],
        generatedCount: 3,
        minimumGeneratedAssets: 3,
        imagePolicy: "required",
      }));
      await writeJson(join(runDir, "manifest.json"), {
        threadId: "api-image-projection",
        status: "completed",
        currentNode: "completed",
        completedNodes: ["image_planning", "image_generation"],
        artifacts: {
          image_planning: ref("image_planning", imagePlanningPath),
          image_generation: ref("image_generation", imageGenerationPath),
        },
      });
      return { stdout: "", stderr: "" };
    });

    try {
      const result = await service.sendMessage({ runId: "api-image-projection", answer: "continue" });

      expect(result.imagePlanning).toEqual({
        plannedCount: 3,
        imagePolicy: "required",
        visualMode: "rich",
        minimumGeneratedAssets: 3,
      });
      expect(result.imageGenerationSummary).toEqual({
        plannedCount: 3,
        generatedCount: 3,
        minimumGeneratedAssets: 3,
        imagePolicy: "required",
      });
      expect(result.imageGeneration?.[0]).toMatchObject({
        assetId: "hero_background",
        kind: "background_image",
        attempts: 1,
      });
    } finally {
      if (runDir) await rm(runDir, { recursive: true, force: true });
    }
  });
});

function artifact(node: string, output: unknown) {
  return {
    threadId: "api-image-projection",
    node,
    version: 1,
    status: "success",
    inputRefs: [],
    output,
    errors: [],
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}

function ref(node: string, path: string) {
  return {
    node,
    path,
    version: 1,
    checksum: "fixture",
    createdAt: "2026-07-01T00:00:00.000Z",
    dependsOn: [],
  };
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value), "utf8");
}
