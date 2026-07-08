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
          operations: [
            {
              target: "elements",
              action: "add_minimum_page_element",
              reason: "The design schema requires at least one element.",
            },
          ],
          requiresRegeneration: true,
        },
        nextAction: "repair_plan_ready",
      },
      errors: ["elements: Array must contain at least 1 element(s)"],
    });

    const result = await documentRepairNode(
      {
        ...state,
        latestArtifactRefs: {
          schema_validation: schemaValidationRef,
          reflection_repair: reflectionRepairRef,
        },
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
      output: {
        repaired: true,
        appliedOperations: [expect.objectContaining({ action: "add_minimum_page_element" })],
      },
    });
    const artifact = await store.readArtifact<{ document: unknown }>(repairRef!);
    expect(() => designDocumentSchema.parse(artifact.output.document)).not.toThrow();
  });
});
