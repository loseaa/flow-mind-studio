import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createArtifactStore, type RunManifest } from "./artifacts/store.js";
import { createCliRenderer } from "./cli-renderer.js";
import { promptForClarification } from "./cli-prompter.js";
import { createDesignAgentGraph, type DesignAgentGraphStartNode } from "./graph.js";
import { recordQuestionsAsked } from "./intent/dimensions.js";
import { loadEnvFileInto } from "./llm/env.js";
import { createImageGenerationFactory } from "./llm/image-provider.js";
import { createStructuredOutputFactory } from "./llm/provider.js";
import { elementPlanningModelOutputSchema } from "./nodes/element-planning/schema.js";
import { intentRecognitionOutputSchema } from "./nodes/intent-recognition/schema.js";
import { interactionPlanningModelOutputSchema } from "./nodes/interaction-planning/schema.js";
import { imagePlanningModelOutputSchema } from "./nodes/image-planning/schema.js";
import { jsonPlanningModelOutputSchema } from "./nodes/json-planning/schema.js";
import { layoutPlanningModelOutputSchema } from "./nodes/layout-planning/schema.js";
import { questionGenerationOutputSchema } from "./nodes/question-generation/schema.js";
import { reflectionRepairModelOutputSchema } from "./nodes/reflection-repair/schema.js";
import { stylePlanningModelOutputSchema } from "./nodes/style-planning/schema.js";
import { visualReviewModelOutputSchema } from "./nodes/visual-review/schema.js";
import type { CreateImageGeneration, CreateStructuredOutput } from "./nodes/types.js";
import type { ArtifactRef, ClarificationPlan, CompletenessResult, DesignAgentState, IntentDimension } from "./state.js";
import { createInitialState, intentDimensionKeys } from "./state.js";

export type CliCommand = "run" | "resume" | "continue" | "inspect" | "artifacts";

export type CliArgs = {
  command: CliCommand;
  message?: string;
  answer?: string;
  out: string;
  fixture?: "complete";
  node?: string;
  noInteractive?: boolean;
};

export type CliSpinner = {
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
  stop: () => void;
};

export type CliIo = {
  write: (line: string) => void;
  prompt?: (plan: ClarificationPlan) => Promise<string>;
  isInteractive?: boolean;
  startSpinner?: (text: string) => CliSpinner;
  color?: boolean;
};

export type CliRuntime = {
  env?: Record<string, string | undefined>;
  envFilePath?: string | false;
  createStructuredOutput?: CreateStructuredOutput;
  createImageGeneration?: CreateImageGeneration;
};

export function parseCliArgs(argv: string[]): CliArgs {
  const normalized = stripArgumentSeparator(argv);
  const { command, args } = readCommand(normalized);
  const message = readFlag(args, "--message")?.trim();
  const answer = readFlag(args, "--answer")?.trim();
  const explicitOut = readFlag(args, "--run") ?? readFlag(args, "--out");
  const out = explicitOut ?? defaultRunDir();
  const fixture = readFixtureFlag(args);
  const node = readFlag(args, "--node")?.trim();
  const noInteractive = args.includes("--no-interactive") || undefined;

  if (command === "run" && !message) {
    throw new Error("Missing required --message argument for run.");
  }
  if (command === "resume" && !answer) {
    throw new Error("Missing required --answer argument for resume.");
  }
  if ((command === "inspect" || command === "artifacts" || command === "continue") && !explicitOut) {
    throw new Error(`Missing required --run argument for ${command}.`);
  }

  return { command, message, out, answer, fixture, node, noInteractive };
}

export async function runDesignAgentCli(
  argv: string[],
  io: CliIo = createDefaultCliIo(),
  runtime: CliRuntime = {},
): Promise<DesignAgentState> {
  const args = parseCliArgs(argv);
  const runDir = resolveRunDir(args.out);
  const threadId = basename(runDir);
  const store = createArtifactStore({ runDir, threadId });
  const renderer = createCliRenderer({ write: io.write, color: io.color ?? false });

  if (args.command === "inspect") {
    const manifest = await store.readManifest();
    io.write(`Run directory: ${runDir}`);
    if (args.node) {
      await writeNodeArtifact(args.node, manifest, store, io);
    } else {
      renderer.writeManifestSummary(manifest);
    }
    return stateFromManifest(manifest, threadId);
  }

  if (args.command === "artifacts") {
    const manifest = await store.readManifest();
    io.write(`Run directory: ${runDir}`);
    renderer.writeArtifactSummary(manifest);
    return stateFromManifest(manifest, threadId);
  }

  const env = runtime.env ?? process.env;
  const envFilePath = runtime.envFilePath === false ? undefined : runtime.envFilePath ?? resolveProjectFile(".env");
  if (envFilePath && !args.fixture) await loadEnvFileInto(envFilePath, env);
  renderer.writeRunHeader({ runDir, llmSummary: describeLlm(args, env) });
  const createStructuredOutput =
    runtime.createStructuredOutput ??
    (args.fixture === "complete" ? createCompleteFixtureStructuredOutput() : createStructuredOutputFactory({}, env));

  const createImageGeneration =
    runtime.createImageGeneration ??
    (args.fixture === "complete" ? createCompleteFixtureImageGeneration() : createImageGenerationFactory({ runDir }, env));
  const continuationManifest = args.command === "continue" ? await store.readManifest() : undefined;
  const startNode = continuationManifest
    ? readGraphStartNode(args.node ?? continuationManifest.currentNode)
    : undefined;
  const graph = createDesignAgentGraph({
    artifactStore: store,
    createStructuredOutput,
    createImageGeneration,
    onNodeStart: (node) => renderer.writeStep(node),
    startNode,
  });
  let result: DesignAgentState;
  try {
    result = args.command === "resume"
      ? await resumeWithAnswer({ answer: args.answer ?? "", graph, store, threadId, io })
      : args.command === "continue" && continuationManifest && startNode
        ? await invokeGraphWithSpinner({
            graph,
            io,
            label: "Continuing design agent from " + startNode,
            state: await createContinuationState({ manifest: continuationManifest, store, threadId, startNode }),
          })
        : await invokeGraphWithSpinner({
            graph,
            io,
            label: "Running design agent",
            state: {
              ...createInitialState(threadId),
              messages: [{ role: "user" as const, content: args.message ?? "", createdAt: new Date().toISOString() }],
            },
          });
  } catch (error) {
    const failedManifest = await store.readManifest();
    if (failedManifest.status === "failed") renderer.writeFailure(failedManifest, runDir, error);
    throw error;
  }
  if (args.command === "resume") {
    io.write("Clarification answer saved.");
  }

  return continueAfterGraph({ args, graph, io, renderer, result, runDir, store, threadId });
}
async function main() {
  try {
    await runDesignAgentCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}


type RunnableGraph = ReturnType<typeof createDesignAgentGraph>;

async function continueAfterGraph(input: {
  args: CliArgs;
  graph: RunnableGraph;
  io: CliIo;
  renderer: ReturnType<typeof createCliRenderer>;
  result: DesignAgentState;
  runDir: string;
  store: ReturnType<typeof createArtifactStore>;
  threadId: string;
}): Promise<DesignAgentState> {
  let result = input.result;
  let manifest = await input.store.readManifest();

  while (result.stage === "clarification" && result.clarificationPlan) {
    const interactive = shouldPromptForClarification(input.args, input.io);
    input.renderer.writeClarification(result.clarificationPlan, input.runDir, interactive);
    if (!interactive) return result;

    const answer = await input.io.prompt!(result.clarificationPlan);
    input.io.write("Continuing with your clarification answer...");
    result = await resumeWithAnswer({
      answer,
      graph: input.graph,
      store: input.store,
      threadId: input.threadId,
      io: input.io,
    });
    manifest = await input.store.readManifest();
  }

  input.renderer.writeResult(result, manifest, input.runDir);
  return result;
}

async function resumeWithAnswer(input: {
  answer: string;
  graph: RunnableGraph;
  store: ReturnType<typeof createArtifactStore>;
  threadId: string;
  io: CliIo;
}): Promise<DesignAgentState> {
  const manifest = await input.store.readManifest();
  const clarificationRef = manifest.artifacts.clarification;
  if (!clarificationRef) {
    throw new Error("Cannot save --answer because this run has no clarification artifact.");
  }
  const answerRef = await input.store.writeArtifact({
    node: "clarification_answer",
    status: "success",
    inputRefs: [clarificationRef],
    output: {
      answer: input.answer,
    },
    errors: [],
  });
  const resumedState = await createResumedState({
    answer: input.answer,
    answerRef,
    manifest,
    store: input.store,
    threadId: input.threadId,
  });
  return invokeGraphWithSpinner({
    graph: input.graph,
    io: input.io,
    label: "Continuing design agent",
    state: resumedState,
  });
}

async function invokeGraphWithSpinner(input: {
  graph: RunnableGraph;
  io: CliIo;
  label: string;
  state: DesignAgentState;
}) {
  const spinner = input.io.startSpinner?.(input.label);
  try {
    const result = await input.graph.invoke(input.state);
    spinner?.succeed(`${input.label} finished`);
    return result;
  } catch (error) {
    spinner?.fail(`${input.label} failed`);
    throw error;
  }
}

function shouldPromptForClarification(args: CliArgs, io: CliIo) {
  return !args.noInteractive && io.isInteractive === true && Boolean(io.prompt);
}

function createDefaultCliIo(): CliIo {
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    write: (line) => console.log(line),
    isInteractive,
    prompt: (plan) => promptForClarification(plan, { write: (line) => console.log(line) }),
    color: isInteractive,
  };
}

function describeLlm(args: CliArgs, env: Record<string, string | undefined>) {
  if (args.fixture) return `fixture=${args.fixture}`;
  const provider = env.DESIGN_AGENT_LLM_PROVIDER ?? "openai-compatible";
  const model = env.DESIGN_AGENT_MODEL ?? env.OPENAI_MODEL ?? env.LLM_MODEL ?? env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const baseURL =
    env.DESIGN_AGENT_LLM_BASE_URL ??
    env.OPENAI_BASE_URL ??
    env.LLM_BASE_URL ??
    env.DEEPSEEK_BASE_URL ??
    "https://api.deepseek.com";
  const keySource = ["DESIGN_AGENT_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY", "DEEPSEEK_API_KEY"].find((key) => env[key]);
  const imageProvider = env.DESIGN_AGENT_IMAGE_PROVIDER ?? "openai-compatible";
  const imageModel = env.DESIGN_AGENT_IMAGE_MODEL ?? env.IMAGE_MODEL ?? env.OPENAI_IMAGE_MODEL ?? "dall-e-3";
  const imageKeySource = ["DESIGN_AGENT_IMAGE_API_KEY", "IMAGE_API_KEY", "OPENAI_API_KEY"].find((key) => env[key]);
  return `provider=${provider}; model=${model}; baseURL=${baseURL}; apiKey=${keySource ? `${keySource} set` : "not set"}; imageProvider=${imageProvider}; imageModel=${imageModel}; imageApiKey=${imageKeySource ? `${imageKeySource} set` : "not set"}`;
}
async function createContinuationState(input: {
  manifest: RunManifest;
  store: ReturnType<typeof createArtifactStore>;
  threadId: string;
  startNode: DesignAgentGraphStartNode;
}): Promise<DesignAgentState> {
  const initialState = createInitialState(input.threadId);
  return {
    ...initialState,
    currentNode: input.startNode,
    stage: input.startNode,
    messages: [{ role: "user", content: "Continue from persisted design artifacts.", createdAt: new Date().toISOString() }],
    dimensions: await restoreDimensions(input.store, input.manifest, initialState.dimensions),
    latestArtifactRefs: artifactRefsFromManifest(input.manifest),
  };
}

async function createResumedState(input: {
  answer: string;
  answerRef: ArtifactRef;
  manifest: RunManifest;
  store: ReturnType<typeof createArtifactStore>;
  threadId: string;
}): Promise<DesignAgentState> {
  const initialState = createInitialState(input.threadId);
  const dimensions = await restoreDimensions(input.store, input.manifest, initialState.dimensions);

  return {
    ...initialState,
    messages: [{ role: "user", content: input.answer, createdAt: new Date().toISOString() }],
    dimensions,
    latestArtifactRefs: {
      ...artifactRefsFromManifest(input.manifest),
      clarification_answer: input.answerRef,
    },
  };
}

async function restoreDimensions(
  store: ReturnType<typeof createArtifactStore>,
  manifest: RunManifest,
  fallback: IntentDimension[],
): Promise<IntentDimension[]> {
  const completenessRef = manifest.artifacts.completeness_check;
  let restored = fallback;

  if (completenessRef) {
    const artifact = await store.readArtifact<CompletenessResult>(completenessRef);
    const dimensionsByKey = new Map(
      [
        ...artifact.output.completedDimensions,
        ...artifact.output.incompleteDimensions,
        ...artifact.output.conflictingDimensions,
      ].map((dimension) => [dimension.key, dimension]),
    );
    restored = fallback.map((dimension) => dimensionsByKey.get(dimension.key) ?? dimension);
  }

  const clarificationPlan = await readLatestClarificationPlan(store, manifest);
  return clarificationPlan ? recordQuestionsAsked(restored, clarificationPlan) : restored;
}

async function readLatestClarificationPlan(
  store: ReturnType<typeof createArtifactStore>,
  manifest: RunManifest,
): Promise<ClarificationPlan | undefined> {
  const clarificationRef = manifest.artifacts.clarification;
  if (clarificationRef) {
    const artifact = await store.readArtifact<unknown>(clarificationRef);
    const output = artifact.output;
    if (isObject(output) && isClarificationPlan(output.plan)) return output.plan;
  }

  const questionGenerationRef = manifest.artifacts.question_generation;
  if (!questionGenerationRef) return undefined;

  const artifact = await store.readArtifact<unknown>(questionGenerationRef);
  return isClarificationPlan(artifact.output) ? artifact.output : undefined;
}

function isClarificationPlan(value: unknown): value is ClarificationPlan {
  if (!isObject(value) || typeof value.reason !== "string" || !Array.isArray(value.questions)) return false;
  return value.questions.every(
    (question) =>
      isObject(question) &&
      typeof question.id === "string" &&
      typeof question.dimensionKey === "string" &&
      intentDimensionKeys.includes(question.dimensionKey as (typeof intentDimensionKeys)[number]) &&
      typeof question.question === "string" &&
      Array.isArray(question.options) &&
      (question.expectedAnswerShape === "single_choice" || question.expectedAnswerShape === "multi_choice" || question.expectedAnswerShape === "free_text"),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function artifactRefsFromManifest(manifest: RunManifest): Record<string, ArtifactRef> {
  return Object.fromEntries(
    Object.entries(manifest.artifacts).map(([key, artifact]) => [
      key,
      {
        node: artifact.node,
        path: artifact.path,
        version: artifact.version,
        checksum: artifact.checksum,
      },
    ]),
  );
}

function stripArgumentSeparator(argv: string[]) {
  let start = 0;
  while (argv[start] === "--") start += 1;
  return argv.slice(start);
}

function readCommand(argv: string[]): { command: CliCommand; args: string[] } {
  const command = argv[0];
  if (command === "run" || command === "resume" || command === "continue" || command === "inspect" || command === "artifacts") {
    return { command, args: argv.slice(1) };
  }
  return { command: argv.includes("--answer") ? "resume" : "run", args: argv };
}

function readGraphStartNode(value: string): DesignAgentGraphStartNode {
  const supported: DesignAgentGraphStartNode[] = [
    "intent_recognition",
    "json_planning",
    "layout_planning",
    "visual_slot_review",
    "element_planning",
    "interaction_planning",
    "style_planning",
    "image_planning",
    "document_assembly",
    "image_generation",
    "schema_validation",
    "visual_review",
    "reflection_repair",
    "document_repair",
    "final_output",
  ];
  if (supported.includes(value as DesignAgentGraphStartNode)) return value as DesignAgentGraphStartNode;
  throw new Error("Unsupported continuation node: " + value);
}

function readFixtureFlag(argv: string[]): CliArgs["fixture"] | undefined {
  const value = readFlag(argv, "--fixture");
  if (!value) return undefined;
  if (value !== "complete") {
    throw new Error(`Unsupported --fixture value: ${value}.`);
  }
  return value;
}

function createCompleteFixtureStructuredOutput(): CreateStructuredOutput {
  return (schema: unknown) => ({
    invoke() {
      if (schema === intentRecognitionOutputSchema) {
        return {
          updates: intentDimensionKeys.map((key) => ({
            key,
            status: "complete",
            completeness: 1,
            confidence: 1,
            value: { fixture: true, key },
            evidence: ["complete fixture"],
            missingFields: [],
            assumptions: [],
          })),
        };
      }
      if (schema === jsonPlanningModelOutputSchema) {
        return { structurePlan: fixtureStructurePlan() };
      }
      if (schema === layoutPlanningModelOutputSchema) {
        return { layoutPlan: fixtureLayoutPlan() };
      }
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
                purpose: "Identify the material orchestration workspace",
                content: "Material Orchestration Dashboard",
                attributes: [{ key: "role", value: "heading" }],
              },
              {
                id: "subtitle_main",
                parentId: "section_main",
                order: 1,
                type: "text",
                name: "Description",
                purpose: "Describe the fixture run",
                content: "Fixture draft generated for full-flow CLI debugging.",
                attributes: [],
              },
            ],
            notes: ["Fixture semantic element plan."],
          },
        };
      }
      if (schema === interactionPlanningModelOutputSchema) {
        return { interactionPlan: { interactions: [], notes: ["Fixture interaction plan."] } };
      }
      if (schema === imagePlanningModelOutputSchema) {
        return { visualAssetPlan: fixtureVisualAssetPlan() };
      }
      if (schema === stylePlanningModelOutputSchema) {
        return {
          stylePlan: {
            theme: "enterprise_light",
            tone: "operational",
            assignments: [
              { elementId: "page_root", preset: "page" },
              { elementId: "section_main", preset: "section" },
              { elementId: "section_workflow", preset: "section" },
              { elementId: "section_detail", preset: "section" },
              { elementId: "title_main", preset: "heading" },
              { elementId: "subtitle_main", preset: "body" },
            ],
            notes: ["Fixture style plan uses a light operational admin theme."],
          },
        };
      }
      if (schema === visualReviewModelOutputSchema) {
        return { issues: [], notes: [] };
      }
      if (schema === reflectionRepairModelOutputSchema) {
        return {
          repairPlan: {
            summary: "Fixture repair plan.",
            operations: [{ target: "document", action: "repair_schema_violation", reason: "Fixture fallback." }],
            requiresRegeneration: true,
          },
        };
      }
      if (schema === questionGenerationOutputSchema) {
        return { reason: "fixture complete intent has no questions", questions: [] };
      }
      if (schema === visualReviewModelOutputSchema) {
        return { issues: [], notes: ["Fixture visual review passed."] };
      }
      throw new Error("Unsupported fixture schema.");
    },
  });
}

function fixtureVisualAssetPlan() {
  return {
    imagePolicy: "required" as const,
    visualMode: "rich" as const,
    minimumGeneratedAssets: 3 as const,
    assets: [
      { id: "fixture_background", slotId: "fixture_slot_background", purpose: "Create visual depth for the fixture page", promptBrief: "Low-contrast material orchestration workspace background with safe text area", priority: "required" as const },
      { id: "fixture_visual_one", slotId: "fixture_slot_workflow", purpose: "Show the material orchestration workflow", promptBrief: "Material orchestration workflow scene with clear hierarchy", priority: "required" as const },
      { id: "fixture_visual_two", slotId: "fixture_slot_detail", purpose: "Support material orchestration details", promptBrief: "Material orchestration detail illustration with safe cropping", priority: "required" as const },
    ],
    notes: ["Deterministic complete fixture image plan."],
  };
}

function createCompleteFixtureImageGeneration(): CreateImageGeneration {
  return (request) => ({
    url: `https://cdn.example.com/design-agent-fixture/${request.assetId}.png`,
    provider: "fixture",
    model: "fixture-image",
  });
}
function fixtureLayoutPlan() {
  return {
    strategy: "dashboard_grid" as const,
    rootId: "page_root",
    sectionIds: ["section_main", "section_workflow", "section_detail"],
    rhythm: "standard" as const,
    hierarchy: { titleElementId: "section_main", primaryVisualSlotId: "fixture_slot_background" },
    imageSlots: fixtureImageSlots(),
    notes: ["Fixture layout plan for a material orchestration dashboard."],
  };
}

function fixtureImageSlots() {
  return [
    { id: "fixture_slot_background", parentId: "section_main", role: "hero" as const, placement: "background" as const, display: { aspectRatio: "16:9" as const, width: "fill" as const, maxHeight: 480, objectFit: "cover" as const, focalPoint: "center" as const }, generation: { width: 1536, height: 864, safeArea: "left" as const } },
    { id: "fixture_slot_workflow", parentId: "section_workflow", role: "section" as const, placement: "inline" as const, display: { aspectRatio: "3:2" as const, width: "fill" as const, maxHeight: 320, objectFit: "cover" as const, focalPoint: "center" as const }, generation: { width: 1200, height: 800, safeArea: "none" as const } },
    { id: "fixture_slot_detail", parentId: "section_detail", role: "card" as const, placement: "inline" as const, display: { aspectRatio: "1:1" as const, width: "half" as const, maxHeight: 220, objectFit: "contain" as const, focalPoint: "center" as const }, generation: { width: 1024, height: 1024, safeArea: "none" as const } },
  ];
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
function fixtureDesignDocument() {
  return {
    schemaVersion: "fm-design/v1",
    id: "fixture_material_orchestration_dashboard",
    name: "Material Orchestration Dashboard",
    canvas: { viewport: "desktop", width: 1440, background: "muted" },
    tree: {
      id: "page_root",
      children: [{ id: "section_main", children: [{ id: "title_main", children: [] }, { id: "subtitle_main", children: [] }] }],
    },
    elements: [
      {
        id: "page_root",
        name: "Page",
        type: "page",
        layout: { display: "flex", direction: "vertical", gap: "lg", padding: "lg", width: "fill" },
        props: {},
        style: containerStyle("surface"),
      },
      {
        id: "section_main",
        name: "Main Section",
        type: "section",
        layout: { display: "flex", direction: "vertical", gap: "md", padding: "lg", width: "fill" },
        props: {},
        style: containerStyle("white"),
      },
      {
        id: "title_main",
        name: "Title",
        type: "text",
        props: { text: "Material Orchestration Dashboard" },
        style: textStyle("heading", "2xl", "bold", "textPrimary"),
      },
      {
        id: "subtitle_main",
        name: "Description",
        type: "text",
        props: { text: "Fixture draft generated for full-flow CLI debugging." },
        style: textStyle("body", "md", "regular", "textSecondary"),
      },
    ],
    variables: {},
  };
}

function containerStyle(backgroundColor: "surface" | "white") {
  return {
    base: baseStyle(backgroundColor, "textPrimary", "md", "regular"),
    container: {
      shadow: "none" as const,
      overflow: "visible" as const,
      surface: backgroundColor === "white" ? "card" as const : "flat" as const,
    },
  };
}

function textStyle(role: "heading" | "body", fontSize: "md" | "2xl", fontWeight: "regular" | "bold", color: "textPrimary" | "textSecondary") {
  return {
    base: baseStyle("transparent", color, fontSize, fontWeight),
    text: { role, decoration: "none" as const, transform: "none" as const },
  };
}

function baseStyle(backgroundColor: "transparent" | "surface" | "white", color: "textPrimary" | "textSecondary", fontSize: "md" | "2xl", fontWeight: "regular" | "bold") {
  return {
    backgroundColor,
    radius: "md" as const,
    border: { width: "none" as const, style: "none" as const, color: "border" as const },
    text: {
      color,
      fontFamily: "sans" as const,
      fontSize,
      fontWeight,
      lineHeight: "normal" as const,
      align: "left" as const,
    },
  };
}

async function writeNodeArtifact(
  node: string,
  manifest: RunManifest,
  store: ReturnType<typeof createArtifactStore>,
  io: CliIo,
) {
  const ref = manifest.artifacts[node];
  if (!ref) {
    throw new Error(`Cannot inspect node ${node} because no artifact exists for it.`);
  }
  const artifact = await store.readArtifact(ref);
  io.write(JSON.stringify(artifact, null, 2));
}

function writeManifestSummary(manifest: RunManifest, io: CliIo) {
  io.write(`Run status: ${manifest.status}`);
  io.write(`Current node: ${manifest.currentNode}`);
  io.write(`Completed nodes: ${manifest.completedNodes.length}`);
  writeArtifactSummary(manifest, io);
}

function writeArtifactSummary(manifest: RunManifest, io: CliIo) {
  const artifacts = Object.entries(manifest.artifacts);
  if (artifacts.length === 0) return;
  io.write("Artifacts:");
  for (const [name, artifact] of artifacts) {
    io.write(`- ${name} v${artifact.version}: ${artifact.path}`);
  }
}

function writeResultSummary(result: DesignAgentState, io: CliIo) {
  io.write(`Stage: ${result.stage}`);
  if (result.stage === "clarification" && result.clarificationPlan) {
    io.write("Clarification required:");
    result.clarificationPlan.questions.forEach((question, index) => {
      io.write(`${index + 1}. ${question.question}`);
    });
  }
}

function stateFromManifest(manifest: RunManifest, threadId: string): DesignAgentState {
  const initialState = createInitialState(threadId);
  return {
    ...initialState,
    currentNode: manifest.currentNode,
    stage: manifest.status === "completed" ? "completed" : manifest.status === "failed" ? "failed" : initialState.stage,
    latestArtifactRefs: artifactRefsFromManifest(manifest),
  };
}

function readFlag(argv: string[], name: string) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function defaultRunDir() {
  return `packages/design-agent/artifacts/runs/run-${Date.now()}`;
}

function resolveRunDir(out: string) {
  return resolve(process.env.INIT_CWD ?? process.cwd(), out);
}

function resolveProjectFile(fileName: string) {
  return resolve(process.env.INIT_CWD ?? process.cwd(), fileName);
}

function isCliEntrypoint() {
  const invokedPath = process.argv[1];
  return invokedPath ? resolve(invokedPath) === fileURLToPath(import.meta.url) : false;
}

if (isCliEntrypoint()) {
  void main();
}
