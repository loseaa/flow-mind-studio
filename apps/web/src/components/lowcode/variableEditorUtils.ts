import type { DesignVariables, JsonValue } from "@flowmind/shared";
import { deleteVariablePath, setVariablePath } from "./variablePath";

export type VariableRow = {
  path: string;
  value: string;
};

export function parseVariableInputValue(input: string): JsonValue {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^[\[{"]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as JsonValue;
    } catch {
      return input;
    }
  }
  return input;
}

export function stringifyVariableInputValue(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function flattenVariablesToRows(variables: DesignVariables): VariableRow[] {
  return flattenValue(variables);
}

export function setByPath(variables: DesignVariables, path: string, value: JsonValue): DesignVariables {
  const result = setVariablePath(variables, path, value);
  return result.ok ? result.value : { ...variables };
}

export function deleteByPath(variables: DesignVariables, path: string): DesignVariables {
  const result = deleteVariablePath(variables, path);
  return result.ok ? result.value : { ...variables };
}

export function nextVariablePath(variables: DesignVariables) {
  const paths = new Set(flattenVariablesToRows(variables).map((row) => row.path));
  let index = 1;
  let path = `variable${index}`;
  while (paths.has(path) || Object.prototype.hasOwnProperty.call(variables, path)) {
    index += 1;
    path = `variable${index}`;
  }
  return path;
}

function flattenValue(value: JsonValue, prefix = ""): VariableRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenValue(item, prefix ? `${prefix}.${index}` : String(index)));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => flattenValue(nested, prefix ? `${prefix}.${key}` : key));
  }
  return prefix ? [{ path: prefix, value: stringifyVariableInputValue(value) }] : [];
}
