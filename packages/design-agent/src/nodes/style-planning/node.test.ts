import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { elementPlanningNode } from "../element-planning/node.js";
import { interactionPlanningNode } from "../interaction-planning/node.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "../layout-planning/node.js";
import { visualSlotReviewNode } from "../visual-slot-review/node.js";
import { stylePlanningNode } from "./node.js";
import { stylePlanningModelOutputSchema, type StylePlan } from "./schema.js";

const stylePlan: StylePlan = {
  theme: "enterprise_light",
  tone: "quiet",
  assignments: [
    { elementId: "page_title", preset: "heading" },
    { elementId: "refresh_button", preset: "secondary_action" },
  ],
  notes: ["Use restrained enterprise styling."],
};

describe("stylePlanningNode", () => {
  it("stores the plan and compiles presets into the interaction document", async () => {
    const { store, state } = await stateWithInteractions("thread_style_1");
    const seenSchemas: unknown[] = [];

    const result = await stylePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ stylePlan }) };
      },
    });

    expect(seenSchemas).toEqual([stylePlanningModelOutputSchema]);
    const artifact = await store.readArtifact(result.latestArtifactRefs!.style_planning);
    expect(artifact).toMatchObject({
      node: "style_planning",
      status: "success",
      output: {
        stylePlan,
        document: {
          variables: {
            interactions: [expect.objectContaining({ id: "refresh_data" })],
            designTheme: { theme: "enterprise_light", tone: "quiet" },
          },
          elements: expect.arrayContaining([
            expect.objectContaining({
              id: "page_title",
              style: expect.objectContaining({
                text: expect.objectContaining({ role: "heading" }),
              }),
            }),
          ]),
        },
      },
      errors: [],
    });
  });

  it("retries an assignment that references a missing element", async () => {
    const { store, state } = await stateWithInteractions("thread_style_retry");
    const prompts: unknown[] = [];

    const result = await stylePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            if (prompts.length === 1) {
              return { stylePlan: { ...stylePlan, assignments: [{ elementId: "missing_element", preset: "heading" }] } };
            }
            return { stylePlan };
          },
        };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("previous style plan was rejected");
    const artifact = await store.readArtifact(result.latestArtifactRefs!.style_planning);
    expect(artifact.errors).toEqual([]);
  });

  it("repairs a type-incompatible preset without retrying the model", async () => {
    const { store, state } = await stateWithInteractions("thread_style_repair");
    let invocationCount = 0;

    const result = await stylePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke() {
            invocationCount += 1;
            return {
              stylePlan: {
                ...stylePlan,
                assignments: [{ elementId: "refresh_button", preset: "control" }],
              },
            };
          },
        };
      },
    });

    expect(invocationCount).toBe(1);
    const artifact = await store.readArtifact(result.latestArtifactRefs!.style_planning);
    expect(artifact).toMatchObject({
      status: "success",
      output: {
        stylePlan: {
          assignments: [{ elementId: "refresh_button", preset: "secondary_action" }],
          notes: expect.arrayContaining([
            expect.stringContaining("Replaced incompatible preset control"),
          ]),
        },
      },
      errors: [],
    });
  });

  it("persists a failed artifact and stops after both model attempts fail", async () => {
    const { store, state } = await stateWithInteractions("thread_style_failed");

    await expect(stylePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid style output"); } };
      },
    })).rejects.toThrow(/style_planning failed after retry/i);

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("failed");
    await expect(store.readArtifact(manifest.artifacts.style_planning)).resolves.toMatchObject({
      status: "failed",
      errors: [expect.stringContaining("Retry failed")],
      output: {
        stylePlan: null,
        document: { variables: { interactions: [expect.objectContaining({ id: "refresh_data" })] } },
      },
    });
  });
});

async function stateWithInteractions(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-style-"));
  const store = createArtifactStore({ runDir, threadId });
  let state: DesignAgentState = createInitialState(threadId);
  state = mergeState(state, await jsonPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await layoutPlanningNode(state, { artifactStore: store }));
  state = mergeState(state, await visualSlotReviewNode(state, { artifactStore: store }));
  state = mergeState(state, await elementPlanningNode(state, {
    artifactStore: store,
    createStructuredOutput() {
      return { invoke: () => ({
        elementPlan: {
          elements: [
            { id: "page_title", parentId: "header_section", order: 0, type: "text", name: "Title", purpose: "Identify page", content: "Dashboard", attributes: [] },
            { id: "refresh_button", parentId: "header_section", order: 1, type: "button", name: "Refresh", purpose: "Refresh data", content: "Refresh", attributes: [] },
          ],
          notes: [],
        },
      }) };
    },
  }));
  state = mergeState(state, await interactionPlanningNode(state, {
    artifactStore: store,
    createStructuredOutput() {
      return { invoke: () => ({ interactionPlan: {
        interactions: [{
          id: "refresh_data",
          sourceElementId: "refresh_button",
          event: "click",
          action: "refresh",
          description: "Refresh page data",
          payload: [],
        }],
        notes: [],
      } }) };
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