import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "../layout-planning/node.js";
import { visualSlotReviewNode } from "../visual-slot-review/node.js";
import { elementPlanningNode } from "./node.js";
import { elementPlanningModelOutputSchema, type SemanticElementPlan } from "./schema.js";

const semanticPlan: SemanticElementPlan = {
  elements: [
    {
      id: "page_title",
      parentId: "header_section",
      order: 0,
      type: "text",
      name: "Page Title",
      purpose: "Identify the workspace",
      content: "区域环境监测",
      attributes: [{ key: "role", value: "heading" }],
    },
    {
      id: "environment_map",
      parentId: "main_section",
      order: 0,
      type: "image",
      name: "Environment Map",
      purpose: "Show monitoring points and risks",
      content: "区域环境监测地图",
      attributes: [{ key: "imagePrompt", value: "GIS map with environmental monitoring markers" }],
    },
  ],
  notes: ["Keep the map visible."],
};

describe("elementPlanningNode", () => {
  it("stores the semantic plan and compiles its elements into the document", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_1");
    const seenSchemas: unknown[] = [];

    const result = await elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ elementPlan: semanticPlan }) };
      },
    });

    expect(seenSchemas).toEqual([elementPlanningModelOutputSchema]);
    const elementRef = result.latestArtifactRefs?.element_planning;
    expect(elementRef).toBeDefined();
    await expect(store.readArtifact(elementRef!)).resolves.toMatchObject({
      node: "element_planning",
      status: "success",
      output: {
        elementPlan: semanticPlan,
        document: {
          elements: expect.arrayContaining([
            expect.objectContaining({ id: "page_title", type: "text", props: expect.objectContaining({ text: "区域环境监测" }) }),
            expect.objectContaining({ id: "environment_map", type: "image" }),
          ]),
        },
      },
      errors: [],
    });
  });

  it("retries an invalid semantic plan before failing the node", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_retry");
    const prompts: unknown[] = [];

    const result = await elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            if (prompts.length === 1) throw new Error("Element parent does not exist");
            return { elementPlan: semanticPlan };
          },
        };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("previous element plan was rejected");
    const artifact = await store.readArtifact(result.latestArtifactRefs!.element_planning);
    expect(artifact.errors).toEqual([]);
    expect((artifact.output as { document: { elements: Array<{ id: string }> } }).document.elements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "page_title" })]));
  });

  it("persists a failed artifact and stops after both model attempts fail", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_failed");

    await expect(elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid semantic element output"); } };
      },
    })).rejects.toThrow(/element_planning failed after retry/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    await expect(store.readArtifact(manifest.artifacts.element_planning)).resolves.toMatchObject({
      status: "failed",
      errors: [expect.stringContaining("Retry failed")],
      output: {
        elementPlan: null,
        document: { elements: expect.any(Array) },
      },
    });
  });

  it("preserves the parser error tail without copying a long failed response into the retry prompt", async () => {
    const { store, state } = await stateWithLayoutPlanning("thread_element_long_error");
    const prompts: unknown[] = [];
    const failedResponse = "FAILED_RESPONSE_BODY_".repeat(300);
    const firstError = `Failed to parse. Text: "${failedResponse}"\nError: Unterminated string at position 4096`;
    const retryError = `Failed to parse. Text: "${failedResponse}"\nError: Missing required field notes`;

    await expect(elementPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            throw new Error(prompts.length === 1 ? firstError : retryError);
          },
        };
      },
    })).rejects.toThrow(/element_planning failed after retry/i);

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("Unterminated string at position 4096");
    expect(String(prompts[1])).not.toContain("FAILED_RESPONSE_BODY_FAILED_RESPONSE_BODY");

    const manifest = await store.readManifest();
    const artifact = await store.readArtifact(manifest.artifacts.element_planning);
    expect(artifact.errors[0]).toContain("Failed to parse. Text");
    expect(artifact.errors[0]).toContain("Unterminated string at position 4096");
    expect(artifact.errors[0]).toContain("Missing required field notes");
  });
});

async function stateWithLayoutPlanning(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-element-"));
  const store = createArtifactStore({ runDir, threadId });
  let state: DesignAgentState = createInitialState(threadId);
  state = mergeState(state, await jsonPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await layoutPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await visualSlotReviewNode(state, { artifactStore: store }));
  return { store, state };
}

function mergeState(state: DesignAgentState, update: Partial<DesignAgentState>): DesignAgentState {
  return {
    ...state,
    ...update,
    latestArtifactRefs: update.latestArtifactRefs ?? state.latestArtifactRefs,
    events: update.events ?? state.events,
  };
}