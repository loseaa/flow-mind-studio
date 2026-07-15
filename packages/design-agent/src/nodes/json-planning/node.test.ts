import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { jsonPlanningNode } from "./node.js";
import { jsonPlanningModelOutputSchema } from "./schema.js";

describe("jsonPlanningNode", () => {
  it("stores the model structure plan and its compiled compatibility document", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-json-planning-"));
    const store = createArtifactStore({ runDir, threadId: "thread_json_planning_1" });
    const state = createInitialState("thread_json_planning_1");
    const seenSchemas: unknown[] = [];
    const structurePlan = minimalStructurePlan("model_planned_page", "Model Planned Page");

    const result = await jsonPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput(schema) {
        seenSchemas.push(schema);
        return { invoke: () => ({ structurePlan }) };
      },
    });

    expect(seenSchemas).toEqual([jsonPlanningModelOutputSchema]);
    const jsonRef = result.latestArtifactRefs?.json_planning;
    expect(jsonRef).toBeDefined();
    await expect(store.readArtifact(jsonRef!)).resolves.toMatchObject({
      node: "json_planning",
      status: "success",
      output: {
        structurePlan,
        document: {
          id: "model_planned_page",
          name: "Model Planned Page",
          schemaVersion: "fm-design/v1",
        },
      },
      errors: [],
    });
  });

  it("uses the deterministic structure when both model attempts fail", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-json-planning-failed-"));
    const store = createArtifactStore({ runDir, threadId: "thread_json_planning_2" });
    const state = createInitialState("thread_json_planning_2");

    const result = await jsonPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return { invoke() { throw new Error("Failed to parse model structure plan"); } };
      },
    });

    const manifest = await store.readManifest();
    expect(manifest.status).toBe("running");
    expect(manifest.currentNode).toBe("json_planning");
    expect(result.currentNode).toBe("json_planning");
    await expect(store.readArtifact(manifest.artifacts.json_planning!)).resolves.toMatchObject({
      status: "success",
      output: {
        structurePlan: { document: { id: "design_generated_page" } },
        document: { id: "design_generated_page", schemaVersion: "fm-design/v1" },
      },
      errors: [expect.stringContaining("Retry failed")],
    });
  });

  it("normalizes top-level model nodes and supplies document metadata", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-json-planning-normalized-"));
    const store = createArtifactStore({ runDir, threadId: "thread_json_planning_normalized" });
    const state = createInitialState("thread_json_planning_normalized");

    const result = await jsonPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke: () => ({
            nodes: [
              { id: "phone_page", parentId: null, order: 0, type: "page", name: "手机新品页", purpose: "产品推广" },
              { id: "hero", parentId: "phone_page", order: 0, type: "section", name: "首屏", purpose: "展示产品" },
            ],
          }),
        };
      },
    });

    const jsonRef = result.latestArtifactRefs?.json_planning;
    expect(jsonRef).toBeDefined();
    await expect(store.readArtifact(jsonRef!)).resolves.toMatchObject({
      output: {
        structurePlan: {
          document: {
            id: "phone_page",
            name: "手机新品页",
            viewport: "desktop",
            width: 1440,
            background: "muted",
          },
        },
        document: { id: "phone_page", name: "手机新品页" },
      },
      errors: [],
    });
  });

  it("retries structure generation after an invalid first response", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-json-planning-retry-"));
    const store = createArtifactStore({ runDir, threadId: "thread_json_planning_retry" });
    const state = createInitialState("thread_json_planning_retry");
    const prompts: unknown[] = [];
    const structurePlan = minimalStructurePlan("retried_model_page", "Retried Model Page");

    const result = await jsonPlanningNode(state, {
      artifactStore: store,
      createStructuredOutput() {
        return {
          invoke(input) {
            prompts.push(input);
            if (prompts.length === 1) throw new Error("parentId references are invalid");
            return { structurePlan };
          },
        };
      },
    });

    expect(prompts).toHaveLength(2);
    expect(String(prompts[1])).toContain("previous generation was rejected");
    const jsonRef = result.latestArtifactRefs?.json_planning;
    expect(jsonRef).toBeDefined();
    await expect(store.readArtifact(jsonRef!)).resolves.toMatchObject({
      output: {
        structurePlan,
        document: {
          id: "retried_model_page",
          name: "Retried Model Page",
        },
      },
      errors: [],
    });
  });
});

function minimalStructurePlan(id: string, name: string) {
  return {
    document: {
      id,
      name,
      viewport: "desktop",
      width: 1440,
      background: "muted",
    },
    nodes: [
      {
        id: "page_root",
        parentId: null,
        order: 0,
        type: "page",
        name: "Page",
        purpose: "Application root",
      },
      {
        id: "main_section",
        parentId: "page_root",
        order: 0,
        type: "section",
        name: "Main Section",
        purpose: "Primary content",
      },
    ],
  };
}
