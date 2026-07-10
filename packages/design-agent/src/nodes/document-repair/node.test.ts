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
});

function baseStyle() {
  return {
    backgroundColor: "transparent" as const,
    radius: "md" as const,
    border: { width: "none" as const, style: "none" as const, color: "border" as const },
    text: { color: "textPrimary" as const, fontFamily: "sans" as const, fontSize: "md" as const, fontWeight: "regular" as const, lineHeight: "normal" as const, align: "left" as const },
  };
}