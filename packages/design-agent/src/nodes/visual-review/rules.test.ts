import { designDocumentSchema, type DesignDocument, type DesignElement, type DesignImageSlot } from "@flowmind/shared";
import { describe, expect, it } from "vitest";

import { applyVisualRepairActions } from "../document-repair/node.js";
import { reviewVisualQualityWithRules } from "./rules.js";

const slots = {
  hero: slot("slot_hero", "hero", "hero", "background", "16:9", 1536, 864, 480),
  feature: slot("slot_feature", "slot_feature", "section", "inline", "4:3", 1200, 900, 320),
  card: slot("slot_card", "slot_card", "card", "inline", "1:1", 1024, 1024, 220),
};

describe("reviewVisualQualityWithRules image slot repair", () => {
  it("restores missing inline imageSlot metadata from agent planning", () => {
    const document = documentWithSlots([
      section("hero", { imageSlotId: slots.hero.id, imageSlot: slots.hero }),
      image("slot_feature", { imageSlotId: slots.feature.id }),
      image("slot_card", { imageSlotId: slots.card.id, imageSlot: slots.card }),
    ]);

    const review = reviewVisualQualityWithRules(document);

    expect(review.issues).toContainEqual(expect.objectContaining({ code: "IMAGE_SLOT_METADATA_MISSING", elementId: "slot_feature" }));
    expect(review.repairActions).toContainEqual(expect.objectContaining({ kind: "restore_image_slot_metadata", elementId: "slot_feature", slotId: "slot_feature" }));

    const repaired = applyVisualRepairActions(document, review.repairActions).document;
    const repairedImage = repaired.elements.find((element) => element.id === "slot_feature");
    expect(repairedImage?.props.imageSlot).toMatchObject({ id: "slot_feature", placement: "inline" });
    expect(() => designDocumentSchema.parse(repaired)).not.toThrow();
  });

  it("repairs fixed inline image layout to stable slot-driven sizing", () => {
    const document = documentWithSlots([
      section("hero", { imageSlotId: slots.hero.id, imageSlot: slots.hero }),
      { ...image("slot_feature", { imageSlotId: slots.feature.id, imageSlot: slots.feature }), layout: { width: "fill", height: "fixed", fixedHeight: 640 } },
      image("slot_card", { imageSlotId: slots.card.id, imageSlot: slots.card }),
    ]);

    const review = reviewVisualQualityWithRules(document);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "IMAGE_SLOT_UNSTABLE_LAYOUT", elementId: "slot_feature" }));

    const repaired = applyVisualRepairActions(document, review.repairActions).document;
    const repairedImage = repaired.elements.find((element) => element.id === "slot_feature");
    expect(repairedImage?.layout).toMatchObject({ width: "fill", height: "hug" });
    expect(repairedImage?.layout?.fixedHeight).toBeUndefined();
    expect(() => designDocumentSchema.parse(repaired)).not.toThrow();
  });

  it("reports required image coverage below three stable slots", () => {
    const missingTargetSlot = slot("slot_missing", "missing_section", "section", "background", "16:9", 1200, 675, 320);
    const document = documentWithSlots([
      section("hero", { imageSlotId: slots.hero.id, imageSlot: slots.hero }),
      image("slot_feature", { imageSlotId: slots.feature.id, imageSlot: slots.feature }),
    ], [slots.hero, slots.feature, missingTargetSlot]);

    const review = reviewVisualQualityWithRules(document);

    expect(review.issues).toContainEqual(expect.objectContaining({ code: "IMAGE_SLOT_COVERAGE_TOO_LOW", elementId: "page" }));
    expect(review.passed).toBe(false);
  });
  it("does not require a primary visual when image policy is none", () => {
    const document = documentWithSlots([], []);
    document.variables.agentPlanning = {
      visualAssetPlan: { imagePolicy: "none" },
      visualSlotReview: { layoutPlan: { imageSlots: [] } },
    };

    const review = reviewVisualQualityWithRules(document);

    expect(review.issues).not.toContainEqual(expect.objectContaining({ code: "MISSING_PRIMARY_VISUAL" }));
    expect(review.issues).not.toContainEqual(expect.objectContaining({ code: "IMAGE_SLOT_COVERAGE_TOO_LOW" }));
  });
});

function documentWithSlots(extraElements: DesignElement[], plannedSlots: DesignImageSlot[] = [slots.hero, slots.feature, slots.card]): DesignDocument {
  return designDocumentSchema.parse({
    schemaVersion: "fm-design/v1",
    id: "doc",
    name: "Doc",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "page", children: [{ id: "title", children: [] }, { id: "cta", children: [] }, ...extraElements.map((element) => ({ id: element.id, children: [] }))] },
    elements: [page(), text("title"), button("cta"), ...extraElements],
    variables: {
      agentPlanning: {
        visualAssetPlan: { imagePolicy: "required" },
        visualSlotReview: { layoutPlan: { imageSlots: plannedSlots } },
      },
    },
  });
}

function slot(id: string, parentId: string, role: DesignImageSlot["role"], placement: DesignImageSlot["placement"], aspectRatio: DesignImageSlot["display"]["aspectRatio"], width: number, height: number, maxHeight: number): DesignImageSlot {
  return { id, parentId, role, placement, display: { aspectRatio, width: "fill", maxHeight, objectFit: "cover", focalPoint: "center" }, generation: { width, height, safeArea: "center" } };
}

function page(): DesignElement {
  return { id: "page", name: "Page", type: "page", layout: { display: "flex", direction: "vertical", width: "fill", height: "hug" }, props: {}, style: containerStyle() };
}

function section(id: string, props: Record<string, unknown>): DesignElement {
  return { id, name: id, type: "section", layout: { display: "flex", direction: "vertical", width: "fill", height: "hug" }, props, style: containerStyle() };
}

function image(id: string, props: Record<string, unknown>): DesignElement {
  return { id, name: id, type: "image", layout: { width: "fill", height: "hug" }, props, style: { base: baseStyle(), image: { aspectRatio: "wide", objectFit: "cover" } } };
}

function text(id: string): DesignElement {
  return { id, name: id, type: "text", props: { text: "Title" }, style: { base: baseStyle(), text: { role: "heading", decoration: "none", transform: "none" } } };
}

function button(id: string): DesignElement {
  return { id, name: id, type: "button", props: { label: "Start" }, style: { base: baseStyle(), button: { size: "md", emphasis: "primary" } } };
}

function containerStyle() {
  return { base: baseStyle(), container: { shadow: "none" as const, overflow: "visible" as const, surface: "flat" as const } };
}

function baseStyle() {
  return {
    backgroundColor: "transparent" as const,
    radius: "md" as const,
    border: { width: "none" as const, style: "none" as const, color: "border" as const },
    text: { color: "textPrimary" as const, fontFamily: "sans" as const, fontSize: "md" as const, fontWeight: "regular" as const, lineHeight: "normal" as const, align: "left" as const },
  };
}