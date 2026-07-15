import type { DesignVariables, JsonValue } from "@flowmind/shared";
import { createVariablePlaceholderPattern, readVariablePath } from "./variablePath";

export function resolveVariableText(input: string, variables: DesignVariables): string {
  if (!input || !input.includes("{{")) return input;
  return input.replace(createVariablePlaceholderPattern(), (placeholder, path: string) => {
    const result = readVariablePath(variables, path);
    if (!result.ok) return placeholder;
    if (result.value === null) return "";
    return isRenderableVariableValue(result.value) ? String(result.value) : placeholder;
  });
}

function isRenderableVariableValue(value: JsonValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
