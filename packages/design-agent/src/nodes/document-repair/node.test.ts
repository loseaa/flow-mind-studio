import { designDocumentSchema } from "@flowmind/shared";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { documentRepairNode } from "./node.js";

describe("documentRepairNode", () => {
  it("writes a schema-valid repaired document from a reflection repair plan", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-document-repair-"));
    const store = createArtifactStore({ runDir, threadId: "thread_document_repair_1" });
    const state = createInitialState("thread_document_repair_1");
    const schemaValidationRef = await store.writeArtifact({
      node: "schema_validation",
      status: "failed",
      inputRefs: [],
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          id: "broken_document",
          name: "Broken Document",
          canvas: { viewport: "desktop", width: 1440, background: "muted" },
          tree: { id: "missing_node", children: [] },
          elements: [],
          variables: {},
        },
        valid: false,
        errors: ["elements: Array must contain at least 1 element(s)"],
      },
      errors: ["elements: Array must contain at least 1 element(s)"],
    });
    const reflectionRepairRef = await store.writeArtifact({
      node: "reflection_repair",
      status: "failed",
      inputRefs: [schemaValidationRef],
      output: {
        reason: "schema_validation_failed",
        errors: ["elements: Array must contain at least 1 element(s)"],
        sourceArtifact: schemaValidationRef,
        repairPlan: {
          summary: "Add a minimum valid page element.",
          operations: [{ target: "elements", action: "add_minimum_page_element", reason: "The design schema requires at least one element." }],
          requiresRegeneration: true,
        },
        nextAction: "repair_plan_ready",
      },
      errors: ["elements: Array must contain at least 1 element(s)"],
    });

    const result = await documentRepairNode(
      {
        ...state,
        latestArtifactRefs: { schema_validation: schemaValidationRef, reflection_repair: reflectionRepairRef },
        validationErrors: ["elements: Array must contain at least 1 element(s)"],
      },
      { artifactStore: store },
    );

    const repairRef = result.latestArtifactRefs?.document_repair;
    expect(repairRef).toBeDefined();
    expect(result.repairAttempts).toBe(1);
    await expect(store.readArtifact(repairRef!)).resolves.toMatchObject({
      node: "document_repair",
      status: "success",
      output: { repaired: true, appliedOperations: [expect.objectContaining({ action: "add_minimum_page_element" })] },
    });
    const artifact = await store.readArtifact<{ document: unknown }>(repairRef!);
    expect(() => designDocumentSchema.parse(artifact.output.document)).not.toThrow();
  });

  it("applies visual review repair actions without a reflection repair artifact", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-visual-repair-"));
    const store = createArtifactStore({ runDir, threadId: "thread_document_repair_visual" });
    const state = createInitialState("thread_document_repair_visual");
    const imageSlot = {
      id: "slot_feature",
      parentId: "slot_feature",
      role: "section" as const,
      placement: "inline" as const,
      display: { aspectRatio: "4:3" as const, width: "fill" as const, maxHeight: 320, objectFit: "cover" as const, focalPoint: "center" as const },
      generation: { width: 1200, height: 900, safeArea: "none" as const },
    };
    const document = designDocumentSchema.parse({
      schemaVersion: "fm-design/v1",
      id: "visual_repair_document",
      name: "Visual Repair Document",
      canvas: { viewport: "desktop", width: 1440, background: "muted" },
      tree: { id: "page", children: [{ id: "slot_feature", children: [] }] },
      elements: [
        { id: "page", name: "Page", type: "page", layout: { display: "flex", direction: "vertical", width: "fill", height: "hug" }, props: {}, style: { base: baseStyle(), container: { shadow: "none", overflow: "visible", surface: "flat" } } },
        { id: "slot_feature", name: "Feature", type: "image", layout: { width: "fill", height: "fixed", fixedHeight: 640 }, props: { imageSlotId: imageSlot.id }, style: { base: baseStyle(), image: { aspectRatio: "wide", objectFit: "cover" } } },
      ],
      variables: {},
    });
    const schemaValidationRef = await store.writeArtifact({ node: "schema_validation", status: "success", inputRefs: [], output: { document, valid: true, errors: [] }, errors: [] });
    const visualReviewRef = await store.writeArtifact({
      node: "visual_review",
      status: "failed",
      inputRefs: [schemaValidationRef],
      output: {
        document,
        review: {
          score: 70,
          passed: false,
          issues: [{ code: "IMAGE_SLOT_METADATA_MISSING", elementId: "slot_feature", severity: "medium", suggestion: "Restore slot metadata." }],
          repairActions: [{ kind: "set_slot_stable_layout", elementId: "slot_feature", slotId: imageSlot.id, value: imageSlot, reason: "Use stable slot layout." }],
        },
        sourceArtifact: schemaValidationRef,
        modelNotes: [],
      },
      errors: ["IMAGE_SLOT_METADATA_MISSING: Restore slot metadata."],
    });

    const result = await documentRepairNode(
      {
        ...state,
        currentNode: "visual_review",
        stage: "visual_review",
        latestArtifactRefs: { schema_validation: schemaValidationRef, visual_review: visualReviewRef },
        validationErrors: ["IMAGE_SLOT_METADATA_MISSING: Restore slot metadata."],
      },
      { artifactStore: store },
    );

    const repairRef = result.latestArtifactRefs?.document_repair;
    expect(repairRef).toBeDefined();
    expect(result.repairAttempts).toBe(1);
    const artifact = await store.readArtifact<{ document: unknown; appliedOperations: Array<{ action: string }>; sourceArtifacts: { visualReview?: unknown; reflectionRepair?: unknown } }>(repairRef!);
    const repaired = designDocumentSchema.parse(artifact.output.document);
    const image = repaired.elements.find((element) => element.id === "slot_feature");
    expect(artifact.output.sourceArtifacts.visualReview).toEqual(visualReviewRef);
    expect(artifact.output.sourceArtifacts.reflectionRepair).toBeUndefined();
    expect(artifact.output.appliedOperations).toContainEqual(expect.objectContaining({ action: "set_slot_stable_layout" }));
    expect(image?.props.imageSlot).toMatchObject({ id: "slot_feature" });
    expect(image?.layout).toMatchObject({ width: "fill", height: "hug" });
    expect(image?.layout?.fixedHeight).toBeUndefined();
  });

  it("auto-fills commerce homepage content from visual review issues", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-commerce-repair-"));
    const store = createArtifactStore({ runDir, threadId: "thread_document_repair_commerce" });
    const state = createInitialState("thread_document_repair_commerce");
    const document = designDocumentSchema.parse({
      schemaVersion: "fm-design/v1",
      id: "commerce_repair_document",
      name: "Commerce Repair Document",
      canvas: { viewport: "desktop", width: 1440, background: "muted" },
      tree: {
        id: "root",
        children: [
          { id: "section-header", children: [{ id: "stack-header-layout", children: [{ id: "stack-header-content", children: [] }] }] },
          { id: "section-hero", children: [{ id: "stack-hero-layout", children: [{ id: "stack-hero-copy", children: [] }, { id: "stack-hero-media", children: [] }] }] },
          { id: "section-categories", children: [{ id: "stack-categories-layout", children: [{ id: "stack-categories-list", children: [] }] }] },
          { id: "section-hot-products", children: [{ id: "stack-hot-products-layout", children: [{ id: "stack-hot-products-heading", children: [] }, { id: "stack-hot-products-grid", children: [] }] }] },
          { id: "section-new-arrivals", children: [{ id: "stack-new-arrivals-layout", children: [{ id: "stack-new-arrivals-heading", children: [] }, { id: "stack-new-arrivals-grid", children: [] }] }] },
          { id: "section-limited-offers", children: [{ id: "stack-limited-offers-layout", children: [{ id: "stack-limited-offers-heading", children: [] }, { id: "stack-limited-offers-grid", children: [] }] }] },
          { id: "section-reviews", children: [{ id: "stack-reviews-layout", children: [{ id: "stack-reviews-heading", children: [] }, { id: "stack-reviews-grid", children: [] }] }] },
          { id: "section-service-guarantees", children: [{ id: "stack-service-guarantees-layout", children: [{ id: "stack-service-guarantees-heading", children: [] }, { id: "stack-service-guarantees-items", children: [] }] }] },
          { id: "section-footer-cta", children: [{ id: "stack-footer-cta-layout", children: [{ id: "stack-footer-cta-content", children: [] }] }] },
        ],
      },
      elements: [
        page("root"),
        section("section-header"),
        stack("stack-header-layout"),
        stack("stack-header-content"),
        section("section-hero"),
        stack("stack-hero-layout"),
        stack("stack-hero-copy"),
        stack("stack-hero-media"),
        section("section-categories"),
        stack("stack-categories-layout"),
        stack("stack-categories-list"),
        section("section-hot-products"),
        stack("stack-hot-products-layout"),
        stack("stack-hot-products-heading"),
        stack("stack-hot-products-grid"),
        section("section-new-arrivals"),
        stack("stack-new-arrivals-layout"),
        stack("stack-new-arrivals-heading"),
        stack("stack-new-arrivals-grid"),
        section("section-limited-offers"),
        stack("stack-limited-offers-layout"),
        stack("stack-limited-offers-heading"),
        stack("stack-limited-offers-grid"),
        section("section-reviews"),
        stack("stack-reviews-layout"),
        stack("stack-reviews-heading"),
        stack("stack-reviews-grid"),
        section("section-service-guarantees"),
        stack("stack-service-guarantees-layout"),
        stack("stack-service-guarantees-heading"),
        stack("stack-service-guarantees-items"),
        section("section-footer-cta"),
        stack("stack-footer-cta-layout"),
        stack("stack-footer-cta-content"),
      ],
      variables: {
        designTheme: { theme: "neutral_workspace", tone: "quiet" },
        agentPlanning: { stylePlan: { theme: "neutral_workspace", tone: "quiet" } },
      },
    });
    const schemaValidationRef = await store.writeArtifact({ node: "schema_validation", status: "success", inputRefs: [], output: { document, valid: true, errors: [] }, errors: [] });
    const visualReviewRef = await store.writeArtifact({
      node: "visual_review",
      status: "failed",
      inputRefs: [schemaValidationRef],
      output: {
        document,
        review: {
          score: 45,
          passed: false,
          issues: [
            { code: "MISSING_FIRST_VIEWPORT_TITLE", elementId: "section-header", severity: "high", suggestion: "The first viewport should include a clear title." },
            { code: "PRODUCT_SECTION_HAS_NO_COPY", elementId: "section-hot-products", severity: "high", suggestion: "Every product section except a deliberate gallery needs a heading and supporting copy." },
            { code: "MODEL_VISUAL_HIGH_1", severity: "high", suggestion: "Top navigation section (section-header) is misused as hero banner; missing search bar and simplified category navigation elements." },
            { code: "MODEL_VISUAL_MEDIUM_6", severity: "medium", suggestion: "Product sections (hot products, new arrivals, limited offers) lack product card elements; only empty layout stacks are present." },
          ],
          repairActions: [],
        },
        sourceArtifact: schemaValidationRef,
        modelNotes: [],
      },
      errors: ["MISSING_FIRST_VIEWPORT_TITLE: The first viewport should include a clear title."],
    });

    const result = await documentRepairNode(
      {
        ...state,
        currentNode: "visual_review",
        stage: "visual_review",
        latestArtifactRefs: { schema_validation: schemaValidationRef, visual_review: visualReviewRef },
        validationErrors: ["MISSING_FIRST_VIEWPORT_TITLE: The first viewport should include a clear title."],
      },
      { artifactStore: store },
    );

    const repairRef = result.latestArtifactRefs?.document_repair;
    const artifact = await store.readArtifact<{ document: unknown; appliedOperations: Array<{ action: string }> }>(repairRef!);
    const repaired = designDocumentSchema.parse(artifact.output.document);
    expect(repaired.variables.designTheme).toEqual({ theme: "commerce_editorial", tone: "premium" });
    expect(repaired.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "header_title", type: "text" }),
      expect.objectContaining({ id: "header_search", type: "input" }),
      expect.objectContaining({ id: "header_nav_health", type: "button" }),
      expect.objectContaining({ id: "stack-hot-products-grid_card_1_stack", type: "stack" }),
      expect.objectContaining({ id: "stack-hot-products-grid_card_1_buy", type: "button" }),
      expect.objectContaining({ id: "cta_primary_action", type: "button" }),
    ]));
    expect(artifact.output.appliedOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "apply_warm_commerce_theme" }),
      expect.objectContaining({ action: "add_input_control" }),
      expect.objectContaining({ action: "add_button_action" }),
      expect.objectContaining({ action: "add_text_copy" }),
    ]));
  });
});

function baseStyle() {
  return {
    backgroundColor: "transparent" as const,
    radius: "md" as const,
    border: { width: "none" as const, style: "none" as const, color: "border" as const },
    text: { color: "textPrimary" as const, fontFamily: "sans" as const, fontSize: "md" as const, fontWeight: "regular" as const, lineHeight: "normal" as const, align: "left" as const },
  };
}

function page(id: string) {
  return { id, name: "Page", type: "page" as const, layout: { display: "flex" as const, direction: "vertical" as const, width: "fill" as const, height: "hug" as const }, props: {}, style: { base: baseStyle(), container: { shadow: "none" as const, overflow: "visible" as const, surface: "flat" as const } } };
}

function section(id: string) {
  return { id, name: id, type: "section" as const, layout: { display: "flex" as const, direction: "vertical" as const, width: "fill" as const, height: "hug" as const }, props: {}, style: { base: baseStyle(), container: { shadow: "none" as const, overflow: "visible" as const, surface: "flat" as const } } };
}

function stack(id: string) {
  return { id, name: id, type: "stack" as const, layout: { display: "flex" as const, direction: "vertical" as const, width: "fill" as const, height: "hug" as const }, props: {}, style: { base: baseStyle(), container: { shadow: "none" as const, overflow: "visible" as const, surface: "panel" as const } } };
}
