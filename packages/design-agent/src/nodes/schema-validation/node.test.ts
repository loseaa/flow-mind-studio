import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { schemaValidationNode } from "./node.js";

describe("schemaValidationNode", () => {
  it("writes a failed artifact instead of throwing when the assembled document is invalid", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-schema-validation-"));
    const store = createArtifactStore({ runDir, threadId: "thread_schema_validation_1" });
    const state = createInitialState("thread_schema_validation_1");
    const documentAssemblyRef = await store.writeArtifact({
      node: "document_assembly",
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

    const result = await schemaValidationNode(
      {
        ...state,
        latestArtifactRefs: { document_assembly: documentAssemblyRef },
      },
      { artifactStore: store },
    );

    const validationRef = result.latestArtifactRefs?.schema_validation;
    expect(result.stage).toBe("failed");
    expect(result.currentNode).toBe("schema_validation");
    expect(result.validationErrors?.length).toBeGreaterThan(0);
    expect(validationRef).toBeDefined();
    await expect(store.readArtifact(validationRef!)).resolves.toMatchObject({
      node: "schema_validation",
      status: "failed",
      output: {
        valid: false,
        errors: expect.any(Array),
      },
      errors: expect.any(Array),
    });
  });

  it("prefers the repaired document when a document repair artifact exists", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-schema-repair-"));
    const store = createArtifactStore({ runDir, threadId: "thread_schema_validation_2" });
    const state = createInitialState("thread_schema_validation_2");
    const documentAssemblyRef = await store.writeArtifact({
      node: "document_assembly",
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
    const documentRepairRef = await store.writeArtifact({
      node: "document_repair",
      status: "success",
      inputRefs: [],
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          id: "repaired_document",
          name: "Repaired Document",
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
        },
      },
      errors: [],
    });

    const result = await schemaValidationNode(
      {
        ...state,
        latestArtifactRefs: {
          document_assembly: documentAssemblyRef,
          document_repair: documentRepairRef,
        },
        validationErrors: ["previous error"],
      },
      { artifactStore: store },
    );

    const validationRef = result.latestArtifactRefs?.schema_validation;
    expect(result.stage).toBe("schema_validation");
    expect(result.validationErrors).toEqual([]);
    expect(validationRef).toBeDefined();
    await expect(store.readArtifact(validationRef!)).resolves.toMatchObject({
      node: "schema_validation",
      status: "success",
      inputRefs: [expect.objectContaining({ node: "document_repair" })],
      output: { valid: true },
    });
  });
});
