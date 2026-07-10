import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { elementPlanningNode } from "../element-planning/node.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "../layout-planning/node.js";
import { visualSlotReviewNode } from "../visual-slot-review/node.js";
import { interactionPlanningNode } from "./node.js";
import { interactionPlanningModelOutputSchema, type InteractionPlan } from "./schema.js";

const interactionPlan: InteractionPlan = {
  interactions: [{
    id: "refresh_monitoring_data",
    sourceElementId: "refresh_button",
    event: "click",
    action: "refresh",
    targetElementId: "monitoring_table",
    description: "Refresh monitoring data",
    payload: [{ key: "scope", value: "current-region" }],
  }],
  notes: [],
};

describe("interactionPlanningNode", () => {
  it("stores the plan and compiles interactions into document variables", async () => {
    const { store, state } = await stateWithElements("thread_interaction_1");
    const seenSchemas: unknown[] = [];

    const result = await interactionPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ interactionPlan }) };
      },
    });

    expect(seenSchemas).toEqual([interactionPlanningModelOutputSchema]);
    const artifact = await store.readArtifact(result.latestArtifactRefs!.interaction_planning);
    expect(artifact).toMatchObject({
      node: "interaction_planning",
      status: "success",
      output: {
        interactionPlan,
        document: {
          variables: {
            interactions: [expect.objectContaining({ id: "refresh_monitoring_data" })],
          },
        },
      },
      errors: [],
    });
  });

  it("retries a plan with invalid element references", async () => {
    const { store, state } = await stateWithElements("thread_interaction_retry");
    const prompts: unknown[] = [];

    const result = await interactionPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            if (prompts.length === 1) {
              return { interactionPlan: { ...interactionPlan, interactions: [{ ...interactionPlan.interactions[0], sourceElementId: "missing" }] } };
            }
            return { interactionPlan };
          },
        };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("previous interaction plan was rejected");
    const artifact = await store.readArtifact(result.latestArtifactRefs!.interaction_planning);
    expect(artifact.errors).toEqual([]);
  });

  it("persists a failed artifact and stops after both model attempts fail", async () => {
    const { store, state } = await stateWithElements("thread_interaction_failed");

    await expect(interactionPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid interaction output"); } };
      },
    })).rejects.toThrow(/interaction_planning failed after retry/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    await expect(store.readArtifact(manifest.artifacts.interaction_planning)).resolves.toMatchObject({
      status: "failed",
      errors: [expect.stringContaining("Retry failed")],
      output: {
        interactionPlan: null,
        document: { elements: expect.arrayContaining([expect.objectContaining({ id: "refresh_button" })]) },
      },
    });
  });
});

async function stateWithElements(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-interaction-"));
  const store = createArtifactStore({ runDir, threadId });
  let state: DesignAgentState = createInitialState(threadId);
  state = mergeState(state, await jsonPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await layoutPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await visualSlotReviewNode(state, { artifactStore: store }));
  state = mergeState(state, await elementPlanningNode(state, {
    artifactStore: store,
    createStructuredOutput() {
      return {
        invoke: () => ({
          elementPlan: {
            elements: [
              { id: "refresh_button", parentId: "main_section", order: 0, type: "button", name: "Refresh", purpose: "Refresh data", content: "Refresh", attributes: [] },
              { id: "monitoring_table", parentId: "main_section", order: 1, type: "table", name: "Monitoring Table", purpose: "Show results", attributes: [] },
            ],
            notes: [],
          },
        }),
      };
    },
  }));
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
