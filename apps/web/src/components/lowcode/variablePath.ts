import type { DesignVariables, JsonValue } from "@flowmind/shared";

export const VARIABLE_PLACEHOLDER_SOURCE = String.raw`\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\s*\}\}`;

const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const ROOT_SEGMENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NESTED_SEGMENT_PATTERN = /^[a-zA-Z0-9_]+$/;

export type VariablePathErrorCode =
  | "EMPTY_PATH"
  | "EMPTY_SEGMENT"
  | "UNSAFE_SEGMENT"
  | "INVALID_SEGMENT"
  | "INVALID_ARRAY_INDEX"
  | "PATH_CONFLICT"
  | "PATH_NOT_FOUND";

export type VariablePathError = {
  code: VariablePathErrorCode;
  message: string;
  path: string;
  segment?: string;
};

export type VariablePathResult<T> = { ok: true; value: T } | { ok: false; error: VariablePathError };

export function createVariablePlaceholderPattern() {
  return new RegExp(VARIABLE_PLACEHOLDER_SOURCE, "g");
}

export function parseVariablePath(path: string): VariablePathResult<string[]> {
  const normalized = path.trim();
  if (!normalized) return failure("EMPTY_PATH", "变量路径不能为空", path);
  const rawSegments = normalized.split(".");
  if (rawSegments.some((segment) => !segment.trim())) return failure("EMPTY_SEGMENT", "变量路径不能包含空层级", path);
  const segments = rawSegments.map((segment) => segment.trim());

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (UNSAFE_SEGMENTS.has(segment)) return failure("UNSAFE_SEGMENT", `变量路径不能包含 ${segment}`, path, segment);
    const pattern = index === 0 ? ROOT_SEGMENT_PATTERN : NESTED_SEGMENT_PATTERN;
    if (!pattern.test(segment)) return failure("INVALID_SEGMENT", `无效的变量路径层级：${segment}`, path, segment);
  }
  return { ok: true, value: segments };
}

export function formatVariablePath(segments: string[]) {
  return segments.join(".");
}

export function readVariablePath(variables: DesignVariables, path: string): VariablePathResult<JsonValue> {
  const parsed = parseVariablePath(path);
  if (!parsed.ok) return parsed;
  let current: JsonValue = variables;
  for (const segment of parsed.value) {
    if (Array.isArray(current)) {
      if (!isArrayIndex(segment)) return failure("INVALID_ARRAY_INDEX", `数组路径必须使用非负整数索引：${segment}`, path, segment);
      const index = Number(segment);
      if (index >= current.length || !(index in current)) return failure("PATH_NOT_FOUND", `变量路径不存在：${path}`, path, segment);
      current = current[index];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return failure("PATH_NOT_FOUND", `变量路径不存在：${path}`, path, segment);
    }
  }
  return { ok: true, value: current };
}

export function setVariablePath(variables: DesignVariables, path: string, value: JsonValue): VariablePathResult<DesignVariables> {
  const parsed = parseVariablePath(path);
  if (!parsed.ok) return parsed;
  const root: DesignVariables = { ...variables };
  let source: JsonValue = variables;
  let target: Record<string, JsonValue> | JsonValue[] = root;

  for (let index = 0; index < parsed.value.length; index += 1) {
    const segment = parsed.value[index];
    const last = index === parsed.value.length - 1;
    const targetKey = arrayKey(target, segment, path);
    if (!targetKey.ok) return targetKey;
    if (last) {
      target[targetKey.value as never] = value as never;
      return { ok: true, value: root };
    }

    const sourceChild = getOwnChild(source, segment);
    if (sourceChild.exists && !isContainer(sourceChild.value)) {
      return failure("PATH_CONFLICT", `${formatVariablePath(parsed.value.slice(0, index + 1))} 不是对象或数组`, path, segment);
    }
    const nextSegment = parsed.value[index + 1];
    const next = sourceChild.exists ? cloneContainer(sourceChild.value as JsonValue[] | Record<string, JsonValue>) : isArrayIndex(nextSegment) ? [] : {};
    target[targetKey.value as never] = next as never;
    target = next;
    source = sourceChild.exists ? sourceChild.value : next;
  }
  return { ok: true, value: root };
}

export function deleteVariablePath(variables: DesignVariables, path: string): VariablePathResult<DesignVariables> {
  const parsed = parseVariablePath(path);
  if (!parsed.ok) return parsed;
  const existing = readVariablePath(variables, path);
  if (!existing.ok) return existing;

  const root: DesignVariables = { ...variables };
  let source: JsonValue = variables;
  let target: Record<string, JsonValue> | JsonValue[] = root;
  for (let index = 0; index < parsed.value.length - 1; index += 1) {
    const segment = parsed.value[index];
    const sourceChild = getOwnChild(source, segment);
    if (!sourceChild.exists || !isContainer(sourceChild.value)) return failure("PATH_NOT_FOUND", `变量路径不存在：${path}`, path, segment);
    const cloned = cloneContainer(sourceChild.value);
    const key = arrayKey(target, segment, path);
    if (!key.ok) return key;
    target[key.value as never] = cloned as never;
    source = sourceChild.value;
    target = cloned;
  }

  const last = parsed.value[parsed.value.length - 1];
  if (Array.isArray(target)) {
    if (!isArrayIndex(last)) return failure("INVALID_ARRAY_INDEX", `数组路径必须使用非负整数索引：${last}`, path, last);
    target.splice(Number(last), 1);
  } else {
    delete target[last];
  }
  return { ok: true, value: root };
}

function getOwnChild(value: JsonValue, segment: string): { exists: boolean; value: JsonValue } {
  if (Array.isArray(value)) {
    if (!isArrayIndex(segment)) return { exists: false, value: null };
    const index = Number(segment);
    return index in value ? { exists: true, value: value[index] } : { exists: false, value: null };
  }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, segment)) return { exists: true, value: value[segment] };
  return { exists: false, value: null };
}

function arrayKey(container: Record<string, JsonValue> | JsonValue[], segment: string, path: string): VariablePathResult<string | number> {
  if (!Array.isArray(container)) return { ok: true, value: segment };
  if (!isArrayIndex(segment)) return failure("INVALID_ARRAY_INDEX", `数组路径必须使用非负整数索引：${segment}`, path, segment);
  const index = Number(segment);
  if (index > container.length) return failure("INVALID_ARRAY_INDEX", `数组索引 ${segment} 会产生空洞`, path, segment);
  return { ok: true, value: index };
}

function isArrayIndex(segment: string) {
  return /^(?:0|[1-9]\d*)$/.test(segment) && Number.isSafeInteger(Number(segment));
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isContainer(value: JsonValue): value is JsonValue[] | Record<string, JsonValue> {
  return Array.isArray(value) || isRecord(value);
}

function cloneContainer(value: JsonValue[] | Record<string, JsonValue>): JsonValue[] | Record<string, JsonValue> {
  return Array.isArray(value) ? [...value] : { ...value };
}

function failure(code: VariablePathErrorCode, message: string, path: string, segment?: string): { ok: false; error: VariablePathError } {
  return { ok: false, error: { code, message, path, segment } };
}
