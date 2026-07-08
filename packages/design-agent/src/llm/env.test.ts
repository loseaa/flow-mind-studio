import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadEnvFileInto } from "./env.js";

describe("loadEnvFileInto", () => {
  it("loads dotenv values without overriding existing environment values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "flowmind-design-agent-env-"));
    const filePath = join(dir, ".env");
    const env: Record<string, string | undefined> = {
      LLM_MODEL: "existing-model",
    };

    await writeFile(
      filePath,
      "\uFEFFLLM_API_KEY=test-key\nLLM_MODEL=file-model\nLLM_BASE_URL=https://example.test/v1\n# ignored\n",
      "utf8",
    );

    const loaded = await loadEnvFileInto(filePath, env);

    expect(loaded).toBe(true);
    expect(env).toMatchObject({
      LLM_API_KEY: "test-key",
      LLM_MODEL: "existing-model",
      LLM_BASE_URL: "https://example.test/v1",
    });
  });

  it("returns false when the file does not exist", async () => {
    const env: Record<string, string | undefined> = {};

    await expect(loadEnvFileInto("missing/.env", env)).resolves.toBe(false);
    expect(env).toEqual({});
  });
});
