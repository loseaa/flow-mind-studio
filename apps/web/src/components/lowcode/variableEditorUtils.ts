import type { DesignVariables, JsonValue } from "@flowmind/shared";

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
  const segments = normalizePath(path);
  if (segments.length === 0) return { ...variables };
  const root: Record<string, JsonValue> = cloneContainer(variables) as Record<string, JsonValue>;
  let current: Record<string, JsonValue> | JsonValue[] = root;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const last = index === segments.length - 1;
    const key = Array.isArray(current) ? Number(segment) : segment;
    if (last) {
      current[key as never] = value as never;
      break;
    }

    const nextSegment = segments[index + 1];
    const existing = current[key as never] as JsonValue | undefined;
    const nextContainer = isContainer(existing) ? cloneContainer(existing) : isNumericSegment(nextSegment) ? [] : {};
    current[key as never] = nextContainer as never;
    current = nextContainer as Record<string, JsonValue> | JsonValue[];
  }

  return root;
}

export function deleteByPath(variables: DesignVariables, path: string): DesignVariables {
  const segments = normalizePath(path);
  if (segments.length === 0) return { ...variables };
  const root: Record<string, JsonValue> = cloneContainer(variables) as Record<string, JsonValue>;
  let current: Record<string, JsonValue> | JsonValue[] | undefined = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = Array.isArray(current) ? current[Number(segment)] : current?.[segment];
    if (!isContainer(next)) return root;
    current = next as Record<string, JsonValue> | JsonValue[];
  }

  const last = segments[segments.length - 1];
  if (Array.isArray(current)) delete current[Number(last)];
  else delete current?.[last];
  return root;
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

function normalizePath(path: string) {
  return path.split(".").map((segment) => segment.trim()).filter(Boolean);
}

function isNumericSegment(segment: string) {
  return /^\d+$/.test(segment);
}

function isContainer(value: JsonValue | undefined): value is JsonValue[] | Record<string, JsonValue> {
  return Boolean(value && typeof value === "object");
}

function cloneContainer(value: JsonValue[] | Record<string, JsonValue>): JsonValue[] | Record<string, JsonValue> {
  return Array.isArray(value) ? [...value] : { ...value };
}
