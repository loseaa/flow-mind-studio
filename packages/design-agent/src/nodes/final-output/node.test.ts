import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactStore } from "../../artifacts/store.js";
import { createInitialState } from "../../state.js";
import { finalOutputNode } from "./node.js";

describe("finalOutputNode", () => {
  it("marks the artifact manifest as completed", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-final-output-"));
    const store = createArtifactStore({ runDir, threadId: "thread_final_output_1" });
    const state = createInitialState("thread_final_output_1");
    const schemaValidationRef = await store.writeArtifact({
      node: "schema_validation",
      status: "success",
      inputRefs: [],
      output: {
        document: {
          schemaVersion: "fm-design/v1",
          id: "final_document",
          name: "Final Document",
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

    const result = await finalOutputNode(
      {
        ...state,
        latestArtifactRefs: { schema_validation: schemaValidationRef },
      },
      { artifactStore: store },
    );

    const manifest = await store.readManifest();
    expect(result.stage).toBe("final_output");
    expect(result.latestArtifactRefs?.final_output).toBeDefined();
    expect(manifest.status).toBe("completed");
    expect(manifest.currentNode).toBe("final_output");
  });
});