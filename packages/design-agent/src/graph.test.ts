import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createArtifactStore } from "./artifacts/store.js";
import type { IntentDimension } from "./state.js";
import { createDesignAgentGraph } from "./graph.js";
import { createInitialState } from "./state.js";

describe("design agent graph", () => {
  it("routes incomplete dimensions to question generation", async () => {
    const graph = createDesignAgentGraph();

    const result = await graph.invoke(createInitialState("thread_graph_1"));

    expect(result.stage).toBe("clarification");
    expect(result.currentNode).toBe("clarification");
    expect(result.completenessResult?.allComplete).toBe(false);
    expect(result.clarificationPlan?.questions.length).toBeGreaterThan(0);
    expect(result.pendingQuestionIds).toEqual(result.clarificationPlan?.questions.map((question) => question.id));
  });

  it("routes complete dimensions through intent compaction before completed", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-complete-"));
    const store = createArtifactStore({ runDir, threadId: "thread_graph_2" });
    const graph = createDesignAgentGraph({ artifactStore: store, createImageGeneration: generateTestImage });
    const state = createInitialState("thread_graph_2");
    const dimensions = state.dimensions.map((dimension): IntentDimension => ({
      ...dimension,
      status: "complete",
      completeness: 1,
      confidence: 0.9,
      value: { confirmed: true, key: dimension.key }
    }));

    const result = await graph.invoke({ ...state, dimensions });

    expect(result.stage).toBe("completed");
    expect(result.currentNode).toBe("completed");
    expect(result.completenessResult?.allComplete).toBe(true);
    expect(result.clarificationPlan).toBeUndefined();
    expect(result.pendingQuestionIds).toEqual([]);
    expect(result.latestArtifactRefs.intent_compaction).toBeDefined();
    expect(result.latestArtifactRefs.json_planning).toBeDefined();
    expect(result.latestArtifactRefs.layout_planning).toBeDefined();
    expect(result.latestArtifactRefs.visual_slot_review).toBeDefined();
    expect(result.latestArtifactRefs.element_planning).toBeDefined();
    expect(result.latestArtifactRefs.interaction_planning).toBeDefined();
    expect(result.latestArtifactRefs.style_planning).toBeDefined();
    expect(result.latestArtifactRefs.image_planning).toBeDefined();
    expect(result.latestArtifactRefs.document_assembly).toBeDefined();
    expect(result.latestArtifactRefs.image_generation).toBeDefined();
    expect(result.latestArtifactRefs.schema_validation).toBeDefined();
    expect(result.latestArtifactRefs.visual_review).toBeDefined();
    expect(result.latestArtifactRefs.final_output).toBeDefined();
    await expect(store.readArtifact(result.latestArtifactRefs.intent_compaction)).resolves.toMatchObject({
      node: "intent_compaction",
      status: "success",
      output: {
        dimensions: expect.arrayContaining([
          expect.objectContaining({ key: "page_context", value: { confirmed: true, key: "page_context" } })
        ])
      }
    });
    await expect(store.readArtifact(result.latestArtifactRefs.json_planning)).resolves.toMatchObject({
      node: "json_planning",
      status: "success",
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          canvas: { viewport: "desktop" }
        }
      }
    });
    await expect(store.readArtifact(result.latestArtifactRefs.image_planning)).resolves.toMatchObject({
      node: "image_planning",
      status: "success",
      output: {
        visualAssetPlan: {
          imagePolicy: "required",
          minimumGeneratedAssets: 3,
          assets: expect.arrayContaining([
            expect.objectContaining({ kind: "background_image" }),
            expect.objectContaining({ kind: "content_image" }),
          ]),
        },
      },
    });
    await expect(store.readArtifact(result.latestArtifactRefs.visual_slot_review)).resolves.toMatchObject({
      node: "visual_slot_review",
      status: "success",
      inputRefs: [result.latestArtifactRefs.layout_planning],
      output: { document: { schemaVersion: "fm-design/v1" }, issues: [] },
    });
    await expect(store.readArtifact(result.latestArtifactRefs.element_planning)).resolves.toMatchObject({
      inputRefs: [result.latestArtifactRefs.visual_slot_review],
    });    await expect(store.readArtifact(result.latestArtifactRefs.document_assembly)).resolves.toMatchObject({
      node: "document_assembly",
      status: "success",
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          variables: {
            agentPlanning: expect.any(Object)
          }
        }
      }
    });
    await expect(store.readArtifact(result.latestArtifactRefs.image_generation)).resolves.toMatchObject({
      node: "image_generation",
      status: "success",
      output: {
        document: {
          schemaVersion: "fm-design/v1"
        },
        images: expect.any(Array)
      }
    });
    await expect(store.readArtifact(result.latestArtifactRefs.schema_validation)).resolves.toMatchObject({
      node: "schema_validation",
      status: "success",
      output: { valid: true }
    });
    await expect(store.readArtifact(result.latestArtifactRefs.visual_review)).resolves.toMatchObject({
      node: "visual_review",
      status: "success",
      output: { review: expect.objectContaining({ issues: expect.any(Array), score: expect.any(Number) }) },
    });
    await expect(store.readArtifact(result.latestArtifactRefs.final_output)).resolves.toMatchObject({
      node: "final_output",
      status: "success",
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          variables: {
            agentPlanning: expect.objectContaining({
              visualSlotReview: expect.any(Object),
              visualAssetPlan: expect.any(Object),
            }),
          },
        },
      },
    });
  }, 10000);



  it("continues planning when remaining incomplete dimensions reached the question limit", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-question-limit-"));
    const store = createArtifactStore({ runDir, threadId: "thread_graph_question_limit" });
    const graph = createDesignAgentGraph({ artifactStore: store, createImageGeneration: generateTestImage });
    const state = createInitialState("thread_graph_question_limit");
    const dimensions = state.dimensions.map((dimension): IntentDimension =>
      dimension.key === "page_context"
        ? {
            ...dimension,
            status: "partial",
            completeness: 0.6,
            confidence: 0.7,
            value: { pageType: "customer page" },
            missingFields: ["business goal"],
            questionsAsked: ["Question 1", "Question 2"],
          }
        : {
            ...dimension,
            status: "complete",
            completeness: 1,
            confidence: 0.9,
            value: { confirmed: true, key: dimension.key },
          },
    );

    const result = await graph.invoke({ ...state, dimensions });

    expect(result.stage).toBe("completed");
    expect(result.latestArtifactRefs.question_generation).toBeDefined();
    expect(result.latestArtifactRefs.intent_compaction).toBeDefined();
    await expect(store.readArtifact(result.latestArtifactRefs.question_generation)).resolves.toMatchObject({
      node: "question_generation",
      status: "success",
      output: { questions: [] },
    });
  }, 15000);
  it("repairs an invalid document and continues to final output", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-repair-loop-"));
    const store = createArtifactStore({ runDir, threadId: "thread_graph_4" });
    const invalidRepairRef = await store.writeArtifact({
      node: "document_repair",
      status: "success",
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
      },
      errors: [],
    });
    const graph = createDesignAgentGraph({ artifactStore: store, createImageGeneration: generateTestImage });
    const state = createInitialState("thread_graph_4");
    const dimensions = state.dimensions.map((dimension): IntentDimension => ({
      ...dimension,
      status: "complete",
      completeness: 1,
      confidence: 0.9,
      value: { confirmed: true, key: dimension.key }
    }));

    const result = await graph.invoke({
      ...state,
      dimensions,
      latestArtifactRefs: { document_repair: invalidRepairRef },
    });

    expect(result.stage).toBe("completed");
    expect(result.currentNode).toBe("completed");
    expect(result.repairAttempts).toBeGreaterThanOrEqual(1);
    expect(result.validationErrors).toEqual(expect.any(Array));
    expect(result.latestArtifactRefs.reflection_repair).toBeDefined();
    expect(result.latestArtifactRefs.document_repair).toBeDefined();
    expect(result.latestArtifactRefs.final_output).toBeDefined();
    await expect(store.readArtifact(result.latestArtifactRefs.reflection_repair)).resolves.toMatchObject({
      node: "reflection_repair",
      status: "failed",
      output: {
        repairPlan: expect.any(Object),
      },
    });
    await expect(store.readArtifact(result.latestArtifactRefs.document_repair)).resolves.toMatchObject({
      node: "document_repair",
      status: "success",
      output: {
        repaired: true,
      },
    });
    await expect(store.readArtifact(result.latestArtifactRefs.image_generation)).resolves.toMatchObject({
      node: "image_generation",
      status: "success",
      output: {
        document: {
          schemaVersion: "fm-design/v1"
        },
        images: expect.any(Array)
      }
    });
    await expect(store.readArtifact(result.latestArtifactRefs.schema_validation)).resolves.toMatchObject({
      node: "schema_validation",
      status: "success",
      output: { valid: true },
    });
  }, 15000);

  it("writes node outputs to the artifact blackboard when a store is provided", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-graph-"));
    const store = createArtifactStore({ runDir, threadId: "thread_graph_3" });
    const graph = createDesignAgentGraph({ artifactStore: store, createImageGeneration: generateTestImage });

    const result = await graph.invoke(createInitialState("thread_graph_3"));

    const intentRef = result.latestArtifactRefs.intent_recognition;
    const completenessRef = result.latestArtifactRefs.completeness_check;
    const questionRef = result.latestArtifactRefs.question_generation;
    const clarificationRef = result.latestArtifactRefs.clarification;

    expect(intentRef).toBeDefined();
    expect(completenessRef).toBeDefined();
    expect(questionRef).toBeDefined();
    expect(clarificationRef).toBeDefined();
    await expect(store.readArtifact(intentRef)).resolves.toMatchObject({
      node: "intent_recognition",
      status: "success"
    });
    await expect(store.readArtifact(completenessRef)).resolves.toMatchObject({
      node: "completeness_check",
      output: {
        allComplete: false
      }
    });
    await expect(store.readArtifact(questionRef)).resolves.toMatchObject({
      node: "question_generation",
      status: "success"
    });
    await expect(store.readArtifact(clarificationRef)).resolves.toMatchObject({
      node: "clarification",
      status: "needs_input"
    });

    const manifest = await store.readManifest();
    expect(manifest.artifacts.intent_recognition?.path).toBe(intentRef.path);
    expect(manifest.artifacts.completeness_check?.path).toBe(completenessRef.path);
    expect(manifest.artifacts.question_generation?.path).toBe(questionRef.path);
    expect(manifest.artifacts.clarification?.path).toBe(clarificationRef.path);
  });
});

function generateTestImage(request: import("./nodes/types.js").ImageGenerationRequest) {
  return {
    url: `https://cdn.example.com/graph/${request.assetId}.png`,
    provider: "test",
    model: "graph-fixture",
  };
}