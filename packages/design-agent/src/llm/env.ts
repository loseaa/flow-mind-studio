import { readFile } from "node:fs/promises";

export type MutableEnv = Record<string, string | undefined>;

export async function loadEnvFileInto(filePath: string, env: MutableEnv = process.env): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }

  for (const line of raw.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
    if (env[key] === undefined) env[key] = value;
  }

  return true;
}

function unquoteEnvValue(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
