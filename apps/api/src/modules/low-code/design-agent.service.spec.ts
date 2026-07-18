import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

  it("returns the latest renderable run document for lowcode preview", async () => {
    const service = new DesignAgentService();
    const runRoot = await mkdtemp(join(tmpdir(), "flowmind-design-agent-api-preview-"));
    Reflect.set(service, "runsRoot", runRoot);
    const olderRunDir = join(runRoot, "web-spec-latest-preview-old");
    const newerRunDir = join(runRoot, "web-spec-latest-preview-new");
    const failedRunDir = join(runRoot, "web-spec-latest-preview-failed");

    try {
      await mkdir(olderRunDir, { recursive: true });
      await mkdir(newerRunDir, { recursive: true });
      await mkdir(failedRunDir, { recursive: true });

      const olderFinalPath = join(olderRunDir, "final_output.v1.json");
      const newerFinalPath = join(newerRunDir, "final_output.v1.json");
      const failedSchemaPath = join(failedRunDir, "schema_validation.v1.json");

      await writeJson(olderFinalPath, artifact("final_output", {
        document: {
          ...fixtureDocument("Older preview"),
        },
      }));
      await writeJson(newerFinalPath, artifact("final_output", {
        document: {
          ...fixtureDocument("Newest preview"),
        },
      }));
      await writeJson(failedSchemaPath, artifact("schema_validation", {
        document: {
          ...fixtureDocument("Latest failed preview"),
        },
      }));

      await writeJson(join(olderRunDir, "manifest.json"), {
        threadId: "older-thread",
        status: "completed",
        currentNode: "completed",
        completedNodes: ["final_output"],
        artifacts: {
          final_output: ref("final_output", olderFinalPath, "2026-07-11T10:00:00.000Z"),
        },
      });
      await writeJson(join(newerRunDir, "manifest.json"), {
        threadId: "newer-thread",
        status: "completed",
        currentNode: "completed",
        completedNodes: ["final_output"],
        artifacts: {
          final_output: ref("final_output", newerFinalPath, "2026-07-11T11:00:00.000Z"),
        },
      });
      await writeJson(join(failedRunDir, "manifest.json"), {
        threadId: "failed-thread",
        status: "failed",
        currentNode: "quality_failure",
        completedNodes: ["schema_validation", "visual_review"],
        artifacts: {
          schema_validation: ref("schema_validation", failedSchemaPath, "2026-07-11T12:00:00.000Z"),
        },
      });

      const result = await service.latestResult();

      expect(result).toMatchObject({
        runId: "web-spec-latest-preview-failed",
        status: "failed",
        sourceNode: "schema_validation",
        document: {
          name: "Latest failed preview",
        },
      });
    } finally {
      await rm(runRoot, { recursive: true, force: true });
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

function ref(node: string, path: string, createdAt = "2026-07-01T00:00:00.000Z") {
  return {
    node,
    path,
    version: 1,
    checksum: "fixture",
    createdAt,
    dependsOn: [],
  };
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value), "utf8");
}

function fixtureDocument(name: string) {
  return {
    schemaVersion: "fm-design/v1",
    id: "doc_fixture",
    name,
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "root", children: [] },
    elements: [{
      id: "root",
      name,
      type: "page",
      props: {},
      layout: { display: "flex", direction: "vertical", width: "fill" },
      style: {
        base: {
          backgroundColor: "canvas",
          radius: "none",
          border: { width: "none", style: "none", color: "border" },
          text: {
            color: "textPrimary",
            fontFamily: "sans",
            fontSize: "md",
            fontWeight: "regular",
            lineHeight: "normal",
            align: "left",
          },
        },
        container: { shadow: "none", overflow: "visible", surface: "flat" },
      },
    }],
    variables: {},
  };
}
