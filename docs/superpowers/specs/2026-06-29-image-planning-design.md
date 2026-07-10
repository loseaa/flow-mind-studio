# Independent Image Planning Node

## Goal

Add an independent `image_planning` node that plans meaningful content images and container backgrounds before image generation. Except when the user explicitly requests a page without images, every completed design must contain at least three newly generated image assets.

The default visual density is balanced and adaptive:

- Commerce, brand, editorial, portfolio, and content pages target 5-10 generated assets.
- SaaS, admin, dashboard, and operational pages target 3-5 meaningful assets.
- Forms and configuration pages still require at least 3 assets unless the user explicitly requests no images; assets should be restrained backgrounds or contextual illustrations rather than decorative thumbnails.
- Explicit no-image intent produces zero planned and generated assets.

Existing image URLs, stock placeholders, and default project images do not satisfy the generated-asset minimum.

## Node Flow

```text
style_planning
  -> image_planning
  -> document_assembly
  -> image_generation
  -> schema_validation
  -> final_output
```

`image_planning` owns visual asset placement and intent. `image_generation` owns provider calls and URL backfilling. The two responsibilities remain separate so planning can be validated, retried, inspected, and resumed without regenerating the preceding document plans.

## Inputs

The node reads the latest `style_planning` artifact and receives:

- The five confirmed intent dimensions.
- The original user messages, used to verify explicit no-image intent.
- Container summaries: ID, type, name, purpose, layout, and nearby text.
- Existing image summaries: ID, parent, purpose, aspect ratio, and dimensions.
- The selected style theme and tone.
- The current canvas width.

The model does not receive an unrestricted request to rewrite the complete `DesignDocument`.

## VisualAssetPlan Contract

```ts
type VisualAssetPlan = {
  imagePolicy: "required" | "none";
  visualMode: "standard" | "rich" | "none";
  minimumGeneratedAssets: 0 | 3;
  assets: Array<{
    id: string;
    kind: "content_image" | "background_image";
    role: "hero" | "section" | "thumbnail" | "illustration";
    targetElementId?: string;
    parentId?: string;
    order?: number;
    purpose: string;
    promptBrief: string;
    width: number;
    height: number;
    aspectRatio: "wide" | "square" | "portrait";
    priority: "required" | "recommended" | "optional";
    foregroundTone?: "light" | "dark";
  }>;
  notes: string[];
};
```

The plan is strict and bounded to ten assets. Asset IDs are unique.

Reference rules:

- `background_image` requires `targetElementId` referencing an existing `page`, `section`, or `stack`.
- `content_image` may target an existing image element for regeneration, or provide `parentId` and `order` to create a new image slot.
- A new content image parent must reference an existing container.
- Width and height must be positive integers within provider and canvas limits.
- `foregroundTone` is required for backgrounds.

## Explicit No-Image Intent

The model cannot silently choose `imagePolicy: none`. The node deterministically verifies that the original user messages or confirmed presentation dimension explicitly request no images, for example `不要图片`, `不需要图片`, `无图`, `no images`, or `without images`.

When no such evidence exists:

- `imagePolicy` must be `required`.
- `minimumGeneratedAssets` must be `3`.
- The plan must contain at least three assets with `required` or `recommended` priority.

When explicit evidence exists, the plan must contain no assets and `minimumGeneratedAssets` must be zero.

## Deterministic Compilation

The image planning compiler receives the styled document and validated plan. It performs no model calls.

For content images it:

1. Reuses an existing image element when `targetElementId` references one.
2. Otherwise creates a normalized image element and inserts its ID into the tree under `parentId` at `order`.
3. Writes visual asset metadata into props, including the asset ID, role, purpose, prompt brief, and requested dimensions.
4. Applies strict image defaults for object fit, aspect ratio, layout, and fallback background.

For backgrounds it:

1. Validates the target container.
2. Stores the pending background asset metadata in `document.variables.visualAssets`.
3. Applies a deterministic fallback background color.
4. Uses `foregroundTone` to assign compatible text color tokens to the target and relevant text/button descendants so generated backgrounds do not destroy readability.

The compiler parses the result with `designDocumentSchema` before writing the artifact.

The `image_planning` artifact stores both `visualAssetPlan` and the compiled document. `document_assembly` records the plan and its artifact reference alongside structure, layout, element, interaction, and style plans.

## Prompt Construction

The model supplies a concise semantic `promptBrief`; code constructs the final provider prompt. Every generation prompt includes:

- Page name, page type, audience, and business purpose.
- Asset role, target region, and intended UI usage.
- Exact required width and height in pixels.
- Aspect ratio and safe-cropping instructions.
- Theme, tone, and nearby UI text context.
- Subject placement and negative-space requirements.
- A prohibition on watermarks, logos, unreadable text, UI chrome, and accidental text overlays.

Background prompts additionally require low visual contrast, safe text areas, and subject placement away from foreground content.

## Image Generation

`image_generation` consumes the assembled document and `VisualAssetPlan`, rather than scanning only existing image elements.

- Every planned asset invokes the configured image model. No stock or default URL is used to satisfy the minimum.
- Independent assets use a bounded worker pool with concurrency two.
- Required assets are scheduled before recommended and optional assets.
- Each asset is attempted at most twice.
- Content image URLs are written to `element.props.src`.
- Background image URLs are written to `target.style.base.backgroundImage`.
- Generation metadata records provider, model, prompt, dimensions, attempts, and final status.

The generated count includes successful content and background assets from the current run only.

## Validation And Failure Boundaries

Image planning follows the same planning-node policy as the other agent stages:

- Schema, count, reference, or compiler failure triggers one focused model retry with compact errors.
- A second planning failure writes a failed `image_planning` artifact and stops before document assembly.

Image generation handles independent calls without discarding successful results:

- A failed asset is retried once.
- Optional failures are tolerated only when the generated count still meets the minimum.
- When `imagePolicy` is required and fewer than three assets succeed, `image_generation` writes a failed artifact and stops before `final_output`.
- A missing image provider or API key is a hard failure for required-image pages.
- Explicit no-image pages skip the provider and succeed with zero assets.

All partial results remain in the run directory for inspection and later targeted regeneration.

## State And Artifacts

No large raw image payloads are stored in LangGraph state. Nodes communicate through the existing blackboard artifact store.

New or expanded artifacts:

- `image_planning.vN.json`: validated plan, compiled slot document, input refs, and compact errors.
- `document_assembly.vN.json`: includes `visualAssetPlan` and its source artifact.
- `image_generation.vN.json`: final document, per-asset generation results, generated count, required minimum, and errors.
- `final_output.vN.json`: emitted only after image-count and schema validation pass.

## CLI And Web Progress

CLI and WebSocket progress expose `image_planning` as a separate stage labeled `图片规划`. Image generation reports compact progress per asset without printing provider payloads or API keys.

The web UI continues to show planned asset count, successful generation count, dimensions, and individual status. A required-image failure identifies the failed artifact and does not replace the canvas with a minimal fallback document.

## Tests

### Plan Schema And Compiler

- Accept valid content and background assets.
- Reject duplicate asset IDs and more than ten assets.
- Reject missing targets, non-container backgrounds, and invalid parents.
- Reject fewer than three assets when images are required.
- Accept zero assets only with explicit no-image evidence.
- Insert new image elements deterministically and preserve tree ordering.
- Reuse existing image slots without duplicate IDs.
- Apply background metadata and foreground contrast tokens.
- Produce a document accepted by `designDocumentSchema`.

### Node

- Bind `VisualAssetPlan` through structured model output.
- Retry an undersized or invalid plan once.
- Persist a failed artifact after two invalid attempts.
- Preserve the styled document and all prior artifact references.
- Do not allow the model to claim no-image mode without explicit user evidence.

### Generation

- Generate content and background URLs with exact dimensions in prompts.
- Count only assets generated in the current run.
- Keep generation concurrency at or below two.
- Retry individual assets once.
- Permit optional failures when at least three assets succeed.
- Stop final output when fewer than three assets succeed.
- Skip provider calls for explicit no-image pages.

### Integration

- Complete fixture produces at least three distinct model image URLs.
- Graph and CLI expose the `image_planning` stage.
- Document assembly includes all planning dependencies.
- WebSocket progress displays planning and generation stages.
- A real-provider smoke test remains opt-in and verifies at least three generated assets without exposing credentials.

## Migration

1. Add the plan schema, compiler, prompt, and node without removing the existing generation node.
2. Insert `image_planning` between style planning and document assembly.
3. Add the visual plan to document assembly and CLI fixtures.
4. Refactor image generation to consume the plan with bounded concurrency and retries.
5. Enforce the generated minimum before schema validation and final output.
6. Run unit, graph, CLI, API, and web tests, then perform an opt-in real-provider smoke run.

