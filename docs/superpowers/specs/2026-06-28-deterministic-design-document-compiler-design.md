# Deterministic Design Document Compiler

## Goal

Replace the current single-call generation of a complete recursive `DesignDocument` with small model-generated planning artifacts and deterministic compilation into `fm-design/v1`.

The final document keeps the existing normalized representation:

- `tree` stores hierarchy and order using element IDs.
- `elements` stores the complete properties for each ID.
- `variables` stores global design variables and agent planning metadata.

## Problem

The current `json_planning` node asks the model to generate the entire `DesignDocument`. The schema combines a recursive tree, a discriminated element union, strict style objects, and cross-reference validation. Real model output has failed in two ways:

1. Structural drift, such as string IDs in `tree.children` and properties at the wrong nesting level.
2. Oversized retries that are truncated before valid JSON is completed.

Falling back to a four-element document hides the planning failure and produces an unusable result.

## Proposed Flow

```text
intent_compaction
  -> structure_planning
  -> element_planning
  -> interaction_planning
  -> style_planning
  -> document_compilation
  -> schema_validation
  -> final_output
```

Dependencies are sequential. Element planning depends on the structure IDs; interaction planning depends on concrete elements; style planning depends on element types; compilation waits for all plans.

## Planning Contracts

### PageStructurePlan

The model returns a flat, bounded list instead of a recursive tree:

```ts
type PageStructurePlan = {
  document: {
    id: string;
    name: string;
    viewport: "desktop";
    width: number;
    background: "surface" | "muted" | "white";
  };
  nodes: Array<{
    id: string;
    parentId: string | null;
    order: number;
    type: "page" | "section" | "stack";
    name: string;
    purpose: string;
  }>;
};
```

Constraints:

- Exactly one root node with `parentId: null` and `type: page`.
- IDs are unique.
- Every non-root `parentId` references another node.
- Node count is capped to prevent unbounded output.

### ElementPlan

Elements reference structure IDs and contain semantic content, component type, layout intent, and props. They do not contain the final strict style union and do not repeat the recursive tree.

### InteractionPlan

Interactions are explicit edges: trigger element ID, event, target ID, and action. The compiler stores supported interaction metadata in element props or variables.

### StylePlan

The model selects design tokens and style presets by element ID. It does not reproduce the entire element object. A deterministic style resolver converts presets into the strict `DesignElementStyle` variants.

## Deterministic Compiler

The compiler is pure code with no model calls. It:

1. Validates all planning artifacts and their references.
2. Sorts nodes by `order` and builds `tree` recursively from `parentId`.
3. Produces exactly one complete `elements` entry for every tree ID.
4. Applies type-specific default layout, props, and style values.
5. Merges model-selected content and tokens through allowlisted mappings.
6. Parses the result with `designDocumentSchema` before writing the artifact.

The compiler never silently emits the current minimal fallback document.

## Validation And Repair

Validation occurs at each boundary rather than only at the end:

- Plan schema failure: retry only the failed plan node with its compact error list.
- Broken ID reference: return a bounded repair request containing only affected IDs.
- Compiler invariant failure: write a failed artifact and stop before `final_output`.
- Final schema failure: reflection produces plan-level patch operations, then recompiles.

Raw model output and parse errors remain in the node artifact for diagnosis, but error text is size-limited.

## Artifact Strategy

Each node writes its own versioned artifact:

- `structure_planning.vN.json`
- `element_planning.vN.json`
- `interaction_planning.vN.json`
- `style_planning.vN.json`
- `document_compilation.vN.json`
- `schema_validation.vN.json`
- `final_output.vN.json`

Retries only replace the failed artifact version. Earlier successful plans are reused.

## Migration

Implementation proceeds incrementally:

1. Change current `json_planning` output from `DesignDocument` to `PageStructurePlan` and rename its stage to `structure_planning` only after compatibility tests exist.
2. Introduce the deterministic compiler with structure-only defaults.
3. Expand element planning from ID classification to concrete semantic elements.
4. Add interaction planning.
5. Change style planning to token and preset output.
6. Remove the minimal-document fallback after the compiled path passes integration tests.

During migration, existing artifact readers can accept both `json_planning` and `structure_planning` keys, but new runs write only the new contract once the graph migration is complete.

## Tests

- Structure plan rejects duplicate IDs, missing parents, multiple roots, and cycles.
- Compiler deterministically builds the same tree regardless of model array ordering.
- Every tree ID has exactly one element and every element appears in the tree.
- Type-specific styles always satisfy `designDocumentSchema`.
- A failed style plan retry reuses structure and element artifacts.
- End-to-end fixture and mocked-model runs produce a non-fallback document.
- Real-provider smoke tests are opt-in and never run in the unit test suite.
