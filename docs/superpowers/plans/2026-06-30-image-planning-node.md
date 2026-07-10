# Image Planning Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent `image_planning` LangGraph node that guarantees at least three newly generated images unless the user explicitly requests no images, plans content and background placements, and exposes inspectable progress through CLI and WebSocket.

**Architecture:** `image_planning` reads the styled document from the artifact blackboard, produces a strict `VisualAssetPlan` through `withStructuredOutput`, validates the plan against deterministic no-image intent, compiles image slots/background metadata into the document, and persists both. `document_assembly` records this plan as a dependency, while `image_generation` consumes it with bounded concurrency, one retry per asset, and a hard minimum-success gate before schema validation.

**Tech Stack:** TypeScript, Zod, LangGraph, Vitest, NestJS, React, artifact blackboard.

---

## File Structure

- Create `packages/design-agent/src/nodes/image-planning/schema.ts`: strict structured-output contract and contextual validation.
- Create `packages/design-agent/src/nodes/image-planning/prompt.ts`: model responsibilities and placement rules.
- Create `packages/design-agent/src/nodes/image-planning/compiler.ts`: deterministic slot/background compilation.
- Create `packages/design-agent/src/nodes/image-planning/node.ts`: artifact reads, structured model invocation, retry, and persistence.
- Create focused tests beside schema, compiler, and node.
- Modify graph/state/index files to insert the node between style planning and document assembly.
- Modify document assembly to include the visual plan and artifact dependency.
- Refactor image generation to consume planned assets with retries, concurrency two, and minimum enforcement.
- Modify CLI fixture/labels, API response projection, and web progress rendering for the new stage.

### Task 1: Define The Visual Asset Contract And No-Image Rule

**Files:**
- Create: `packages/design-agent/src/nodes/image-planning/schema.ts`
- Create: `packages/design-agent/src/nodes/image-planning/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover a valid three-asset plan, duplicate IDs, more than ten assets, required mode with fewer than three assets, and zero assets in explicit no-image mode. The public API must be:

```ts
export const visualAssetPlanSchema: z.ZodType<VisualAssetPlan>;
export const imagePlanningModelOutputSchema: z.ZodType<{ visualAssetPlan: VisualAssetPlan }>;
export function validateImagePolicy(
  plan: VisualAssetPlan,
  context: { messages: AgentMessage[]; dimensions: IntentDimension[] },
): VisualAssetPlan;
export function hasExplicitNoImageIntent(context: {
  messages: AgentMessage[];
  dimensions: IntentDimension[];
}): boolean;
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning/schema.test.ts`

Expected: FAIL because `schema.ts` does not exist.

- [ ] **Step 3: Implement the strict schema and deterministic policy validator**

Use these exact discriminants and limits:

```ts
export type VisualAssetPlan = {
  imagePolicy: "required" | "none";
  visualMode: "standard" | "rich" | "none";
  minimumGeneratedAssets: 0 | 3;
  assets: VisualAsset[];
  notes: string[];
};

const NO_IMAGE_PATTERNS = [
  /不要(?:使用|生成|放置)?图片/iu,
  /不需要图片/iu,
  /无图(?:片)?/iu,
  /no images?/iu,
  /without images?/iu,
];
```

`hasExplicitNoImageIntent` must inspect both user messages and the restored `presentation_rules` dimension so resume does not lose the decision. `validateImagePolicy` must reject `none` without matching evidence, reject required mode below three assets, and reject image assets when explicit no-image mode is selected.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning/schema.test.ts`

Expected: all image-planning schema tests pass.

### Task 2: Compile Planned Images Into A Valid Design Document

**Files:**
- Create: `packages/design-agent/src/nodes/image-planning/compiler.ts`
- Create: `packages/design-agent/src/nodes/image-planning/compiler.test.ts`

- [ ] **Step 1: Write failing compiler tests**

Test these observable behaviors independently:

```ts
const compiled = compileVisualAssetPlan(document, plan);
expect(compiled.elements.find(({ id }) => id === "hero_visual")?.type).toBe("image");
expect(findTreeNode(compiled.tree, "hero_visual")).toBeDefined();
expect(compiled.elements.find(({ id }) => id === "hero_section")?.props.visualAssetId).toBe("hero_bg");
expect(() => designDocumentSchema.parse(compiled)).not.toThrow();
```

Also reject missing parents, background targets that are not containers, duplicate element IDs, and out-of-range insertion order.

- [ ] **Step 2: Run the compiler test and confirm RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning/compiler.test.ts`

Expected: FAIL because `compileVisualAssetPlan` does not exist.

- [ ] **Step 3: Implement deterministic compilation**

Export one entry point:

```ts
export function compileVisualAssetPlan(document: DesignDocument, plan: VisualAssetPlan): DesignDocument;
```

For new content slots, create a complete image element with `width: "fill"`, fixed requested height, `objectFit: "cover"`, muted fallback, `visualAssetId`, `purpose`, `promptBrief`, and requested dimensions in props. Insert its tree node at the requested parent/order. For backgrounds, write `visualAssetId` and pending metadata to target props, use a deterministic fallback background, and apply `foregroundTone` to descendant text/button base text colors. Finish with `designDocumentSchema.parse`.

- [ ] **Step 4: Run compiler tests and confirm GREEN**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning/compiler.test.ts`

Expected: all compiler tests pass.

### Task 3: Implement The Image Planning LangGraph Node

**Files:**
- Create: `packages/design-agent/src/nodes/image-planning/prompt.ts`
- Create: `packages/design-agent/src/nodes/image-planning/node.ts`
- Create: `packages/design-agent/src/nodes/image-planning/node.test.ts`
- Modify: `packages/design-agent/src/nodes/index.ts`
- Modify: `packages/design-agent/src/state.ts`
- Modify: `packages/design-agent/src/graph.ts`
- Modify: `packages/design-agent/src/graph.test.ts`

- [ ] **Step 1: Write failing node and graph tests**

The node test must prove that it binds `imagePlanningModelOutputSchema`, persists `image_planning.v1.json`, retries one invalid plan, and writes a failed artifact after the second invalid plan. The graph test must assert:

```ts
expect(result.latestArtifactRefs.image_planning).toBeDefined();
expect(completedNodes).toContain("image_planning");
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning/node.test.ts src/graph.test.ts`

Expected: FAIL because the node and graph stage are absent.

- [ ] **Step 3: Implement prompt, node, and graph edge**

The node flow is:

```ts
const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "style_planning");
const visualAssetPlan = options.createStructuredOutput
  ? await invokeImagePlanningModel(...)
  : createRuleBasedVisualAssetPlan(state, document);
const validatedPlan = validateImagePolicy(visualAssetPlan, {
  messages: state.messages,
  dimensions: state.dimensions,
});
const compiledDocument = compileVisualAssetPlan(document, validatedPlan);
return writePipelineArtifact({
  state,
  options,
  node: "image_planning",
  stage: "image_planning",
  inputRefs,
  output: { document: compiledDocument, visualAssetPlan: validatedPlan },
});
```

Retry exactly once with compact validation errors. Add `image_planning` to `AgentStage`, node exports, graph registration, and replace `style_planning -> document_assembly` with `style_planning -> image_planning -> document_assembly`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning/node.test.ts src/graph.test.ts`

Expected: node and graph tests pass with an `image_planning` artifact.

### Task 4: Make Document Assembly Depend On The Image Plan

**Files:**
- Modify: `packages/design-agent/src/nodes/document-assembly/schema.ts`
- Modify: `packages/design-agent/src/nodes/document-assembly/node.ts`
- Modify: `packages/design-agent/src/nodes/document-assembly/node.test.ts`

- [ ] **Step 1: Write a failing assembly dependency test**

Assert that assembly reads the document from `image_planning`, includes `visualAssetPlan` in `variables.agentPlanning`, exposes it in `sourcePlans.imagePlanning`, records `sourceArtifacts.imagePlanning`, and lists the artifact in `inputRefs`.

- [ ] **Step 2: Run the assembly test and confirm RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/document-assembly/node.test.ts`

Expected: FAIL because assembly still reads `style_planning` as its latest document.

- [ ] **Step 3: Update assembly types and artifact reads**

Read the latest document from `image_planning`, retain the prior five planning artifacts, add the image planning artifact, and extend both source maps:

```ts
sourcePlans: {
  ...,
  imagePlanning: image.output.visualAssetPlan ?? null,
},
sourceArtifacts: {
  ...,
  imagePlanning: image.ref,
},
```

- [ ] **Step 4: Run the assembly test and confirm GREEN**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/document-assembly/node.test.ts`

Expected: assembly dependency test passes.

### Task 5: Generate Planned Content And Background Assets Reliably

**Files:**
- Modify: `packages/design-agent/src/nodes/types.ts`
- Modify: `packages/design-agent/src/nodes/image-generation/schema.ts`
- Modify: `packages/design-agent/src/nodes/image-generation/prompt.ts`
- Modify: `packages/design-agent/src/nodes/image-generation/node.ts`
- Modify: `packages/design-agent/src/nodes/image-generation/node.test.ts`

- [ ] **Step 1: Write failing generation behavior tests**

Add separate tests for content URL backfill, background URL backfill, exact dimension/context prompt fields, maximum concurrency two, one retry, required-first ordering, optional failure with three successes, hard failure with fewer than three successes, and explicit no-image provider skip.

- [ ] **Step 2: Run generation tests and confirm RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-generation/node.test.ts`

Expected: new tests fail because generation scans image elements sequentially and treats missing providers as skipped.

- [ ] **Step 3: Refactor generation around `VisualAssetPlan`**

Extend requests and output items with `assetId`, `kind`, `targetElementId`, `priority`, and `attempts`. Read the plan from `document_assembly`. Sort priorities with `required`, `recommended`, `optional`; run a worker pool with two workers; call each asset at most twice. Build prompts from confirmed dimensions, plan purpose/brief, exact pixels, theme/tone, nearby text, crop safety, subject placement, negative space, and prohibited overlays.

Apply results as follows:

```ts
if (asset.kind === "content_image") image.props.src = result.url;
if (asset.kind === "background_image") target.style.base.backgroundImage = result.url;
```

When required mode has no provider, or fewer than three current-run successes remain after retries, call `failPipelineNode` with the partial document and per-asset results. Never count existing URLs.

- [ ] **Step 4: Run generation tests and confirm GREEN**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-generation/node.test.ts`

Expected: all generation policy, retry, and concurrency tests pass.

### Task 6: Update Fixture, CLI Progress, API Projection, And Web Status

**Files:**
- Modify: `packages/design-agent/src/cli.ts`
- Modify: `packages/design-agent/src/cli-renderer.ts`
- Modify: `packages/design-agent/src/cli-renderer.test.ts`
- Modify: `packages/design-agent/src/cli.test.ts`
- Modify: `apps/api/src/modules/low-code/design-agent.service.ts`
- Modify: `apps/api/src/modules/low-code/design-agent.service.spec.ts`
- Modify: `apps/web/src/components/lowcode/agentWebSocketSession.ts`
- Modify: `apps/web/src/components/lowcode/LowCodeAgentChat.tsx`
- Modify: `apps/web/src/components/lowcode/agentWebSocketSession.test.ts`

- [ ] **Step 1: Write failing CLI/API/client tests**

Assert the CLI prints `Step: image_planning - 图片规划`; the fixture structured-output factory supports `imagePlanningModelOutputSchema` and returns three assets; API image results include `assetId`, `kind`, and attempts; the WebSocket client preserves the new fields and progress stage.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/cli-renderer.test.ts src/cli.test.ts`

Run: `corepack pnpm --filter @flowmind/api test -- design-agent.service.spec.ts`

Run: `corepack pnpm --filter @flowmind/web test -- agentWebSocketSession.test.ts`

Expected: tests fail on missing schema fixture, label, and response fields.

- [ ] **Step 3: Implement progress and result projection**

Add the structured fixture branch and three deterministic fixture assets, pass a fixture image generator so the complete fixture still reaches final output, add the CLI label, and extend API/client image item types. In `LowCodeAgentChat`, render planned/generated counts and distinguish `背景图` from `内容图`; do not expose provider payloads, prompts, or credentials.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the same three commands from Step 2.

Expected: all CLI, API, and WebSocket tests pass.

### Task 7: Full-Flow Verification And Artifact Inspection

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run design-agent tests and typecheck**

Run: `corepack pnpm --filter @flowmind/design-agent test`

Run: `corepack pnpm --filter @flowmind/design-agent typecheck`

Expected: zero failures and zero TypeScript errors.

- [ ] **Step 2: Run API and web focused validation**

Run: `corepack pnpm --filter @flowmind/api test -- design-agent.service.spec.ts`

Run: `corepack pnpm --filter @flowmind/web test -- agentWebSocketSession.test.ts LowCodePage.test.tsx`

Run: `corepack pnpm --filter @flowmind/api typecheck`

Run: `corepack pnpm --filter @flowmind/web typecheck`

Expected: zero failures.

- [ ] **Step 3: Run the deterministic CLI flow**

Run:

```powershell
corepack pnpm --filter @flowmind/design-agent agent -- run --message "做一个图片丰富的电商首页" --out artifacts/runs/image-planning-fixture --fixture complete --no-interactive
```

Expected: progress includes `image_planning`; manifest status is `completed`; `image_planning.v1.json`, `document_assembly.v1.json`, `image_generation.v1.json`, and `final_output.v1.json` exist; generated count is at least three.

- [ ] **Step 4: Inspect artifact invariants**

Run:

```powershell
corepack pnpm --filter @flowmind/design-agent agent -- inspect --run artifacts/runs/image-planning-fixture --node image_planning
corepack pnpm --filter @flowmind/design-agent agent -- inspect --run artifacts/runs/image-planning-fixture --node image_generation
```

Expected: every planned asset has dimensions and placement; every counted generated asset has a current-run generated URL; the final document passes `designDocumentSchema`.

- [ ] **Step 5: Run repository verification**

Run: `corepack pnpm verify:commit`

Expected: lint and typecheck pass across the monorepo.

