import type { DesignVariables, JsonValue } from "@flowmind/shared";

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\s*\}\}/g;

export function resolveVariableText(input: string, variables: DesignVariables): string {
  if (!input || !input.includes("{{")) return input;
  return input.replace(VARIABLE_PATTERN, (placeholder, path: string) => {
    const value = readVariablePath(variables, path);
    return isRenderableVariableValue(value) ? String(value) : placeholder;
  });
}

function readVariablePath(variables: DesignVariables, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = variables;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (current && typeof current === "object") {
      current = current[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function isRenderableVariableValue(value: JsonValue | undefined): value is string | number | boolean {
  if (value === "") return false;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
