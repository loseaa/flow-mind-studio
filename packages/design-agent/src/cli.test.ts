import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCliArgs, runDesignAgentCli } from "./cli.js";
import { createArtifactStore } from "./artifacts/store.js";
import { elementPlanningModelOutputSchema } from "./nodes/element-planning/schema.js";
import { jsonPlanningModelOutputSchema } from "./nodes/json-planning/schema.js";
import { layoutPlanningModelOutputSchema } from "./nodes/layout-planning/schema.js";
import { intentRecognitionOutputSchema } from "./nodes/intent-recognition/schema.js";
import { interactionPlanningModelOutputSchema } from "./nodes/interaction-planning/schema.js";
import { imagePlanningModelOutputSchema } from "./nodes/image-planning/schema.js";
import { questionGenerationOutputSchema } from "./nodes/question-generation/schema.js";
import { stylePlanningModelOutputSchema } from "./nodes/style-planning/schema.js";
import { visualReviewModelOutputSchema } from "./nodes/visual-review/schema.js";
import { intentDimensionKeys } from "./state.js";

describe("design agent cli", () => {
  it("parses legacy and subcommand arguments", () => {
    expect(parseCliArgs(["--message", "make a customer list"]).out).toContain(
      "packages/design-agent/artifacts/runs/run-",
    );
    expect(parseCliArgs(["run", "--message", "make a customer list", "--out", "tmp/run", "--fixture", "complete"])).toEqual({
      command: "run",
      message: "make a customer list",
      out: "tmp/run",
      answer: undefined,
      fixture: "complete",
      node: undefined,
    });
    expect(parseCliArgs(["resume", "--answer", "customer list page", "--run", "tmp/run"])).toEqual({
      command: "resume",
      message: undefined,
      out: "tmp/run",
      answer: "customer list page",
      fixture: undefined,
      node: undefined,
    });
    expect(parseCliArgs(["continue", "--run", "tmp/run", "--node", "image_planning"])).toEqual({
      command: "continue",
      message: undefined,
      out: "tmp/run",
      answer: undefined,
      fixture: undefined,
      node: "image_planning",
    });
    expect(parseCliArgs(["run", "--message", "make a customer list", "--out", "tmp/run", "--no-interactive"])).toMatchObject({
      command: "run",
      message: "make a customer list",
      out: "tmp/run",
      noInteractive: true,
    });    expect(parseCliArgs(["inspect", "--run", "tmp/run", "--node", "json_planning"])).toEqual({
      command: "inspect",
      message: undefined,
      out: "tmp/run",
      answer: undefined,
      fixture: undefined,
      node: "json_planning",
    });
  });

  it("runs the graph and writes clarification artifacts", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-"));
    const output: string[] = [];

    const result = await runDesignAgentCli(
      ["run", "--message", "make a customer management list page", "--out", runDir],
      { write: (line) => output.push(line) },
      { envFilePath: false },
    );

    expect(result.stage).toBe("clarification");
    expect(result.latestArtifactRefs.clarification).toBeDefined();
    expect(output.join("\n")).toContain("Clarification required");
    expect(output.join("\n")).toContain("1.");
    expect(output.join("\n")).not.toContain("Artifacts:");
    expect(output.join("\n")).not.toContain("- intent_recognition v1:");

    const raw = await readFile(result.latestArtifactRefs.clarification.path, "utf8");
    expect(raw).toContain('"node": "clarification"');
  });

  it("passes a configured structured output factory into the graph", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-"));
    const output: string[] = [];
    const createStructuredOutput = (schema: unknown) => {
      return {
        async invoke() {
          if (schema === intentRecognitionOutputSchema) {
            return {
              updates: [
                {
                  key: "page_context",
                  status: "partial",
                  completeness: 0.5,
                  confidence: 0.8,
                  value: { pageType: "customer list page" },
                  evidence: ["customer list page"],
                  missingFields: ["business goal"],
                  assumptions: [],
                },
              ],
            };
          }
          expect(schema).toBe(questionGenerationOutputSchema);
          return {
            reason: "model generated",
            questions: [
              {
                id: "q_model",
                dimensionKey: "page_context",
                question: "Which role will use this page?",
                options: [],
                expectedAnswerShape: "free_text",
              },
            ],
          };
        },
      };
    };

    const result = await runDesignAgentCli(
      ["--message", "make a customer management list page", "--out", runDir],
      { write: (line) => output.push(line) },
      { createStructuredOutput, envFilePath: false },
    );

    expect(result.clarificationPlan?.questions[0]?.question).toBe("Which role will use this page?");
    expect(output.join("\n")).toContain("Which role will use this page?");
  });

  it("runs a complete fixture flow for local debugging", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-fixture-"));
    const output: string[] = [];

    const result = await runDesignAgentCli(
      ["run", "--message", "complete material orchestration dashboard", "--out", runDir, "--fixture", "complete"],
      { write: (line) => output.push(line) },
      { envFilePath: false },
    );

    expect(result.stage).toBe("completed");
    expect(result.latestArtifactRefs.final_output).toBeDefined();
    expect(output.join("\n")).not.toContain("Artifacts:");
    expect(output.join("\n")).toContain("Step: intent_recognition");
    expect(output.join("\n")).toContain("Step: image_planning - 图片规划");
    expect(output.join("\n")).toContain("Step: final_output");
    expect(output.join("\n")).toContain("Final artifact:");

    const planningRaw = await readFile(result.latestArtifactRefs.json_planning.path, "utf8");
    const planningArtifact = JSON.parse(planningRaw) as {
      errors: string[];
      output: { structurePlan?: { nodes: unknown[] } };
    };
    expect(planningArtifact.errors).toEqual([]);
    expect(planningArtifact.output.structurePlan?.nodes.length).toBeGreaterThan(0);
    const elementRaw = await readFile(result.latestArtifactRefs.element_planning.path, "utf8");
    const elementArtifact = JSON.parse(elementRaw) as {
      errors: string[];
      output: { document: { elements: Array<{ id: string }> } };
    };
    expect(elementArtifact.errors).toEqual([]);
    expect(elementArtifact.output.document.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "title_main" })]),
    );
    const imageRaw = await readFile(result.latestArtifactRefs.image_generation.path, "utf8");
    const imageArtifact = JSON.parse(imageRaw) as {
      output: { generatedCount: number; minimumGeneratedAssets: number; images: Array<{ assetId: string; kind: string }> };
    };
    expect(imageArtifact.output.generatedCount).toBe(3);
    expect(imageArtifact.output.minimumGeneratedAssets).toBe(3);
    expect(imageArtifact.output.images).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "background_image" }),
      expect.objectContaining({ kind: "content_image" }),
    ]));
  }, 15000);

  it("continues a failed run from a persisted pipeline node", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-continue-"));
    await runDesignAgentCli(
      ["run", "--message", "complete material orchestration dashboard", "--out", runDir, "--fixture", "complete"],
      { write: () => undefined },
      { envFilePath: false },
    );
    const store = createArtifactStore({ runDir, threadId: basename(runDir) });
    const manifest = await store.readManifest();
    await store.writeArtifact({
      node: "image_planning",
      status: "failed",
      inputRefs: [manifest.artifacts.style_planning],
      output: { visualAssetPlan: null },
      errors: ["Content image target must reference an image element: page_root"],
    });

    const result = await runDesignAgentCli(
      ["continue", "--run", runDir, "--node", "image_planning", "--fixture", "complete"],
      { write: () => undefined },
      { envFilePath: false },
    );

    expect(result.stage).toBe("completed");
    expect(result.latestArtifactRefs.image_planning.version).toBeGreaterThan(2);
    await expect(store.readManifest()).resolves.toMatchObject({ status: "completed" });
  }, 15000);

  it("saves a clarification answer artifact and resumes the graph", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-"));
    await runDesignAgentCli(
      ["--message", "make a customer management list page", "--out", runDir],
      { write: () => undefined },
      { envFilePath: false },
    );

    const output: string[] = [];
    const result = await runDesignAgentCli(
      ["resume", "--answer", "customer list page for operators with filters and table", "--run", runDir],
      { write: (line) => output.push(line) },
      { envFilePath: false },
    );

    expect(result.latestArtifactRefs.clarification_answer).toBeDefined();
    expect(result.latestArtifactRefs.intent_recognition?.version).toBe(2);
    expect(result.stage).toBe("clarification");
    expect(output.join("\n")).toContain("Clarification answer saved");
    expect(output.join("\n")).toContain("Clarification required");

    const raw = await readFile(result.latestArtifactRefs.clarification_answer.path, "utf8");
    expect(raw).toContain('"node": "clarification_answer"');
    expect(raw).toContain("customer list page");

    const manifest = JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8")) as {
      artifacts: Record<string, { version: number }>;
    };
    expect(manifest.artifacts.clarification_answer.version).toBe(1);
    expect(manifest.artifacts.intent_recognition.version).toBe(2);
  });


  it("restores questionsAsked when resuming a clarification run", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-resume-memory-"));
    const askedQuestion = "Which role will use this page?";
    const intentInputs: string[] = [];
    const createStructuredOutput = (schema: unknown) => ({
      invoke(input: unknown) {
        if (schema === intentRecognitionOutputSchema) {
          intentInputs.push(String(input));
          return {
            updates: [
              {
                key: "page_context",
                status: "partial",
                completeness: 0.5,
                confidence: 0.8,
                value: { pageType: "customer list page" },
                evidence: ["customer list page"],
                missingFields: ["business goal"],
                assumptions: [],
              },
            ],
          };
        }
        expect(schema).toBe(questionGenerationOutputSchema);
        return {
          reason: "model generated",
          questions: [
            {
              id: "q_model",
              dimensionKey: "page_context",
              question: askedQuestion,
              options: [],
              expectedAnswerShape: "free_text",
            },
          ],
        };
      },
    });

    await runDesignAgentCli(
      ["run", "--message", "make a customer page", "--out", runDir, "--no-interactive"],
      { write: () => undefined },
      { createStructuredOutput, envFilePath: false },
    );
    await runDesignAgentCli(
      ["resume", "--answer", "operators", "--run", runDir, "--no-interactive"],
      { write: () => undefined },
      { createStructuredOutput, envFilePath: false },
    );

    expect(intentInputs).toHaveLength(2);
    expect(intentInputs[1]).toContain(askedQuestion);
    expect(intentInputs[1]).toContain("questionsAsked");
  });
  it("inspects a run manifest and a specific node artifact", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-inspect-"));
    await runDesignAgentCli(
      ["run", "--message", "complete material orchestration dashboard", "--out", runDir, "--fixture", "complete"],
      { write: () => undefined },
      { envFilePath: false },
    );

    const manifestOutput: string[] = [];
    await runDesignAgentCli(["inspect", "--run", runDir], { write: (line) => manifestOutput.push(line) }, { envFilePath: false });
    expect(manifestOutput.join("\n")).toContain("Run status: completed");
    expect(manifestOutput.join("\n")).toContain("Current node: final_output");
    expect(manifestOutput.join("\n")).toContain("- json_planning v1");

    const nodeOutput: string[] = [];
    await runDesignAgentCli(["inspect", "--run", runDir, "--node", "json_planning"], { write: (line) => nodeOutput.push(line) }, { envFilePath: false });
    expect(nodeOutput.join("\n")).toContain('"node": "json_planning"');
    expect(nodeOutput.join("\n")).toContain('"document"');
  });

  it("prints artifact paths without running the graph", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-artifacts-"));
    await runDesignAgentCli(
      ["run", "--message", "complete material orchestration dashboard", "--out", runDir, "--fixture", "complete"],
      { write: () => undefined },
      { envFilePath: false },
    );

    const output: string[] = [];
    await runDesignAgentCli(["artifacts", "--run", runDir], { write: (line) => output.push(line) }, { envFilePath: false });

    expect(output.join("\n")).toContain("Artifacts:");
    expect(output.join("\n")).toContain("- final_output v1:");
  });
  it("prompts for clarification and resumes in the same process when interactive", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-interactive-"));
    const output: string[] = [];
    const prompts: unknown[] = [];
    let intentCalls = 0;
    const createStructuredOutput = (schema: unknown) => ({
      async invoke() {
        if (schema === intentRecognitionOutputSchema) {
          intentCalls += 1;
          if (intentCalls === 1) {
            return {
              updates: [
                {
                  key: "page_context",
                  status: "partial",
                  completeness: 0.5,
                  confidence: 0.8,
                  value: { pageType: "ecommerce page" },
                  evidence: ["ecommerce page"],
                  missingFields: ["target buyer"],
                  assumptions: [],
                },
              ],
            };
          }
          return { updates: completeIntentUpdates() };
        }
        if (schema === questionGenerationOutputSchema) {
          return {
            reason: "Need target buyer",
            questions: [
              {
                id: "q_target_buyer",
                dimensionKey: "page_context",
                question: "Who is the target buyer?",
                options: ["consumer", "merchant"],
                expectedAnswerShape: "single_choice",
              },
            ],
          };
        }
        if (schema === jsonPlanningModelOutputSchema) return { structurePlan: fixtureStructurePlan() };
        if (schema === layoutPlanningModelOutputSchema) return { layoutPlan: fixtureLayoutPlan() };
        if (schema === elementPlanningModelOutputSchema) {
          return {
            elementPlan: {
              elements: [
                {
                  id: "title_main",
                  parentId: "section_main",
                  order: 0,
                  type: "text",
                  name: "Title",
                  purpose: "Identify the ecommerce page",
                  content: "Test Ecommerce Page",
                  attributes: [{ key: "role", value: "heading" }],
                },
              ],
              notes: [],
            },
          };
        }
        if (schema === imagePlanningModelOutputSchema) return { visualAssetPlan: fixtureImagePlan() };
        if (schema === interactionPlanningModelOutputSchema) {
          return { interactionPlan: { interactions: [], notes: [] } };
        }
        if (schema === visualReviewModelOutputSchema) return { issues: [], notes: [] };
        if (schema === stylePlanningModelOutputSchema) {
          return {
            stylePlan: {
              theme: "commerce_editorial",
              tone: "premium",
              assignments: [
                { elementId: "page_root", preset: "page" },
                { elementId: "section_main", preset: "section" },
                { elementId: "section_workflow", preset: "section" },
                { elementId: "section_detail", preset: "section" },
                { elementId: "title_main", preset: "heading" },
              ],
              notes: [],
            },
          };
        }
        throw new Error("Unexpected schema");
      },
    });

    const result = await runDesignAgentCli(
      ["run", "--message", "make an ecommerce page", "--out", runDir],
      {
        write: (line) => output.push(line),
        isInteractive: true,
        prompt: async (plan) => {
          prompts.push(plan);
          return "目标买家是 consumer";
        },
      },
      { createStructuredOutput, createImageGeneration: generateTestImage, envFilePath: false },
    );

    expect(result.stage).toBe("completed");
    expect(prompts).toHaveLength(1);
    expect(result.latestArtifactRefs.clarification_answer).toBeDefined();
    expect(output.join("\n")).toContain("Clarification required");
    expect(output.join("\n")).toContain("Continuing with your clarification answer");

    const answerRaw = await readFile(result.latestArtifactRefs.clarification_answer.path, "utf8");
    expect(answerRaw).toContain("目标买家是 consumer");
  });

  it("does not prompt and prints resume guidance when no-interactive is set", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-no-interactive-"));
    const output: string[] = [];
    const createStructuredOutput = (schema: unknown) => ({
      async invoke() {
        if (schema === intentRecognitionOutputSchema) {
          return {
            updates: [
              {
                key: "page_context",
                status: "partial",
                completeness: 0.5,
                confidence: 0.8,
                value: { pageType: "ecommerce page" },
                evidence: ["ecommerce page"],
                missingFields: ["target buyer"],
                assumptions: [],
              },
            ],
          };
        }
        expect(schema).toBe(questionGenerationOutputSchema);
        return {
          reason: "Need target buyer",
          questions: [
            {
              id: "q_target_buyer",
              dimensionKey: "page_context",
              question: "Who is the target buyer?",
              options: ["consumer", "merchant"],
              expectedAnswerShape: "single_choice",
            },
          ],
        };
      },
    });

    const result = await runDesignAgentCli(
      ["run", "--message", "make an ecommerce page", "--out", runDir, "--no-interactive"],
      {
        write: (line) => output.push(line),
        isInteractive: true,
        prompt: async () => {
          throw new Error("Prompt should not be called");
        },
      },
      { createStructuredOutput, envFilePath: false },
    );

    expect(result.stage).toBe("clarification");
    expect(output.join("\n")).toContain("Clarification required");
    expect(output.join("\n")).toContain("resume --run");
    expect(output.join("\n")).toContain("consumer");
  });

  it("prints the persisted failed node when planning exhausts retries", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-cli-failed-"));
    const output: string[] = [];
    const createStructuredOutput = (schema: unknown) => ({
      invoke() {
        if (schema === intentRecognitionOutputSchema) return { updates: completeIntentUpdates() };
        if (schema === jsonPlanningModelOutputSchema) throw new Error("Invalid structure from model");
        throw new Error("Unexpected schema");
      },
    });

    await expect(runDesignAgentCli(
      ["run", "--message", "complete page", "--out", runDir],
      { write: (line) => output.push(line) },
      { createStructuredOutput, envFilePath: false },
    )).rejects.toThrow(/json_planning failed after retry/i);

    const text = output.join("\n");
    expect(text).toContain("Run failed");
    expect(text).toContain("Failed node: json_planning");
    expect(text).toContain("json_planning.v1.json");
  });});

function completeIntentUpdates() {
  return intentDimensionKeys.map((key) => ({
    key,
    status: "complete" as const,
    completeness: 1,
    confidence: 1,
    value: { key, fixture: true },
    evidence: ["test complete intent"],
    missingFields: [],
    assumptions: [],
  }));
}

function fixtureStructurePlan() {
  return {
    document: {
      id: "fixture_material_orchestration_dashboard",
      name: "Material Orchestration Dashboard",
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
        id: "section_main",
        parentId: "page_root",
        order: 0,
        type: "section",
        name: "Main Section",
        purpose: "Material orchestration workspace",
      },
      {
        id: "section_workflow",
        parentId: "page_root",
        order: 1,
        type: "section",
        name: "Workflow Section",
        purpose: "Show the material orchestration workflow",
      },
      {
        id: "section_detail",
        parentId: "page_root",
        order: 2,
        type: "section",
        name: "Detail Section",
        purpose: "Support material orchestration details",
      },
    ],
  };
}
function fixtureLayoutPlan() {
  return {
    strategy: "dashboard_grid" as const,
    rootId: "page_root",
    sectionIds: ["section_main", "section_workflow", "section_detail"],
    rhythm: "standard" as const,
    hierarchy: { titleElementId: "section_main", primaryVisualSlotId: "fixture_slot_background" },
    imageSlots: fixtureImageSlots(),
    notes: [],
  };
}

function fixtureImageSlots() {
  return [
    { id: "fixture_slot_background", parentId: "section_main", role: "hero" as const, placement: "background" as const, display: { aspectRatio: "16:9" as const, width: "fill" as const, maxHeight: 480, objectFit: "cover" as const, focalPoint: "center" as const }, generation: { width: 1536, height: 864, safeArea: "left" as const } },
    { id: "fixture_slot_workflow", parentId: "section_workflow", role: "section" as const, placement: "inline" as const, display: { aspectRatio: "3:2" as const, width: "fill" as const, maxHeight: 320, objectFit: "cover" as const, focalPoint: "center" as const }, generation: { width: 1200, height: 800, safeArea: "none" as const } },
    { id: "fixture_slot_detail", parentId: "section_detail", role: "card" as const, placement: "inline" as const, display: { aspectRatio: "1:1" as const, width: "half" as const, maxHeight: 220, objectFit: "contain" as const, focalPoint: "center" as const }, generation: { width: 1024, height: 1024, safeArea: "none" as const } },
  ];
}
function fixtureDesignDocument() {
  return {
    schemaVersion: "fm-design/v1",
    id: "test_ecommerce_page",
    name: "Test Ecommerce Page",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: { id: "page_root", children: [] },
    elements: [
      {
        id: "page_root",
        name: "Page",
        type: "page",
        props: {},
        style: {
          base: {
            backgroundColor: "surface",
            radius: "md",
            border: { width: "none", style: "none", color: "border" },
            text: {
              color: "textPrimary",
              fontFamily: "sans",
              fontSize: "md",
              fontWeight: "regular",
              lineHeight: "normal",
              align: "left",
            },
          },
          container: { shadow: "none", overflow: "visible", surface: "flat" },
        },
      },
    ],
    variables: {},
  };
}

function fixtureImagePlan() {
  return {
    imagePolicy: "required" as const,
    visualMode: "rich" as const,
    minimumGeneratedAssets: 3 as const,
    assets: [
      { id: "fixture_background", slotId: "fixture_slot_background", purpose: "Create fixture background depth", promptBrief: "Low-contrast workspace background", priority: "required" as const },
      { id: "fixture_visual_one", slotId: "fixture_slot_workflow", purpose: "Show fixture workflow", promptBrief: "Material orchestration workflow scene", priority: "required" as const },
      { id: "fixture_visual_two", slotId: "fixture_slot_detail", purpose: "Support fixture details", promptBrief: "Material orchestration detail illustration", priority: "required" as const },
    ],
    notes: ["Deterministic fixture image plan."],
  };
}

function generateTestImage(request: import("./nodes/types.js").ImageGenerationRequest) {
  return { url: `https://cdn.example.com/cli/${request.assetId}.png`, provider: "test", model: "cli-fixture" };
}