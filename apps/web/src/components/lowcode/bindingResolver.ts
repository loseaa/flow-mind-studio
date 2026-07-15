import type { DesignBinding, DesignElement, DesignTemplateSegment, DesignVariables, JsonValue } from "@flowmind/shared";
import { createVariablePlaceholderPattern, readVariablePath } from "./variablePath";
import { resolveVariableText } from "./variableResolver";

export type BindingExpectedType = "string" | "boolean" | "number" | "array" | "url";

export type BindingResolution =
  | { ok: true; value: JsonValue; dependencies: string[] }
  | { ok: false; value: JsonValue; dependencies: string[]; error: string };

export function resolveBinding(binding: DesignBinding, variables: DesignVariables, expectedType?: BindingExpectedType): BindingResolution {
  if (binding.kind === "literal") return validateType(binding.value, [], expectedType);
  if (binding.kind === "variable") {
    const result = readVariablePath(variables, binding.path);
    if (!result.ok) {
      if (binding.fallback !== undefined) return validateType(binding.fallback, [binding.path], expectedType);
      return { ok: false, value: "", dependencies: [binding.path], error: `变量 ${binding.path} 不存在` };
    }
    return validateType(result.value, [binding.path], expectedType);
  }

  const dependencies: string[] = [];
  let output = "";
  for (const segment of binding.segments) {
    if (segment.kind === "text") {
      output += segment.value;
      continue;
    }
    dependencies.push(segment.path);
    const result = readVariablePath(variables, segment.path);
    if (!result.ok) return { ok: false, value: output, dependencies, error: `变量 ${segment.path} 不存在` };
    if (result.value === null) continue;
    if (typeof result.value === "object") return { ok: false, value: output, dependencies, error: `变量 ${segment.path} 不能插入文本模板` };
    output += String(result.value);
  }
  return validateType(output, dependencies, expectedType ?? "string");
}

export function resolveElementProperty(element: DesignElement, property: string, variables: DesignVariables, fallback: JsonValue, expectedType?: BindingExpectedType): JsonValue {
  const binding = element.bindings?.[property];
  if (binding) return resolveBinding(binding, variables, expectedType).value;
  const literal = element.props?.[property] ?? fallback;
  return typeof literal === "string" ? resolveVariableText(literal, variables) : literal as JsonValue;
}

export function compileLegacyTemplate(input: string): DesignBinding {
  const matches = [...input.matchAll(createVariablePlaceholderPattern())];
  if (matches.length === 0) return { kind: "literal", value: input };
  if (matches.length === 1 && matches[0][0].length === input.length) return { kind: "variable", path: matches[0][1] };

  const segments: DesignTemplateSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: "text", value: input.slice(cursor, start) });
    segments.push({ kind: "variable", path: match[1] });
    cursor = start + match[0].length;
  }
  if (cursor < input.length) segments.push({ kind: "text", value: input.slice(cursor) });
  return { kind: "template", segments };
}

export function serializeBinding(binding: DesignBinding): string {
  if (binding.kind === "literal") return typeof binding.value === "string" ? binding.value : JSON.stringify(binding.value);
  if (binding.kind === "variable") return `{{${binding.path}}}`;
  return binding.segments.map((segment) => segment.kind === "text" ? segment.value : `{{${segment.path}}}`).join("");
}

function validateType(value: JsonValue, dependencies: string[], expectedType?: BindingExpectedType): BindingResolution {
  if (!expectedType) return { ok: true, value, dependencies };
  const valid = expectedType === "array" ? Array.isArray(value)
    : expectedType === "url" ? typeof value === "string"
      : typeof value === expectedType;
  return valid ? { ok: true, value, dependencies } : { ok: false, value, dependencies, error: `绑定值类型与 ${expectedType} 不兼容` };
}
