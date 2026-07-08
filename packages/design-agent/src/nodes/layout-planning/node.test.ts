import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "./node.js";
import { layoutPlanningModelOutputSchema, type LayoutPlan } from "./schema.js";

const layoutPlan: LayoutPlan = {
  strategy: "product_showcase",
  rootId: "page_root",
  sectionIds: ["header_section", "main_section", "footer_section"],
  rhythm: "standard",
  hierarchy: { primaryVisualSlotId: "hero_slot" },
  imageSlots: [
    imageSlot("hero_slot", "header_section", "hero", "background", "16:9", 480, 1536, 864, "left"),
    imageSlot("feature_slot", "main_section", "section", "inline", "4:3", 360, 1200, 900, "none"),
    imageSlot("detail_slot", "footer_section", "section", "inline", "4:3", 360, 1200, 900, "none"),
  ],
  notes: ["Use a grid-ready page layout."],
};

describe("layoutPlanningNode", () => {
  it("validates and stores a structured layout plan with three image slots", async () => {
    const { store, state } = await stateWithJson("thread_layout_1");
    const seenSchemas: unknown[] = [];
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ layoutPlan }) };
      },
    });

    expect(seenSchemas).toEqual([layoutPlanningModelOutputSchema]);
    await expect(store.readArtifact(result.latestArtifactRefs!.layout_planning)).resolves.toMatchObject({
      status: "success",
      output: { layoutPlan },
      errors: [],
    });
  });

  it("retries an image slot with an invalid parent", async () => {
    const { store, state } = await stateWithJson("thread_layout_retry");
    const prompts: unknown[] = [];
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke(input) {
          prompts.push(input);
          return prompts.length === 1
            ? { layoutPlan: { ...layoutPlan, imageSlots: [{ ...layoutPlan.imageSlots[0], parentId: "missing" }, ...layoutPlan.imageSlots.slice(1)] } }
            : { layoutPlan };
        } };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("previous layout plan was rejected");
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    expect(artifact.errors).toEqual([]);
  });

  it("retries duplicate image slot ids", async () => {
    const { store, state } = await stateWithJson("thread_layout_duplicate_slot");
    let attempts = 0;
    const result = await layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke() {
          attempts += 1;
          return attempts === 1
            ? { layoutPlan: { ...layoutPlan, imageSlots: layoutPlan.imageSlots.map((slot) => ({ ...slot, id: "duplicate" })) } }
            : { layoutPlan };
        } };
      },
    });

    expect(attempts).toBe(2);
    await expect(store.readArtifact(result.latestArtifactRefs!.layout_planning)).resolves.toMatchObject({
      status: "success",
      output: { layoutPlan },
    });
  });

  it("creates no image slots offline when the user explicitly rejects images", async () => {
    const { store, state } = await stateWithJson("thread_layout_no_images", "做一个设置页，不要图片");
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);

    expect(artifact.output).toMatchObject({
      layoutPlan: { imageSlots: [], hierarchy: {}, strategy: "product_showcase", rhythm: "standard" },
    });
  });

  it("creates three compliant image slots offline by default", async () => {
    const { store, state } = await stateWithJson("thread_layout_default_images", "做一个产品介绍页");
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const offlinePlan = (artifact.output as { layoutPlan: LayoutPlan }).layoutPlan;

    expect(offlinePlan.imageSlots).toHaveLength(3);
    expect(offlinePlan.hierarchy.primaryVisualSlotId).toBe(offlinePlan.imageSlots[0].id);
    expect(offlinePlan.imageSlots[0]).toMatchObject({
      role: "hero",
      placement: "background",
      display: { aspectRatio: "16:9", width: "fill", maxHeight: 480 },
      generation: { width: 1536, height: 864, safeArea: "left" },
    });
  });

  it.each([0, 1, 2])("creates valid fallback slots with %i sections", async (sectionCount) => {
    const { store, state } = await stateWithJson(
      "thread_layout_" + sectionCount + "_sections",
      "Create a product page with images",
      sectionCount,
    );
    const result = await layoutPlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
    const output = artifact.output as {
      layoutPlan: LayoutPlan;
      document: { elements: Array<{ id: string; type: string }> };
    };
    const { imageSlots } = output.layoutPlan;
    const elementIds = new Set(output.document.elements.map((element) => element.id));
    const elementTypes = new Map(output.document.elements.map((element) => [element.id, element.type]));

    expect(layoutPlanningModelOutputSchema.parse({ layoutPlan: output.layoutPlan }).layoutPlan).toEqual(output.layoutPlan);
    expect(imageSlots).toHaveLength(3);
    expect(new Set(imageSlots.map((slot) => slot.id))).toHaveLength(3);
    expect(imageSlots.every((slot) => !elementIds.has(slot.id))).toBe(true);
    expect(imageSlots.every((slot) => ["page", "section", "stack"].includes(elementTypes.get(slot.parentId) ?? ""))).toBe(true);

    const primaryCounts = new Map<string, number>();
    for (const slot of imageSlots.filter((item) => item.role === "hero" || item.role === "section")) {
      primaryCounts.set(slot.parentId, (primaryCounts.get(slot.parentId) ?? 0) + 1);
    }
    expect([...primaryCounts.values()].every((count) => count <= 1)).toBe(true);
  });

  it("persists a failed artifact and stops after both attempts fail", async () => {
    const { store, state } = await stateWithJson("thread_layout_failed");
    await expect(layoutPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid layout output"); } };
      },
    })).rejects.toThrow(/layout_planning failed after retry/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    await expect(store.readArtifact(manifest.artifacts.layout_planning)).resolves.toMatchObject({
      status: "failed",
      output: { layoutPlan: null, document: { id: "design_generated_page" } },
      errors: [expect.stringContaining("Retry failed")],
    });
  });
});

async function stateWithJson(threadId: string, message?: string, sectionCount?: number) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-layout-"));
  const store = createArtifactStore({ runDir, threadId });
  const initial = createInitialState(threadId);
  if (message) {
    initial.messages.push({ role: "user", content: message, createdAt: "2026-07-06T00:00:00.000Z" });
  }
  const update = await jsonPlanningNode(initial, {
    artifactStore: store,
    createStructuredOutput: sectionCount === undefined
      ? undefined
      : () => ({ invoke: () => ({ structurePlan: structurePlanWithSections(sectionCount) }) }),
  });
  const state: DesignAgentState = {
    ...initial,
    ...update,
    latestArtifactRefs: update.latestArtifactRefs ?? initial.latestArtifactRefs,
    events: update.events ?? initial.events,
  };
  return { store, state };
}

function structurePlanWithSections(sectionCount: number) {
  return {
    document: {
      id: "design_" + sectionCount + "_sections",
      name: sectionCount + " Section Design",
      viewport: "desktop" as const,
      width: 1440,
      background: "muted" as const,
    },
    nodes: [
      {
        id: "page_root",
        parentId: null,
        order: 0,
        type: "page" as const,
        name: "Page",
        purpose: "Application root",
      },
      ...Array.from({ length: sectionCount }, (_, index) => ({
        id: "section_" + (index + 1),
        parentId: "page_root",
        order: index,
        type: "section" as const,
        name: "Section " + (index + 1),
        purpose: "Content region " + (index + 1),
      })),
    ],
  };
}

function imageSlot(
  id: string,
  parentId: string,
  role: "hero" | "section",
  placement: "background" | "inline",
  aspectRatio: "16:9" | "4:3",
  maxHeight: number,
  width: number,
  height: number,
  safeArea: "left" | "none",
) {
  return {
    id,
    parentId,
    role,
    placement,
    display: {
      aspectRatio,
      width: "fill" as const,
      maxHeight,
      objectFit: "cover" as const,
      focalPoint: "center" as const,
    },
    generation: { width, height, safeArea },
  };
}
