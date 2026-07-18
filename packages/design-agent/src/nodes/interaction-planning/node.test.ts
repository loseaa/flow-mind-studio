import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { compileSemanticElementPlan } from "../element-planning/compiler.js";
import type { SemanticElementPlan } from "../element-planning/schema.js";
import { compilePageStructurePlan } from "../json-planning/compiler.js";
import type { PageStructurePlan } from "../json-planning/schema.js";
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

  it("uses the deterministic plan after both model attempts fail", async () => {
    const { store, state } = await stateWithElements("thread_interaction_failed");

    const result = await interactionPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid interaction output"); } };
      },
    });

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("running");
    await expect(store.readArtifact(result.latestArtifactRefs!.interaction_planning)).resolves.toMatchObject({
      status: "success",
      errors: [expect.stringContaining("Retry failed")],
      output: {
        interactionPlan: { interactions: [] },
        document: { elements: expect.arrayContaining([expect.objectContaining({ id: "refresh_button" })]) },
      },
    });
  });

  it("normalizes a single trigger-based business interaction", async () => {
    const { store, state } = await stateWithElements("thread_interaction_normalized");

    const result = await interactionPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => ({ interactionPlan: {
          id: "start_trial",
          sourceElementId: "refresh_button",
          targetElementId: null,
          trigger: "click",
          action: "startTrial",
          description: "Start a free trial",
        } }) };
      },
    });

    const artifact = await store.readArtifact(result.latestArtifactRefs!.interaction_planning);
    expect(artifact).toMatchObject({
      status: "success",
      output: { interactionPlan: { interactions: [{
        id: "start_trial",
        event: "click",
        action: "submit",
        payload: [],
      }] } },
      errors: [],
    });
  });
});

async function stateWithElements(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-interaction-"));
  const store = createArtifactStore({ runDir, threadId });
  const structurePlan: PageStructurePlan = {
    document: {
      id: "interaction_fixture",
      name: "Interaction fixture",
      viewport: "desktop",
      width: 1440,
      background: "muted",
    },
    nodes: [
      { id: "page_root", parentId: null, order: 0, type: "page", name: "Page", purpose: "Test page" },
      { id: "main_section", parentId: "page_root", order: 0, type: "section", name: "Main", purpose: "Test content" },
    ],
  };
  const elementPlan: SemanticElementPlan = {
    elements: [
      { id: "refresh_button", parentId: "main_section", order: 0, type: "button", name: "Refresh", purpose: "Refresh data", content: "Refresh", attributes: [] },
      { id: "monitoring_table", parentId: "main_section", order: 1, type: "table", name: "Monitoring Table", purpose: "Show results", attributes: [] },
    ],
    notes: [],
  };
  const document = compileSemanticElementPlan(compilePageStructurePlan(structurePlan), elementPlan);
  const artifactRef = await store.writeArtifact({
    node: "element_planning",
    status: "success",
    inputRefs: [],
    output: { elementPlan, document },
    errors: [],
  });
  const state: DesignAgentState = {
    ...createInitialState(threadId),
    latestArtifactRefs: { element_planning: artifactRef },
  };
  return { store, state };
}
