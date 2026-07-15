import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DesignBaseStyle, DesignDocument, DesignImageSlot } from "@flowmind/shared";
import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { imagePlanningNode } from "./node.js";
import { imagePlanningModelOutputSchema } from "./schema.js";

describe("imagePlanningNode", () => {
  it("preserves the complete style document while using reviewed image slots", async () => {
    const { state, store, styleRef, visualRef } = await fixture("normal");
    const schemas: unknown[] = [];

    const result = await imagePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        schemas.push(schema);
        return { invoke: () => draft() };
      },
    });

    expect(schemas).toEqual([imagePlanningModelOutputSchema]);
    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.image_planning);
    expect(artifact.inputRefs).toEqual([styleRef, visualRef]);
    expect(artifact.output.visualAssetPlan.assets[0]).toMatchObject({
      slotId: "slot_bg",
      targetElementId: "hero",
      kind: "background_image",
      width: 1440,
      height: 810,
      aspectRatio: "wide",
    });
    expect(artifact.output.visualAssetPlan.assets[1]).toMatchObject({
      slotId: "slot_feature",
      targetElementId: "slot_feature",
      kind: "content_image",
    });
    expect(artifact.output.document.elements).toHaveLength(styleDocument().elements.length);
    expect(artifact.output.document.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hero_title", type: "text" }),
      expect.objectContaining({ id: "hero_action", type: "button" }),
    ]));
  });

  it("fails clearly when style planning does not provide a valid document", async () => {
    const { state, store } = await fixture("missing-style-document");
    const brokenStyleRef = await store.writeArtifact({
      node: "style_planning",
      status: "success",
      inputRefs: [],
      output: { stylePlan: { theme: "editorial", tone: "expressive" } },
      errors: [],
    });
    state.latestArtifactRefs = { ...state.latestArtifactRefs, style_planning: brokenStyleRef };

    await expect(
      imagePlanningNode(state, {
        artifactStore: store,
        createStructuredOutput() {
          return { invoke: () => draft() };
        },
      }),
    ).rejects.toThrow(/style_planning\.output\.document/i);
  });

  it("retries unknown slots and rejects duplicate slot use", async () => {
    const { state, store } = await fixture("retry");
    let calls = 0;

    const result = await imagePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke() {
            calls += 1;
            const value = draft();
            if (calls === 1) value.visualAssetPlan.assets[0].slotId = "missing";
            return value;
          },
        };
      },
    });

    expect(calls).toBe(2);
    expect((await store.readArtifact<any>(result.latestArtifactRefs!.image_planning)).status).toBe("success");
  });

  it("uses reviewed slots after retry when the model keeps reusing a slot", async () => {
    const { state, store } = await fixture("duplicate2");
    const value = draft();
    value.visualAssetPlan.assets[1].slotId = value.visualAssetPlan.assets[0].slotId;

    const result = await imagePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => value };
      },
    });

    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.image_planning);
    expect(artifact.status).toBe("success");
    expect(artifact.errors).toEqual([expect.stringContaining("Retry failed")]);
    expect(artifact.output.visualAssetPlan.assets.map((asset: any) => asset.slotId)).toEqual(slots().map((slot) => slot.id));
  });

  it("offline fallback uses reviewed slots", async () => {
    const { state, store } = await fixture("offline");

    const result = await imagePlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.image_planning);

    expect(artifact.output.visualAssetPlan.assets.map((asset: any) => asset.slotId)).toEqual(slots().map((slot) => slot.id));
  });

  it("explicit no-image intent produces zero assets", async () => {
    const { state, store } = await fixture("none", "no images, only text");

    const result = await imagePlanningNode(state, { artifactStore: store });
    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.image_planning);

    expect(artifact.output.visualAssetPlan).toMatchObject({ imagePolicy: "none", minimumGeneratedAssets: 0, assets: [] });
  });
});

async function fixture(threadId: string, message = "make a product page with rich images") {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-image-slot-"));
  const store = createArtifactStore({ runDir, threadId });
  const doc = document();
  const styleRef = await store.writeArtifact({
    node: "style_planning",
    status: "success",
    inputRefs: [],
    output: { document: styleDocument(), stylePlan: { theme: "editorial", tone: "expressive" } },
    errors: [],
  });
  const visualRef = await store.writeArtifact({
    node: "visual_slot_review",
    status: "success",
    inputRefs: [],
    output: { document: doc, layoutPlan: { imageSlots: slots() } },
    errors: [],
  });
  const state: DesignAgentState = {
    ...createInitialState(threadId),
    messages: [{ role: "user", content: message, createdAt: "2026-07-01" }],
    latestArtifactRefs: { style_planning: styleRef, visual_slot_review: visualRef },
  };
  return { state, store, styleRef, visualRef };
}

function draft() {
  return {
    visualAssetPlan: {
      imagePolicy: "required" as const,
      visualMode: "standard" as const,
      minimumGeneratedAssets: 3,
      assets: [
        { id: "bg", slotId: "slot_bg", purpose: "Hero", promptBrief: "Hero scene", priority: "required" as const },
        { id: "feature", slotId: "slot_feature", purpose: "Feature", promptBrief: "Feature scene", priority: "required" as const },
        { id: "card", slotId: "slot_card", purpose: "Card", promptBrief: "Card scene", priority: "recommended" as const },
      ],
      notes: [],
    },
  };
}

function slots(): DesignImageSlot[] {
  return [
    {
      id: "slot_bg",
      parentId: "hero",
      role: "hero",
      placement: "background",
      display: { aspectRatio: "16:9", width: "fill", maxHeight: 480, objectFit: "cover", focalPoint: "center" },
      generation: { width: 1440, height: 810, safeArea: "left" },
    },
    {
      id: "slot_feature",
      parentId: "hero",
      role: "section",
      placement: "inline",
      display: { aspectRatio: "3:2", width: "fill", maxHeight: 320, objectFit: "cover", focalPoint: "center" },
      generation: { width: 1200, height: 800, safeArea: "none" },
    },
    {
      id: "slot_card",
      parentId: "hero",
      role: "card",
      placement: "inline",
      display: { aspectRatio: "1:1", width: "half", maxHeight: 200, objectFit: "contain", focalPoint: "center" },
      generation: { width: 800, height: 800, safeArea: "none" },
    },
  ];
}

function document(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: "doc",
    name: "Doc",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "page", children: [{ id: "hero", children: [{ id: "slot_feature", children: [] }, { id: "slot_card", children: [] }] }] },
    elements: [container("page", "page"), { ...container("hero", "section"), props: { imageSlotId: "slot_bg" } }, image("slot_feature"), image("slot_card")],
    variables: {},
  };
}

function styleDocument(): DesignDocument {
  const reviewed = document();
  return {
    ...reviewed,
    tree: {
      id: "page",
      children: [{
        id: "hero",
        children: [
          { id: "slot_feature", children: [] },
          { id: "slot_card", children: [] },
          { id: "hero_title", children: [] },
          { id: "hero_action", children: [] },
        ],
      }],
    },
    elements: [
      ...reviewed.elements,
      textElement("hero_title"),
      buttonElement("hero_action"),
    ],
  };
}

function textElement(id: string) {
  return {
    id,
    name: id,
    type: "text" as const,
    props: { text: "A complete product story" },
    style: {
      base: base(),
      text: { role: "heading" as const, decoration: "none" as const, transform: "none" as const },
    },
  };
}

function buttonElement(id: string) {
  return {
    id,
    name: id,
    type: "button" as const,
    props: { label: "Buy now" },
    style: {
      base: base(),
      button: { size: "md" as const, emphasis: "primary" as const },
    },
  };
}

function image(id: string) {
  return {
    id,
    name: id,
    type: "image" as const,
    layout: { width: "fill" as const, height: "hug" as const },
    props: { imageSlotId: id },
    style: { base: base(), image: { aspectRatio: "wide" as const, objectFit: "cover" as const } },
  };
}

function container(id: string, type: "page" | "section") {
  return {
    id,
    name: id,
    type,
    props: {},
    style: { base: base(), container: { shadow: "none" as const, overflow: "visible" as const, surface: "flat" as const } },
  };
}

function base(): DesignBaseStyle {
  return {
    backgroundColor: "surface",
    radius: "md",
    border: { width: "none", style: "none", color: "border" },
    text: { color: "textPrimary", fontFamily: "sans", fontSize: "md", fontWeight: "regular", lineHeight: "normal", align: "left" },
  };
}
