import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "../layout-planning/node.js";
import { visualSlotReviewNode } from "./node.js";

describe("visualSlotReviewNode", () => {
  it("compiles background and inline slots without leaking generation height into UI layout", async () => {
    const { store, state } = await stateWithLayout("thread_visual_slot_review");
    const result = await visualSlotReviewNode(state, { artifactStore: store });
    const ref = result.latestArtifactRefs?.visual_slot_review;
    const artifact = await store.readArtifact(ref!);
    const output = artifact.output as { document: { elements: Array<any>; tree: any }; layoutPlan: any; issues: any[] };
    const backgroundSlot = output.layoutPlan.imageSlots.find((slot: any) => slot.placement === "background");
    const inlineSlot = output.layoutPlan.imageSlots.find((slot: any) => slot.placement === "inline");
    const backgroundTarget = output.document.elements.find((element) => element.id === backgroundSlot.parentId);
    const inlineImage = output.document.elements.find((element) => element.id === inlineSlot.id);

    expect(backgroundTarget.props).toMatchObject({ imageSlotId: backgroundSlot.id, imageSlot: backgroundSlot });
    expect(backgroundTarget.layout?.fixedHeight).not.toBe(backgroundSlot.generation.height);
    expect(inlineImage).toMatchObject({
      id: inlineSlot.id,
      type: "image",
      layout: { width: "fill", height: "hug" },
      props: { imageSlotId: inlineSlot.id, imageSlot: inlineSlot },
      style: { image: { aspectRatio: "wide", objectFit: inlineSlot.display.objectFit } },
    });
    expect(inlineImage.layout).not.toHaveProperty("fixedHeight");
    expect(findTreeNode(output.document.tree, inlineSlot.parentId)?.children.at(-1)?.id).toBe(inlineSlot.id);
    expect(output.issues).toEqual([]);
    expect(artifact.inputRefs).toEqual([state.latestArtifactRefs.layout_planning]);
  });

  it("keeps 1200x800 generation dimensions separate from inline UI layout", async () => {
    const { store, state } = await stateWithLayout("thread_visual_slot_generation_size");
    const layoutRef = state.latestArtifactRefs.layout_planning;
    const layoutArtifact = await store.readArtifact<any>(layoutRef);
    const inlineSlot = layoutArtifact.output.layoutPlan.imageSlots.find(
      (slot: any) => slot.placement === "inline",
    );
    const displayMaxHeight = inlineSlot.display.maxHeight;
    const sizedRef = await store.writeArtifact({
      node: "layout_planning",
      status: "success",
      inputRefs: layoutArtifact.inputRefs,
      output: {
        ...layoutArtifact.output,
        layoutPlan: {
          ...layoutArtifact.output.layoutPlan,
          imageSlots: layoutArtifact.output.layoutPlan.imageSlots.map((slot: any) =>
            slot.id === inlineSlot.id
              ? { ...slot, generation: { ...slot.generation, width: 1200, height: 800 } }
              : slot),
        },
      },
      errors: [],
    });

    const result = await visualSlotReviewNode({
      ...state,
      latestArtifactRefs: { ...state.latestArtifactRefs, layout_planning: sizedRef },
    }, { artifactStore: store });
    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.visual_slot_review);
    const image = artifact.output.document.elements.find((element: any) => element.id === inlineSlot.id);

    expect(image.layout.height).toBe("hug");
    expect(image.layout.fixedHeight).toBeUndefined();
    expect(image.props.imageSlot.generation).toEqual({
      ...inlineSlot.generation,
      width: 1200,
      height: 800,
    });
    expect(image.props.imageSlot.display.maxHeight).toBe(displayMaxHeight);
    expect(image.props.imageSlot.display.maxHeight).not.toBe(800);
  });
  it("fails when multiple background slots target the same parent", async () => {
    const { store, state } = await stateWithLayout("thread_visual_slot_duplicate_background");
    const layoutRef = state.latestArtifactRefs.layout_planning;
    const layoutArtifact = await store.readArtifact<any>(layoutRef);
    const backgroundSlot = layoutArtifact.output.layoutPlan.imageSlots.find(
      (slot: any) => slot.placement === "background",
    );
    const duplicateBackground = {
      ...backgroundSlot,
      id: `${backgroundSlot.id}_duplicate`,
      role: "card",
      display: { ...backgroundSlot.display, maxHeight: 240 },
    };
    const duplicateRef = await store.writeArtifact({
      node: "layout_planning",
      status: "success",
      inputRefs: layoutArtifact.inputRefs,
      output: {
        ...layoutArtifact.output,
        layoutPlan: {
          ...layoutArtifact.output.layoutPlan,
          imageSlots: [...layoutArtifact.output.layoutPlan.imageSlots, duplicateBackground],
        },
      },
      errors: [],
    });

    await expect(visualSlotReviewNode({
      ...state,
      latestArtifactRefs: { ...state.latestArtifactRefs, layout_planning: duplicateRef },
    }, { artifactStore: store })).rejects.toThrow(/visual_slot_review failed/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    await expect(store.readArtifact(manifest.artifacts.visual_slot_review)).resolves.toMatchObject({
      node: "visual_slot_review",
      status: "failed",
      errors: [expect.stringMatching(new RegExp(`(duplicate|multiple) background.*${backgroundSlot.parentId}`, "i"))],
    });
  });
  it("persists a failed artifact when a layout artifact contains an invalid slot reference", async () => {
    const { store, state } = await stateWithLayout("thread_visual_slot_invalid");
    const layoutRef = state.latestArtifactRefs.layout_planning;
    const layoutArtifact = await store.readArtifact<any>(layoutRef);
    const invalidRef = await store.writeArtifact({
      node: "layout_planning",
      status: "success",
      inputRefs: layoutArtifact.inputRefs,
      output: {
        ...layoutArtifact.output,
        layoutPlan: {
          ...layoutArtifact.output.layoutPlan,
          imageSlots: layoutArtifact.output.layoutPlan.imageSlots.map((slot: any, index: number) =>
            index === 0 ? { ...slot, parentId: "missing_parent" } : slot),
        },
      },
      errors: [],
    });

    await expect(visualSlotReviewNode({
      ...state,
      latestArtifactRefs: { ...state.latestArtifactRefs, layout_planning: invalidRef },
    }, { artifactStore: store })).rejects.toThrow(/visual_slot_review failed/i);

    const manifest = await store.readManifest();
    await expect(store.readArtifact(manifest.artifacts.visual_slot_review)).resolves.toMatchObject({
      node: "visual_slot_review",
      status: "failed",
      inputRefs: [invalidRef],
      errors: [expect.stringMatching(/missing_parent|parent/i)],
    });
  });
});

async function stateWithLayout(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-visual-slot-"));
  const store = createArtifactStore({ runDir, threadId });
  let state = createInitialState(threadId);
  state = { ...state, ...await jsonPlanningNode(state, { artifactStore: store }) };
  state = { ...state, ...await layoutPlanningNode(state, { artifactStore: store }) };
  return { store, state };
}

function findTreeNode(node: any, id: string): any {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findTreeNode(child, id);
    if (found) return found;
  }
  return undefined;
}