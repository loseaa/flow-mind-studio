import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { compileSemanticElementPlan } from "../element-planning/compiler.js";
import type { SemanticElementPlan } from "../element-planning/schema.js";
import { compileInteractionPlan } from "../interaction-planning/compiler.js";
import type { InteractionPlan } from "../interaction-planning/schema.js";
import { compilePageStructurePlan } from "../json-planning/compiler.js";
import type { PageStructurePlan } from "../json-planning/schema.js";
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
    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.style_planning);
    expect(artifact).toMatchObject({
      node: "style_planning",
      status: "success",
      output: {
        stylePlan: {
          theme: "enterprise_light",
          tone: "quiet",
          assignments: expect.arrayContaining(stylePlan.assignments),
          notes: expect.arrayContaining(stylePlan.notes),
        },
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

  it("removes an assignment that references a missing element and fills coverage", async () => {
    const { store, state } = await stateWithInteractions("thread_style_retry");
    const prompts: unknown[] = [];

    const result = await stylePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            return { stylePlan: { ...stylePlan, assignments: [{ elementId: "missing_element", preset: "heading" }] } };
          },
        };
      },
    });

    expect(prompts).toHaveLength(1);
    const artifact = await store.readArtifact<any>(result.latestArtifactRefs!.style_planning);
    expect(artifact.errors).toEqual([]);
    expect(artifact.output.stylePlan.assignments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ elementId: "missing_element" }),
    ]));
    expect(artifact.output.stylePlan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ elementId: "page_title", preset: "heading" }),
    ]));
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
          assignments: expect.arrayContaining([{ elementId: "refresh_button", preset: "secondary_action" }]),
          notes: expect.arrayContaining([
            expect.stringContaining("Replaced incompatible preset control"),
          ]),
        },
      },
      errors: [],
    });
  });

  it("uses deterministic styles after both model attempts fail", async () => {
    const { store, state } = await stateWithInteractions("thread_style_failed");

    const result = await stylePlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke: () => { throw new Error("Invalid style output"); } };
      },
    });

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("running");
    await expect(store.readArtifact(result.latestArtifactRefs!.style_planning)).resolves.toMatchObject({
      status: "success",
      errors: [expect.stringContaining("Retry failed")],
      output: {
        stylePlan: { theme: "neutral_workspace", tone: "operational" },
        document: { variables: { interactions: [expect.objectContaining({ id: "refresh_data" })] } },
      },
    });
  });
});

async function stateWithInteractions(threadId: string) {
  const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-style-"));
  const store = createArtifactStore({ runDir, threadId });
  const structurePlan: PageStructurePlan = {
    document: {
      id: "style_fixture",
      name: "Style fixture",
      viewport: "desktop",
      width: 1440,
      background: "muted",
    },
    nodes: [
      { id: "page_root", parentId: null, order: 0, type: "page", name: "Page", purpose: "Test page" },
      { id: "header_section", parentId: "page_root", order: 0, type: "section", name: "Header", purpose: "Test header" },
    ],
  };
  const elementPlan: SemanticElementPlan = {
    elements: [
      { id: "page_title", parentId: "header_section", order: 0, type: "text", name: "Title", purpose: "Identify page", content: "Dashboard", attributes: [] },
      { id: "refresh_button", parentId: "header_section", order: 1, type: "button", name: "Refresh", purpose: "Refresh data", content: "Refresh", attributes: [] },
    ],
    notes: [],
  };
  const interactionPlan: InteractionPlan = {
    interactions: [{
      id: "refresh_data",
      sourceElementId: "refresh_button",
      event: "click",
      action: "refresh",
      description: "Refresh page data",
      payload: [],
    }],
    notes: [],
  };
  const elementDocument = compileSemanticElementPlan(compilePageStructurePlan(structurePlan), elementPlan);
  const document = compileInteractionPlan(elementDocument, interactionPlan);
  const artifactRef = await store.writeArtifact({
    node: "interaction_planning",
    status: "success",
    inputRefs: [],
    output: { interactionPlan, document },
    errors: [],
  });
  const state: DesignAgentState = {
    ...createInitialState(threadId),
    latestArtifactRefs: { interaction_planning: artifactRef },
  };
  return { store, state };
}
