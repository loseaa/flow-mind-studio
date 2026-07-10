# Page Structure Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace model-facing full `DesignDocument` generation with a bounded flat `PageStructurePlan`, while compiling a schema-valid compatibility document for downstream nodes.

**Architecture:** The model returns document metadata and flat container nodes. A pure compiler validates references, builds `tree`, and creates complete container elements. The artifact temporarily stores both `structurePlan` and compiled `document`.

**Tech Stack:** TypeScript, Zod, LangGraph, Vitest, `@flowmind/shared`.

---

### Task 1: PageStructurePlan Schema

**Files:**
- Modify: `packages/design-agent/src/nodes/json-planning/schema.ts`
- Create: `packages/design-agent/src/nodes/json-planning/schema.test.ts`

- [ ] Write tests proving a valid plan parses and duplicate IDs, multiple roots, missing parents, cycles, and over 40 nodes fail.
- [ ] Run `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/json-planning/schema.test.ts`; expect RED because the schema is missing.
- [ ] Add strict document metadata and flat node schemas. Nodes contain `id`, nullable `parentId`, nonnegative `order`, `page|section|stack` type, `name`, and `purpose`.
- [ ] Add `superRefine` validation for unique IDs, exactly one page root, valid parent references, and cycles.
- [ ] Re-run the schema test; expect GREEN.

### Task 2: Deterministic Structure Compiler

**Files:**
- Create: `packages/design-agent/src/nodes/json-planning/compiler.ts`
- Create: `packages/design-agent/src/nodes/json-planning/compiler.test.ts`

- [ ] Write tests proving sibling order is deterministic, every tree ID has one element, and `designDocumentSchema` accepts the result.
- [ ] Run `corepack pnpm --filter @flowmind/design-agent test -- src/nodes/json-planning/compiler.test.ts`; expect RED because the compiler is missing.
- [ ] Implement `compilePageStructurePlan(plan): DesignDocument`: validate the plan, group children by `parentId`, sort by `order` then `id`, build recursive tree nodes, create type-specific container elements with allowlisted defaults, and parse the result with `designDocumentSchema`.
- [ ] Re-run compiler tests; expect GREEN.

### Task 3: Json Planning Node Migration

**Files:**
- Modify: `packages/design-agent/src/nodes/json-planning/schema.ts`
- Modify: `packages/design-agent/src/nodes/json-planning/prompt.ts`
- Modify: `packages/design-agent/src/nodes/json-planning/node.ts`
- Modify: `packages/design-agent/src/nodes/json-planning/node.test.ts`

- [ ] Change the node test mock from `{ document }` to `{ structurePlan }`; assert the artifact includes the plan, compiled document, and no errors.
- [ ] Run the node test; expect RED against the old contract.
- [ ] Change model output to `{ structurePlan: pageStructurePlanSchema }` and artifact output to `{ structurePlan, document }`.
- [ ] Update the prompt to forbid recursive trees, complete elements, and styles.
- [ ] Compile the plan in code. The retry prompt uses one valid flat plan example instead of a full document example.
- [ ] Keep a deterministic structure fallback only as a migration compatibility path and preserve compact errors in the artifact.
- [ ] Run schema, compiler, and node tests plus package typecheck; expect GREEN.

### Task 4: Graph Compatibility

**Files:**
- Modify only when required: `packages/design-agent/src/cli.test.ts`
- Modify only when required: `packages/design-agent/src/graph.test.ts`

- [ ] Run graph and CLI tests. Existing downstream nodes must continue reading `output.document`.
- [ ] Update only fixture responses that still return the old json-planning model contract.
- [ ] Run `corepack pnpm --filter @flowmind/design-agent test` and `corepack pnpm --filter @flowmind/design-agent typecheck`; expect all checks to pass.