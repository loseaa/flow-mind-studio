# Slot-Driven Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make layout planning own bounded image slots, make image planning consume those slots, and block low-quality final JSON through a deterministic plus LLM visual review loop.

**Architecture:** Add a shared `DesignImageSlot` contract stored in element props. `layout_planning` creates composition and slots, `visual_slot_review` validates and compiles them into the document, and image planning/generation only enrich those slots. After schema validation, `visual_review` scores the rendered document and routes at most two deterministic repairs before final output.

**Tech Stack:** TypeScript, Zod, LangGraph, Vitest, React 18, Tailwind CSS, Testing Library, browser verification.

---

## File Structure

- Modify `packages/shared/src/index.ts`: shared image-slot schema and type.
- Modify `packages/shared/src/index.test.ts`: contract and role-bound validation.
- Modify `packages/design-agent/src/nodes/layout-planning/{schema,prompt,node,node.test}.ts`: composition and slot production.
- Create `packages/design-agent/src/nodes/image-policy.ts`: shared explicit no-image intent detection.
- Create `packages/design-agent/src/nodes/visual-slot-review/{schema,node,node.test}.ts`: deterministic slot validation and compilation.
- Modify `packages/design-agent/src/nodes/element-planning/{node,compiler,compiler.test}.ts`: consume reviewed document and remove generation-sized image heights.
- Modify `packages/design-agent/src/nodes/image-planning/{schema,prompt,node,compiler,*.test}.ts`: reference slots only.
- Modify `packages/design-agent/src/nodes/image-generation/{schema,node,node.test}.ts`: derive model dimensions from slots.
- Modify `packages/design-agent/src/nodes/document-assembly/{schema,node,node.test}.ts`: persist slot-review source artifact.
- Modify `apps/web/src/components/lowcode/{DesignCanvas.tsx,LowCodePage.test.tsx}`: render responsive slots.
- Create `packages/design-agent/src/nodes/visual-review/{schema,prompt,rules,node,node.test}.ts`: quality gate.
- Create `packages/design-agent/src/nodes/visual-repair/{node,node.test}.ts`: deterministic repair actions.
- Modify `packages/design-agent/src/{state,graph,graph.test,cli,cli.test}.ts`: routing, state persistence, resume.
- Modify `packages/design-agent/src/nodes/{routing,routing.test,index}.ts`: visual repair loop.
- Modify `packages/design-agent/src/nodes/schema-validation/node.ts`: validate repaired visual document.
- Modify `packages/design-agent/src/nodes/final-output/{schema,node,node.test}.ts`: quality summary.

## Task 1: Shared Image Slot Contract

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
it("accepts a bounded hero image slot", () => {
  expect(designImageSlotSchema.parse({
    id: "hero_visual",
    parentId: "hero_section",
    role: "hero",
    placement: "background",
    display: {
      aspectRatio: "16:9",
      width: "fill",
      minHeight: 360,
      maxHeight: 480,
      objectFit: "cover",
      focalPoint: "right",
    },
    generation: { width: 1536, height: 864, safeArea: "left" },
  })).toMatchObject({ id: "hero_visual" });
});

it("rejects a section slot above its role height bound", () => {
  expect(() => designImageSlotSchema.parse(sectionSlot({ maxHeight: 560 }))).toThrow(/section.*420/i);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `corepack pnpm --filter @flowmind/shared test -- index.test.ts`

Expected: FAIL because `designImageSlotSchema` is not exported.

- [ ] **Step 3: Add the shared schema and type**

```ts
const imageSlotBounds = {
  hero: [360, 560],
  section: [240, 420],
  card: [160, 280],
  gallery: [180, 360],
} as const;

export const designImageSlotSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1),
  role: z.enum(["hero", "section", "card", "gallery"]),
  placement: z.enum(["background", "inline"]),
  display: z.object({
    aspectRatio: z.enum(["16:9", "4:3", "3:2", "1:1", "3:4"]),
    width: z.enum(["fill", "half", "third"]),
    minHeight: z.number().int().positive().optional(),
    maxHeight: z.number().int().positive(),
    objectFit: z.enum(["cover", "contain"]),
    focalPoint: z.enum(["center", "top", "left", "right"]),
  }).strict(),
  generation: z.object({
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
    safeArea: z.enum(["left", "right", "center", "none"]),
  }).strict(),
}).strict().superRefine((slot, context) => {
  const [minimum, maximum] = imageSlotBounds[slot.role];
  if (slot.display.maxHeight < minimum || slot.display.maxHeight > maximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["display", "maxHeight"], message: `${slot.role} maxHeight must be ${minimum}-${maximum}.` });
  }
});

export type DesignImageSlot = z.infer<typeof designImageSlotSchema>;
```

- [ ] **Step 4: Run shared tests and typecheck**

Run: `corepack pnpm --filter @flowmind/shared test -- index.test.ts && corepack pnpm --filter @flowmind/shared typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.test.ts
git commit -m "feat(shared): define bounded image slots"
```

## Task 2: Layout Planning Owns Composition and Slots

**Files:**
- Create: `packages/design-agent/src/nodes/image-policy.ts`
- Modify: `packages/design-agent/src/nodes/layout-planning/schema.ts`
- Modify: `packages/design-agent/src/nodes/layout-planning/prompt.ts`
- Modify: `packages/design-agent/src/nodes/layout-planning/node.ts`
- Test: `packages/design-agent/src/nodes/layout-planning/node.test.ts`
- Modify: `packages/design-agent/src/nodes/image-planning/schema.ts`

- [ ] **Step 1: Write failing layout tests**

```ts
it("stores composition hierarchy and three bounded slots", async () => {
  const result = await layoutPlanningNode(state, modelReturning({ layoutPlan }));
  const artifact = await store.readArtifact(result.latestArtifactRefs!.layout_planning);
  expect(artifact.output.layoutPlan).toMatchObject({
    strategy: "product_showcase",
    rhythm: "standard",
    imageSlots: expect.arrayContaining([
      expect.objectContaining({ id: "hero_visual", placement: "background" }),
    ]),
  });
  expect(artifact.output.layoutPlan.imageSlots).toHaveLength(3);
});

it("returns no slots only for explicit no-image intent", async () => {
  state.messages = [{ role: "user", content: "不要图片", createdAt: new Date().toISOString() }];
  const result = await layoutPlanningNode(state, { artifactStore: store });
  expect((await store.readArtifact(result.latestArtifactRefs!.layout_planning)).output.layoutPlan.imageSlots).toEqual([]);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/layout-planning/node.test.ts`

Expected: FAIL because layout plans do not contain composition fields or slots.

- [ ] **Step 3: Extend layout schema and policy**

```ts
export const layoutPlanSchema = z.object({
  strategy: z.enum(["hero_split", "editorial_sections", "product_showcase", "dashboard_grid"]),
  rootId: z.string().min(1),
  sectionIds: z.array(z.string().min(1)).max(40),
  rhythm: z.enum(["compact", "standard", "immersive"]),
  hierarchy: z.object({
    titleElementId: z.string().min(1),
    primaryVisualSlotId: z.string().min(1),
    primaryActionElementId: z.string().min(1),
  }).partial().strict(),
  imageSlots: z.array(designImageSlotSchema).max(10),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict();
```

Move `hasExplicitNoImageIntent` and its patterns into `nodes/image-policy.ts`, then import it from layout and image planning. In `validateLayoutPlan`, verify unique slot IDs, existing container `parentId`s, one primary image per section, and at least three slots unless no-image intent is explicit.

- [ ] **Step 4: Update prompt and deterministic fallback**

```ts
function planLayoutWithRules(state: DesignAgentState, document: DesignDocument): LayoutPlan {
  const sectionIds = document.elements.filter((element) => element.type === "section").map((element) => element.id);
  return {
    strategy: "product_showcase",
    rootId: document.tree.id,
    sectionIds,
    rhythm: "standard",
    hierarchy: {},
    imageSlots: hasExplicitNoImageIntent(state) ? [] : createDefaultImageSlots(document, sectionIds),
    notes: ["Deterministic slot-first layout."],
  };
}
```

Implement `createDefaultImageSlots` deterministically: choose the first section for one `hero/background` slot (`16:9`, fill, 480px, 1536x864, left safe area), then choose the first two distinct sections for `section/inline` slots (`4:3`, fill, 360px, 1200x900, no safe area). If the draft has fewer than three sections, place the remaining inline slots under the page root with unique IDs.

Update `layoutPlanningPrompt` to state that generation dimensions are not UI dimensions and that every non-no-image layout must define at least three bounded slots.

- [ ] **Step 5: Run tests, typecheck, and commit**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/layout-planning/node.test.ts src/nodes/image-planning/schema.test.ts && corepack pnpm --filter @flowmind/design-agent typecheck`

Expected: PASS.

```bash
git add packages/design-agent/src/nodes/image-policy.ts packages/design-agent/src/nodes/layout-planning packages/design-agent/src/nodes/image-planning/schema.ts
git commit -m "feat(agent): plan visual composition and image slots"
```

## Task 3: Validate and Compile Slots Before Element Planning

**Files:**
- Create: `packages/design-agent/src/nodes/visual-slot-review/schema.ts`
- Create: `packages/design-agent/src/nodes/visual-slot-review/node.ts`
- Test: `packages/design-agent/src/nodes/visual-slot-review/node.test.ts`
- Modify: `packages/design-agent/src/nodes/element-planning/node.ts`
- Modify: `packages/design-agent/src/nodes/element-planning/compiler.ts`
- Test: `packages/design-agent/src/nodes/element-planning/compiler.test.ts`
- Modify: `packages/design-agent/src/nodes/index.ts`
- Modify: `packages/design-agent/src/state.ts`
- Modify: `packages/design-agent/src/graph.ts`

- [ ] **Step 1: Write failing compiler and graph tests**

```ts
it("compiles inline slots without copying generation height into layout", async () => {
  const document = await reviewedDocumentWithSlot({ generation: { width: 1200, height: 800 } });
  const image = document.elements.find((element) => element.id === "feature_visual");
  expect(image?.layout?.fixedHeight).toBeUndefined();
  expect(image?.props.imageSlot).toMatchObject({ display: { maxHeight: 420 } });
});

it("runs visual_slot_review between layout and element planning", async () => {
  const result = await graph.invoke(state);
  expect(result.latestArtifactRefs.visual_slot_review).toBeDefined();
  const elementArtifact = await store.readArtifact(result.latestArtifactRefs.element_planning);
  expect(elementArtifact.inputRefs).toContainEqual(result.latestArtifactRefs.visual_slot_review);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/visual-slot-review/node.test.ts src/nodes/element-planning/compiler.test.ts src/graph.test.ts`

Expected: FAIL because the node and slot compiler do not exist.

- [ ] **Step 3: Implement deterministic review and compilation**

```ts
export function compileReviewedSlots(document: DesignDocument, slots: DesignImageSlot[]): DesignDocument {
  const compiled = structuredClone(document) as DesignDocument;
  for (const slot of slots) {
    if (slot.placement === "background") annotateContainer(compiled, slot);
    else insertImageSlot(compiled, slot, {
      layout: { width: slot.display.width === "fill" ? "fill" : "hug", height: "hug" },
      props: { imageSlotId: slot.id, imageSlot: slot },
    });
  }
  return designDocumentSchema.parse(compiled);
}
```

`visualSlotReviewNode` reads `layout_planning`, rejects invalid parent/container references, repairs only deterministic order/density issues, writes `{ document, layoutPlan, issues }`, and persists `visual_slot_review.vN.json`.

- [ ] **Step 4: Rewire element planning and remove legacy image height**

Change `elementPlanningNode` to read `visual_slot_review`. In `createDesignElement("image")`, replace:

```ts
layout: { width: "fill", height: "fixed", fixedHeight: readPositiveNumber(attributes.height, 480) }
```

with:

```ts
layout: { width: "fill", height: "hug" }
```

Add `visual_slot_review` to `AgentStage`, graph annotation/start-node union, exports, and graph edge `layout_planning -> visual_slot_review -> element_planning`.

- [ ] **Step 5: Run tests and commit**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/visual-slot-review/node.test.ts src/nodes/element-planning/compiler.test.ts src/graph.test.ts`

Expected: PASS.

```bash
git add packages/design-agent/src/nodes/visual-slot-review packages/design-agent/src/nodes/element-planning packages/design-agent/src/nodes/index.ts packages/design-agent/src/state.ts packages/design-agent/src/graph.ts packages/design-agent/src/graph.test.ts
git commit -m "feat(agent): validate and compile image slots"
```

## Task 4: Make Image Planning Consume Slots Only

**Files:**
- Modify: `packages/design-agent/src/nodes/image-planning/schema.ts`
- Modify: `packages/design-agent/src/nodes/image-planning/prompt.ts`
- Modify: `packages/design-agent/src/nodes/image-planning/node.ts`
- Modify: `packages/design-agent/src/nodes/image-planning/compiler.ts`
- Test: `packages/design-agent/src/nodes/image-planning/schema.test.ts`
- Test: `packages/design-agent/src/nodes/image-planning/node.test.ts`
- Test: `packages/design-agent/src/nodes/image-planning/compiler.test.ts`

- [ ] **Step 1: Write failing slot-reference tests**

```ts
it("rejects assets that reference an unknown slot", async () => {
  await expect(runImagePlanning({ assets: [{ id: "asset_1", slotId: "missing", purpose: "Hero", promptBrief: "Laptop", priority: "required" }] }))
    .rejects.toThrow(/unknown image slot/i);
});

it("does not change slot layout while compiling prompts", () => {
  const compiled = compileVisualAssetPlan(document, plan);
  expect(findImage(compiled, "feature_visual").layout).toEqual(findImage(document, "feature_visual").layout);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning`

Expected: FAIL because plans still use target/parent references and generation dimensions.

- [ ] **Step 3: Replace visual asset references with slot IDs**

```ts
const visualAssetSchema = z.object({
  id: z.string().min(1).max(120),
  slotId: z.string().min(1),
  purpose: z.string().min(1).max(500),
  promptBrief: z.string().min(1).max(1500),
  priority: z.enum(["required", "recommended", "optional"]),
}).strict();
```

Read reviewed slots from `state.latestArtifactRefs.visual_slot_review`. Validate every `slotId`, prohibit duplicate slot usage, and require all non-optional slots to have an asset. Remove `repairVisualAssetReferences`.

- [ ] **Step 4: Make the compiler metadata-only**

```ts
export function compileVisualAssetPlan(document: DesignDocument, plan: VisualAssetPlan): DesignDocument {
  const compiled = structuredClone(document) as DesignDocument;
  for (const asset of plan.assets) {
    const target = findElementBySlotId(compiled, asset.slotId);
    target.props = { ...target.props, visualAssetId: asset.id, promptBrief: asset.promptBrief, generationPriority: asset.priority };
  }
  return designDocumentSchema.parse(compiled);
}
```

The prompt must state: use listed slot IDs exactly; do not return target IDs, parent IDs, display sizes, or generated dimensions.

- [ ] **Step 5: Run tests and commit**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-planning && corepack pnpm --filter @flowmind/design-agent typecheck`

Expected: PASS.

```bash
git add packages/design-agent/src/nodes/image-planning
git commit -m "refactor(agent): bind image plans to reviewed slots"
```

## Task 5: Derive Generation Requests from Slots and Persist Sources

**Files:**
- Modify: `packages/design-agent/src/nodes/image-generation/schema.ts`
- Modify: `packages/design-agent/src/nodes/image-generation/node.ts`
- Test: `packages/design-agent/src/nodes/image-generation/node.test.ts`
- Modify: `packages/design-agent/src/nodes/document-assembly/schema.ts`
- Modify: `packages/design-agent/src/nodes/document-assembly/node.ts`
- Test: `packages/design-agent/src/nodes/document-assembly/node.test.ts`

- [ ] **Step 1: Write failing generation tests**

```ts
it("uses generation size while preserving display maxHeight", async () => {
  const request = buildImageGenerationRequest(state, document, asset);
  expect(request).toMatchObject({ width: 1536, height: 864, aspectRatio: "wide" });
  await imageGenerationNode(state, options);
  expect(findImage(resultDocument, "hero_visual").props.imageSlot.display.maxHeight).toBe(480);
  expect(findImage(resultDocument, "hero_visual").layout.fixedHeight).toBeUndefined();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-generation/node.test.ts src/nodes/document-assembly/node.test.ts`

Expected: FAIL because requests still read width/height from the visual asset.

- [ ] **Step 3: Resolve request data from `DesignImageSlot`**

```ts
const slot = readSlotFromDocument(document, asset.slotId);
return {
  assetId: asset.id,
  elementId: element.id,
  targetElementId: element.id,
  kind: slot.placement === "background" ? "background_image" : "content_image",
  role: slot.role === "card" || slot.role === "gallery" ? "section" : slot.role,
  priority: asset.priority,
  purpose: asset.purpose,
  prompt: buildPrompt(asset, slot, document, state),
  width: slot.generation.width,
  height: slot.generation.height,
  aspectRatio: generationAspectToken(slot.display.aspectRatio),
};
```

Include safe area, focal point, display ratio, and exact generation dimensions in the image prompt. `applyGeneratedImage` may set URL and generation metadata only.

- [ ] **Step 4: Persist slot-review provenance in assembly**

Add `visualSlotReview` to `sourcePlans` and `sourceArtifacts`; include its ref in `inputRefs`. Keep `layoutPlan`, `visualAssetPlan`, and slot-review issues under `document.variables.agentPlanning`.

- [ ] **Step 5: Run tests and commit**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/image-generation/node.test.ts src/nodes/document-assembly/node.test.ts`

Expected: PASS.

```bash
git add packages/design-agent/src/nodes/image-generation packages/design-agent/src/nodes/document-assembly
git commit -m "feat(agent): generate images from slot metadata"
```

## Task 6: Render Responsive Image Slots

**Files:**
- Modify: `apps/web/src/components/lowcode/DesignCanvas.tsx`
- Test: `apps/web/src/components/lowcode/LowCodePage.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

```ts
it("renders slot dimensions independently from generation dimensions", () => {
  const { container } = render(<LowCodePage initialDocument={slotDocument()} loadStoredDocument={false} />);
  const slot = container.querySelector('[data-node-id="feature_visual"] [data-image-slot]') as HTMLElement;
  expect(slot.style.aspectRatio).toBe("4 / 3");
  expect(slot.style.maxHeight).toBe("420px");
  expect(slot.style.height).toBe("");
  expect(slot.querySelector("img")?.style.objectPosition).toBe("right center");
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `corepack pnpm --filter @flowmind/web test -- LowCodePage.test.tsx -t "renders slot dimensions"`

Expected: FAIL because the renderer uses coarse Tailwind ratios and fixed layout height.

- [ ] **Step 3: Add slot style helpers**

```ts
function imageSlotStyle(element: Extract<DesignElement, { type: "image" }>): CSSProperties {
  const parsed = designImageSlotSchema.safeParse(element.props.imageSlot);
  if (!parsed.success) return {};
  const slot = parsed.data;
  return {
    aspectRatio: slot.display.aspectRatio.replace(":", " / "),
    minHeight: slot.display.minHeight,
    maxHeight: slot.display.maxHeight,
    width: slot.display.width === "fill" ? "100%" : slot.display.width === "half" ? "50%" : "33.333%",
  };
}
```

Apply `data-image-slot`, set `objectFit` and map focal point to `objectPosition`. For background containers, use the same slot metadata to set `backgroundSize`, `backgroundPosition`, `minHeight`, and `maxHeight`.

- [ ] **Step 4: Run web tests and typecheck**

Run: `corepack pnpm --filter @flowmind/web test -- LowCodePage.test.tsx && corepack pnpm --filter @flowmind/web typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/lowcode/DesignCanvas.tsx apps/web/src/components/lowcode/LowCodePage.test.tsx
git commit -m "fix(web): render responsive bounded image slots"
```

## Task 7: Add Visual Review and Deterministic Repair

**Files:**
- Create: `packages/design-agent/src/nodes/visual-review/schema.ts`
- Create: `packages/design-agent/src/nodes/visual-review/prompt.ts`
- Create: `packages/design-agent/src/nodes/visual-review/rules.ts`
- Create: `packages/design-agent/src/nodes/visual-review/node.ts`
- Test: `packages/design-agent/src/nodes/visual-review/node.test.ts`
- Create: `packages/design-agent/src/nodes/visual-repair/node.ts`
- Test: `packages/design-agent/src/nodes/visual-repair/node.test.ts`

- [ ] **Step 1: Write failing quality-gate tests**

```ts
it("fails a page with an oversized slot and missing primary CTA", async () => {
  const result = await visualReviewNode(stateWithDocument(badDocument), options);
  const artifact = await store.readArtifact(result.latestArtifactRefs!.visual_review);
  expect(artifact.output.review).toMatchObject({ passed: false });
  expect(artifact.output.review.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
    "IMAGE_SLOT_TOO_TALL",
    "MISSING_PRIMARY_ACTION",
  ]));
});

it("caps a hero slot through a deterministic repair action", async () => {
  const result = await visualRepairNode(stateWithReview(resizeAction("hero_visual", 480)), options);
  expect(readSlot(resultDocument, "hero_visual").display.maxHeight).toBe(480);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/visual-review src/nodes/visual-repair`

Expected: FAIL because the nodes do not exist.

- [ ] **Step 3: Implement schemas and deterministic rules**

```ts
export const visualReviewSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(z.object({
    code: z.string().min(1),
    elementId: z.string().min(1).optional(),
    severity: z.enum(["low", "medium", "high"]),
    suggestion: z.string().min(1),
  }).strict()).max(30),
  repairActions: z.array(visualRepairActionSchema).max(20),
}).strict();
```

Implement rules for role height, ratio mismatch, missing first-viewport title/visual/action, repeated full-width images, excessive whitespace metadata, and text/background contrast. Compute deterministic score deductions before merging model reflection.

- [ ] **Step 4: Add LLM reflection and deterministic repair**

Bind `visualReviewModelOutputSchema` through `createStructuredOutput`. The model evaluates hierarchy, rhythm, relevance, consistency, and completeness but cannot remove deterministic issues. `visualRepairNode` accepts only the six approved action kinds and writes a new valid document artifact.

- [ ] **Step 5: Run tests and commit**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/visual-review src/nodes/visual-repair && corepack pnpm --filter @flowmind/design-agent typecheck`

Expected: PASS.

```bash
git add packages/design-agent/src/nodes/visual-review packages/design-agent/src/nodes/visual-repair
git commit -m "feat(agent): add visual quality review and repair"
```

## Task 8: Wire Repair State, Resume, Final Output, and End-to-End Verification

**Files:**
- Modify: `packages/design-agent/src/state.ts`
- Modify: `packages/design-agent/src/graph.ts`
- Modify: `packages/design-agent/src/graph.test.ts`
- Modify: `packages/design-agent/src/cli.ts`
- Modify: `packages/design-agent/src/cli.test.ts`
- Modify: `packages/design-agent/src/nodes/routing.ts`
- Modify: `packages/design-agent/src/nodes/routing.test.ts`
- Modify: `packages/design-agent/src/nodes/index.ts`
- Modify: `packages/design-agent/src/nodes/schema-validation/node.ts`
- Modify: `packages/design-agent/src/nodes/final-output/schema.ts`
- Modify: `packages/design-agent/src/nodes/final-output/node.ts`
- Test: `packages/design-agent/src/nodes/final-output/node.test.ts`

- [ ] **Step 1: Write failing graph and resume tests**

```ts
it("repairs visual quality at most twice and emits the best valid document", async () => {
  const result = await createDesignAgentGraph(options).invoke(initialState);
  expect(result.visualRepairCount).toBeLessThanOrEqual(2);
  expect(result.latestArtifactRefs.visual_review).toBeDefined();
  expect(result.latestArtifactRefs.final_output).toBeDefined();
});

it("restores best visual score and repair count when continuing", async () => {
  const resumed = await createContinuationStateFromRun(runDir, "visual_review");
  expect(resumed).toMatchObject({ visualRepairCount: 1, bestVisualScore: 76 });
  expect(resumed.bestDocumentRef?.node).toBe("visual_review");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --filter @flowmind/design-agent test -- src/graph.test.ts src/cli.test.ts src/nodes/routing.test.ts src/nodes/final-output/node.test.ts`

Expected: FAIL because visual state and routes are absent.

- [ ] **Step 3: Add state and graph routing**

```ts
export type DesignAgentState = {
  // existing fields
  visualRepairCount: number;
  bestVisualScore: number;
  bestDocumentRef?: ArtifactRef;
};

export function routeAfterVisualReview(state: DesignAgentState) {
  if (state.stage === "failed") return "failed";
  const passed = state.bestVisualScore >= 80;
  return passed || state.visualRepairCount >= 2 ? "final_output" : "visual_repair";
}
```

Graph changes:

```text
image_generation -> schema_validation
schema_validation(valid) -> visual_review
schema_validation(invalid) -> reflection_repair
visual_review(pass or exhausted) -> final_output
visual_review(fail) -> visual_repair -> schema_validation
```

Update schema validation source precedence to `visual_repair ?? document_repair ?? image_generation ?? document_assembly`.

- [ ] **Step 4: Restore state and enrich final output**

Read the latest `visual_review` and `visual_repair` artifacts in continuation state. Final output must be:

```ts
export type FinalOutput = {
  document: DesignDocument;
  quality: {
    score: number;
    qualityGate: "passed" | "degraded";
    repairCount: number;
    remainingIssues: VisualReviewIssue[];
  };
};
```

Use `bestDocumentRef` when the second repair does not improve score. Never emit final output if schema validation failed.

- [ ] **Step 5: Run complete verification and commit**

Run:

```bash
corepack pnpm --filter @flowmind/design-agent test
corepack pnpm --filter @flowmind/design-agent typecheck
corepack pnpm --filter @flowmind/shared test
corepack pnpm --filter @flowmind/web test
corepack pnpm --filter @flowmind/web typecheck
```

Expected: all commands exit 0.

Then run a fixture CLI flow and inspect artifacts:

```bash
corepack pnpm --filter @flowmind/design-agent agent -- run --message "设计一个现代笔记本产品介绍页" --out artifacts/runs/slot-visual-check --fixture complete --no-interactive
corepack pnpm --filter @flowmind/design-agent agent -- artifacts --run artifacts/runs/slot-visual-check
```

Expected artifacts include `layout_planning`, `visual_slot_review`, `image_planning`, `image_generation`, `visual_review`, and `final_output`; final quality score is at least 80 or explicitly marked degraded after two repairs.

Browser verification at desktop and narrow widths must confirm:

- Image bounds never exceed their slot or parent.
- Display ratio error is below 2%.
- No ordinary slot exceeds 560px.
- First viewport contains title, primary visual, and primary action.
- At most one consecutive full-width image.
- No browser console errors.

```bash
git add packages/design-agent/src/state.ts packages/design-agent/src/graph.ts packages/design-agent/src/graph.test.ts packages/design-agent/src/cli.ts packages/design-agent/src/cli.test.ts packages/design-agent/src/nodes/routing.ts packages/design-agent/src/nodes/routing.test.ts packages/design-agent/src/nodes/index.ts packages/design-agent/src/nodes/schema-validation/node.ts packages/design-agent/src/nodes/final-output
git commit -m "feat(agent): enforce slot-driven visual quality gate"
```
