import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DesignBaseStyle, DesignDocument, DesignImageSlot } from "@flowmind/shared";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { compileVisualAssetPlan } from "../image-planning/compiler.js";
import type { VisualAssetPlan } from "../image-planning/schema.js";
import { buildImageGenerationRequest, imageGenerationNode } from "./node.js";
import type { ImageGenerationOutput } from "./schema.js";

describe("imageGenerationNode", () => {
  it("generates planned content and background assets from slot metadata", async () => {
    const { state, store } = await stateWithPlan("thread_image_generation_1");
    const requests: Array<{ assetId: string; kind: string; prompt: string; width: number; height: number }> = [];

    const result = await imageGenerationNode(state, {
      artifactStore: store,
      createImageGeneration(request) {
        requests.push(request);
        return {
          url: `https://cdn.example.com/generated/${request.assetId}.png`,
          provider: "test",
          model: "mock-image",
        };
      },
    });

    expect(requests).toHaveLength(3);
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: "hero_background", kind: "background_image", width: 1536, height: 864 }),
      expect.objectContaining({ assetId: "feature_visual", kind: "content_image", width: 1200, height: 800 }),
    ]));
    expect(requests.find(({ assetId }) => assetId === "feature_visual")?.prompt).toContain("Required pixel size: 1200x800px");
    expect(requests.find(({ assetId }) => assetId === "feature_visual")?.prompt).toContain("Show the primary product capability");

    const artifact = await readOutput(store, result);
    const feature = artifact.document.elements.find((element) => element.id === "feature_visual");
    const hero = artifact.document.elements.find((element) => element.id === "hero_section");
    const featureSlot = feature?.props.imageSlot as DesignImageSlot | undefined;
    const heroSlot = hero?.props.imageSlot as DesignImageSlot | undefined;
    expect(feature?.props.src).toBe("https://cdn.example.com/generated/feature_visual.png");
    expect(hero?.style.base.backgroundImage).toBe("https://cdn.example.com/generated/hero_background.png");
    expect(feature?.layout).toEqual({ width: "fill", height: "hug" });
    expect(featureSlot?.display.maxHeight).toBe(320);
    expect(heroSlot?.display.maxHeight).toBe(480);
    expect(artifact.generatedCount).toBe(3);
    expect(artifact.minimumGeneratedAssets).toBe(3);
  });


  it("derives request identity and dimensions from the slot instead of visual asset fields", () => {
    const state = createInitialState("thread_image_generation_request");
    const document = compileVisualAssetPlan(baseDocument(), requiredPlan());
    const asset = {
      ...requiredPlan().assets[1],
      kind: "background_image",
      role: "hero",
      width: 1,
      height: 1,
      aspectRatio: "portrait",
      foregroundTone: "dark",
    } as any;

    const request = buildImageGenerationRequest(state, document, asset);

    expect(request).toMatchObject({
      assetId: "feature_visual",
      slotId: "feature_slot",
      elementId: "feature_visual",
      kind: "content_image",
      role: "section",
      width: 1200,
      height: 800,
      aspectRatio: "wide",
    });
    expect(request.prompt).toContain("Required pixel size: 1200x800px");
    expect(request.prompt).toContain("Display slot: aspect=3:2, width=fill, maxHeight=320");
  });

  it("applies generated image metadata without changing tree, element count, layout, or slot display", async () => {
    const { state, store } = await stateWithPlan("thread_image_generation_layout_invariant");
    const assemblyArtifact = await store.readArtifact<any>(state.latestArtifactRefs.document_assembly);
    const before = assemblyArtifact.output.document as DesignDocument;
    const beforeTree = structuredClone(before.tree);
    const beforeElementsCount = before.elements.length;
    const beforeLayouts = new Map(before.elements.map((element) => [element.id, structuredClone(element.layout)]));
    const beforeSlotDisplays = new Map(
      before.elements
        .filter((element) => element.props.imageSlot)
        .map((element) => [element.id, structuredClone((element.props.imageSlot as DesignImageSlot).display)]),
    );

    const result = await imageGenerationNode(state, {
      artifactStore: store,
      createImageGeneration(request) {
        return { url: `https://cdn.example.com/generated/${request.assetId}.png` };
      },
    });

    const artifact = await readOutput(store, result);
    expect(artifact.document.tree).toEqual(beforeTree);
    expect(artifact.document.elements).toHaveLength(beforeElementsCount);
    for (const element of artifact.document.elements) {
      expect(element.layout).toEqual(beforeLayouts.get(element.id));
      if (element.props.imageSlot) {
        expect((element.props.imageSlot as DesignImageSlot).display).toEqual(beforeSlotDisplays.get(element.id));
      }
    }
    expect(artifact.document.elements.find((element) => element.id === "feature_visual")?.props).toMatchObject({
      src: "https://cdn.example.com/generated/feature_visual.png",
      generatedImageSize: "1200x800",
    });
  });
  it("limits independent image calls to two concurrent requests", async () => {
    const { state, store } = await stateWithPlan("thread_image_generation_concurrency", planWithOptional());
    let active = 0;
    let maximumActive = 0;

    await imageGenerationNode(state, {
      artifactStore: store,
      async createImageGeneration(request) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return { url: `https://cdn.example.com/${request.assetId}.png` };
      },
    });

    expect(maximumActive).toBe(2);
  });

  it("schedules required assets before optional assets", async () => {
    const plan = planWithOptional();
    plan.assets[0] = { ...plan.assets[0], priority: "optional" };
    plan.assets[3] = { ...plan.assets[3], priority: "required" };
    const { state, store } = await stateWithPlan("thread_image_generation_priority", plan);
    const started: string[] = [];

    await imageGenerationNode(state, {
      artifactStore: store,
      async createImageGeneration(request) {
        started.push(request.priority);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { url: `https://cdn.example.com/${request.assetId}.png` };
      },
    });

    expect(started.slice(0, 2)).toEqual(["required", "required"]);
    expect(started.at(-1)).toBe("optional");
  });

  it("retries a failed asset once and records the successful attempt count", async () => {
    const { state, store } = await stateWithPlan("thread_image_generation_retry");
    const attempts = new Map<string, number>();

    const result = await imageGenerationNode(state, {
      artifactStore: store,
      createImageGeneration(request) {
        const count = (attempts.get(request.assetId) ?? 0) + 1;
        attempts.set(request.assetId, count);
        if (request.assetId === "feature_visual" && count === 1) throw new Error("temporary provider error");
        return { url: `https://cdn.example.com/${request.assetId}.png` };
      },
    });

    const artifact = await readOutput(store, result);
    expect(attempts.get("feature_visual")).toBe(2);
    expect(artifact.images.find(({ assetId }) => assetId === "feature_visual")).toMatchObject({
      status: "generated",
      attempts: 2,
    });
  });

  it("tolerates an optional failure when three current-run assets succeed", async () => {
    const plan = planWithOptional();
    const { state, store } = await stateWithPlan("thread_image_generation_optional", plan);

    const result = await imageGenerationNode(state, {
      artifactStore: store,
      createImageGeneration(request) {
        if (request.priority === "optional") throw new Error("optional image failed");
        return { url: `https://cdn.example.com/${request.assetId}.png` };
      },
    });

    const artifact = await readOutput(store, result);
    expect(artifact.generatedCount).toBe(3);
    expect(artifact.images.find(({ priority }) => priority === "optional")).toMatchObject({
      status: "failed",
      attempts: 2,
    });
  });

  it("persists a failed artifact when fewer than three assets succeed", async () => {
    const { state, store } = await stateWithPlan("thread_image_generation_minimum");

    await expect(imageGenerationNode(state, {
      artifactStore: store,
      createImageGeneration(request) {
        if (request.assetId === "supporting_visual") throw new Error("provider rejected asset");
        return { url: `https://cdn.example.com/${request.assetId}.png` };
      },
    })).rejects.toThrow(/image_generation failed after retry/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    await expect(store.readArtifact<ImageGenerationOutput>(manifest.artifacts.image_generation)).resolves.toMatchObject({
      status: "failed",
      output: { generatedCount: 2, minimumGeneratedAssets: 3 },
    });
  });

  it("fails required-image pages when the image provider is unavailable", async () => {
    const { state, store } = await stateWithPlan("thread_image_generation_no_provider");

    await expect(imageGenerationNode(state, { artifactStore: store })).rejects.toThrow(/image provider is unavailable/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    expect(manifest.artifacts.image_generation).toBeDefined();
  });

  it("skips provider calls for an explicit no-image plan", async () => {
    const noImagePlan: VisualAssetPlan = {
      imagePolicy: "none",
      visualMode: "none",
      minimumGeneratedAssets: 0,
      assets: [],
      notes: ["Explicit no-image page."],
    };
    const { state, store } = await stateWithPlan("thread_image_generation_none", noImagePlan);
    const createImageGeneration = vi.fn(() => ({ url: "https://cdn.example.com/unexpected.png" }));

    const result = await imageGenerationNode(state, { artifactStore: store, createImageGeneration });

    expect(createImageGeneration).not.toHaveBeenCalled();
    await expect(readOutput(store, result)).resolves.toMatchObject({
      images: [],
      generatedCount: 0,
      minimumGeneratedAssets: 0,
      imagePolicy: "none",
    });
  });
});

async function stateWithPlan(threadId: string, plan = requiredPlan()) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-image-generation-"));
  const store = createArtifactStore({ runDir, threadId });
  const document = compileVisualAssetPlan(baseDocument(), plan);
  const assemblyRef = await store.writeArtifact({
    node: "document_assembly",
    status: "success",
    inputRefs: [],
    output: { document, sourcePlans: { imagePlanning: plan } },
    errors: [],
  });
  const state: DesignAgentState = {
    ...createInitialState(threadId),
    dimensions: createInitialState(threadId).dimensions.map((dimension) => ({
      ...dimension,
      status: "complete",
      completeness: 1,
      confidence: 1,
      value: { page: "commerce product page", key: dimension.key },
    })),
    latestArtifactRefs: { document_assembly: assemblyRef },
  };
  return { state, store };
}

async function readOutput(
  store: ReturnType<typeof createArtifactStore>,
  result: Partial<DesignAgentState>,
) {
  return (await store.readArtifact<ImageGenerationOutput>(result.latestArtifactRefs!.image_generation)).output;
}

function requiredPlan(): VisualAssetPlan {
  return {
    imagePolicy: "required",
    visualMode: "rich",
    minimumGeneratedAssets: 3,
    assets: [
      {
        id: "hero_background",
        slotId: "hero_slot",
        kind: "background_image",
        role: "hero",
        targetElementId: "hero_section",
        purpose: "Create visual depth behind the hero copy",
        promptBrief: "Low-contrast premium product background with safe text area",
        width: 640,
        height: 360,
        aspectRatio: "wide",
        priority: "required",
        foregroundTone: "light",
      },
      {
        id: "feature_visual",
        slotId: "feature_slot",
        kind: "content_image",
        role: "section",
        targetElementId: "feature_visual",
        purpose: "Show the primary product capability",
        promptBrief: "Detailed product capability scene",
        width: 640,
        height: 360,
        aspectRatio: "wide",
        priority: "required",
      },
      {
        id: "supporting_visual",
        slotId: "supporting_slot",
        kind: "content_image",
        role: "section",
        targetElementId: "supporting_visual",
        purpose: "Support the secondary product message",
        promptBrief: "Editorial supporting product illustration",
        width: 640,
        height: 360,
        aspectRatio: "wide",
        priority: "required",
      },
    ],
    notes: ["Use a rich image hierarchy."],
  };
}

function planWithOptional(): VisualAssetPlan {
  const plan = requiredPlan();
  return {
    ...plan,
    assets: [
      ...plan.assets,
      {
        id: "optional_thumbnail",
        slotId: "optional_slot",
        kind: "content_image",
        role: "thumbnail",
        targetElementId: "optional_thumbnail",
        purpose: "Add optional supporting detail",
        promptBrief: "Small supporting product detail",
        width: 640,
        height: 360,
        aspectRatio: "wide",
        priority: "optional",
      },
    ],
  };
}

function baseDocument(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: "image_generation_document",
    name: "Commerce product page",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: {
      id: "page_root",
      children: [{
        id: "hero_section",
        children: [
          { id: "hero_title", children: [] },
          { id: "feature_visual", children: [] },
          { id: "supporting_visual", children: [] },
          { id: "optional_thumbnail", children: [] },
        ],
      }],
    },
    elements: [
      container("page_root", "page"),
      {
        ...container("hero_section", "section"),
        props: { imageSlotId: "hero_slot", imageSlot: slot("hero_slot", "hero_section", "hero", "background", "16:9", 1536, 864, 480) },
      },
      {
        id: "hero_title",
        name: "Hero title",
        type: "text",
        props: { text: "A better product experience" },
        style: {
          base: baseStyle("transparent"),
          text: { role: "heading", decoration: "none", transform: "none" },
        },
      },
      image("feature_visual", slot("feature_slot", "hero_section", "section", "inline", "3:2", 1200, 800, 320)),
      image("supporting_visual", slot("supporting_slot", "hero_section", "gallery", "inline", "4:3", 1200, 900, 360)),
      image("optional_thumbnail", slot("optional_slot", "hero_section", "card", "inline", "1:1", 800, 800, 200)),
    ],
    variables: { designTheme: { theme: "commerce_editorial", tone: "premium" } },
  };
}

function image(id: string, imageSlot: DesignImageSlot) {
  return {
    id,
    name: id,
    type: "image" as const,
    layout: { width: "fill" as const, height: "hug" as const },
    props: { imageSlotId: imageSlot.id, imageSlot, alt: id },
    style: { base: baseStyle("muted"), image: { aspectRatio: "wide" as const, objectFit: "cover" as const } },
  };
}

function slot(
  id: string,
  parentId: string,
  role: DesignImageSlot["role"],
  placement: DesignImageSlot["placement"],
  aspectRatio: DesignImageSlot["display"]["aspectRatio"],
  width: number,
  height: number,
  maxHeight: number,
): DesignImageSlot {
  return {
    id,
    parentId,
    role,
    placement,
    display: { aspectRatio, width: "fill", maxHeight, objectFit: "cover", focalPoint: "center" },
    generation: { width, height, safeArea: placement === "background" ? "left" : "none" },
  };
}

function container(id: string, type: "page" | "section") {
  return {
    id,
    name: id,
    type,
    props: {},
    style: {
      base: baseStyle("surface"),
      container: { shadow: "none" as const, overflow: "visible" as const, surface: "flat" as const },
    },
  };
}

function baseStyle(backgroundColor: DesignBaseStyle["backgroundColor"]): DesignBaseStyle {
  return {
    backgroundColor,
    radius: "md",
    border: { width: "none", style: "none", color: "border" },
    text: {
      color: "textPrimary",
      fontFamily: "sans",
      fontSize: "md",
      fontWeight: "regular",
      lineHeight: "normal",
      align: "left",
    },
  };
}