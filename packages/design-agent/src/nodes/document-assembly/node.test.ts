import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState, type DesignAgentState } from "../../state.js";
import { elementPlanningNode } from "../element-planning/node.js";
import { imagePlanningNode } from "../image-planning/node.js";
import { interactionPlanningNode } from "../interaction-planning/node.js";
import { jsonPlanningNode } from "../json-planning/node.js";
import { layoutPlanningNode } from "../layout-planning/node.js";
import { stylePlanningNode } from "../style-planning/node.js";
import { visualSlotReviewNode } from "../visual-slot-review/node.js";
import { documentAssemblyNode } from "./node.js";

describe("documentAssemblyNode", () => {
  it("assembles the document and records source artifact refs", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-assembly-"));
    const store = createArtifactStore({ runDir, threadId: "thread_assembly_1" });
    const state = createInitialState("thread_assembly_1");

    const jsonUpdate = await jsonPlanningNode(state, { artifactStore: store });
    const stateWithJson = mergeState(state, jsonUpdate);
    const layoutUpdate = await layoutPlanningNode(stateWithJson, { artifactStore: store });
    const stateWithLayout = mergeState(stateWithJson, layoutUpdate);
    const visualSlotUpdate = await visualSlotReviewNode(stateWithLayout, { artifactStore: store });
    const stateWithVisualSlot = mergeState(stateWithLayout, visualSlotUpdate);
    const elementUpdate = await elementPlanningNode(stateWithVisualSlot, { artifactStore: store });
    const stateWithElement = mergeState(stateWithVisualSlot, elementUpdate);
    const interactionUpdate = await interactionPlanningNode(stateWithElement, { artifactStore: store });
    const stateWithInteraction = mergeState(stateWithElement, interactionUpdate);
    const styleUpdate = await stylePlanningNode(stateWithInteraction, { artifactStore: store });
    const stateWithStyle = mergeState(stateWithInteraction, styleUpdate);
    const imageUpdate = await imagePlanningNode(stateWithStyle, { artifactStore: store });
    const stateWithImage = mergeState(stateWithStyle, imageUpdate);

    const result = await documentAssemblyNode(stateWithImage, { artifactStore: store });

    const assemblyRef = result.latestArtifactRefs?.document_assembly;
    expect(assemblyRef).toBeDefined();
    await expect(store.readArtifact(assemblyRef!)).resolves.toMatchObject({
      node: "document_assembly",
      status: "success",
      inputRefs: [
        expect.objectContaining({ node: "json_planning" }),
        expect.objectContaining({ node: "layout_planning" }),
        expect.objectContaining({ node: "visual_slot_review" }),
        expect.objectContaining({ node: "element_planning" }),
        expect.objectContaining({ node: "interaction_planning" }),
        expect.objectContaining({ node: "style_planning" }),
        expect.objectContaining({ node: "image_planning" }),
      ],
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          elements: expect.arrayContaining([
            expect.objectContaining({ type: "image", props: expect.objectContaining({ imageSlotId: expect.any(String), imageSlot: expect.any(Object) }) }),
          ]),
          variables: {
            visualAssets: expect.any(Object),
            agentPlanning: {
              visualSlotReview: expect.objectContaining({ layoutPlan: expect.any(Object) }),
              visualAssetPlan: expect.objectContaining({ imagePolicy: "required", minimumGeneratedAssets: 3 }),
            },
          },
        },
        sourcePlans: {
          structurePlanning: expect.any(Object),
          layoutPlanning: expect.any(Object),
          visualSlotReview: expect.objectContaining({ layoutPlan: expect.any(Object) }),
          elementPlanning: expect.any(Object),
          interactionPlanning: expect.any(Object),
          stylePlanning: expect.any(Object),
          imagePlanning: expect.objectContaining({ imagePolicy: "required", minimumGeneratedAssets: 3 }),
        },
        sourceArtifacts: {
          structurePlanning: expect.objectContaining({ node: "json_planning" }),
          layoutPlanning: expect.objectContaining({ node: "layout_planning" }),
          visualSlotReview: expect.objectContaining({ node: "visual_slot_review" }),
          elementPlanning: expect.objectContaining({ node: "element_planning" }),
          interactionPlanning: expect.objectContaining({ node: "interaction_planning" }),
          stylePlanning: expect.objectContaining({ node: "style_planning" }),
          imagePlanning: expect.objectContaining({ node: "image_planning" }),
        },
      },
    });
  });
});

function mergeState(state: DesignAgentState, update: Partial<DesignAgentState>): DesignAgentState {
  return {
    ...state,
    ...update,
    latestArtifactRefs: update.latestArtifactRefs ?? state.latestArtifactRefs,
    events: update.events ?? state.events,
  };
}