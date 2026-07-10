import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { reflectionRepairNode } from "./node.js";
import { reflectionRepairModelOutputSchema } from "./schema.js";

describe("reflectionRepairNode", () => {
  it("uses structured output to create a repair plan from schema validation errors", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-reflection-"));
    const store = createArtifactStore({ runDir, threadId: "thread_reflection_1" });
    const state = createInitialState("thread_reflection_1");
    const validationRef = await store.writeArtifact({
      node: "schema_validation",
      status: "failed",
      inputRefs: [],
      output: {
        document: { id: "broken" },
        valid: false,
        errors: ["elements: Array must contain at least 1 element(s)"],
      },
      errors: ["elements: Array must contain at least 1 element(s)"],
    });
    const seenSchemas: unknown[] = [];

    const result = await reflectionRepairNode(
      {
        ...state,
        stage: "failed",
        validationErrors: ["elements: Array must contain at least 1 element(s)"],
        latestArtifactRefs: { schema_validation: validationRef },
      },
      {
        artifactStore: store,
        createStructuredOutput(schema) {
          seenSchemas.push(schema);
          return {
            invoke() {
              return {
                repairPlan: {
                  summary: "Add at least one element and align the tree root with an existing element id.",
                  operations: [
                    {
                      target: "elements",
                      action: "add_minimum_page_element",
                      reason: "The design schema requires at least one element.",
                    },
                  ],
                  requiresRegeneration: true,
                },
              };
            },
          };
        },
      },
    );

    expect(seenSchemas).toEqual([reflectionRepairModelOutputSchema]);
    const repairRef = result.latestArtifactRefs?.reflection_repair;
    expect(repairRef).toBeDefined();
    await expect(store.readArtifact(repairRef!)).resolves.toMatchObject({
      node: "reflection_repair",
      status: "failed",
      output: {
        reason: "schema_validation_failed",
        errors: ["elements: Array must contain at least 1 element(s)"],
        repairPlan: {
          requiresRegeneration: true,
          operations: [
            expect.objectContaining({ target: "elements" }),
          ],
        },
      },
    });
  });
});
