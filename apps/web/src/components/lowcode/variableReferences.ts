import type { DesignBinding, DesignDocument, DesignElement } from "@flowmind/shared";
import { createVariablePlaceholderPattern, readVariablePath, VARIABLE_PLACEHOLDER_SOURCE } from "./variablePath";
import { bindingPropertyDefinition } from "./bindingRegistry";

export type VariableReference = {
  kind: "legacy-template" | "variable-binding" | "template-binding";
  elementId: string;
  elementName: string;
  elementType: DesignElement["type"];
  propertyPath: string;
  variablePath: string;
  start: number;
  end: number;
};

export type VariableDiagnostic = {
  severity: "error" | "warning";
  code: "VARIABLE_NOT_FOUND" | "VARIABLE_NOT_RENDERABLE" | "VARIABLE_NULL_VALUE" | "INVALID_VARIABLE_SYNTAX" | "BINDING_TYPE_MISMATCH";
  reference: VariableReference;
  message: string;
};

const BINDABLE_PROPERTIES: Partial<Record<DesignElement["type"], string[]>> = {
  text: ["text"],
  button: ["label"],
  image: ["alt"],
  input: ["label", "placeholder"],
  badge: ["label"],
  divider: ["label"],
  stat: ["label", "value", "delta"]
};

export function findVariableReferences(document: DesignDocument, variablePath?: string): VariableReference[] {
  const references: VariableReference[] = [];
  for (const element of document.elements) {
    for (const property of BINDABLE_PROPERTIES[element.type] ?? []) {
      const value = element.props?.[property];
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(createVariablePlaceholderPattern())) {
        const path = match[1];
        if (variablePath && path !== variablePath) continue;
        references.push({
          kind: "legacy-template",
          elementId: element.id,
          elementName: element.name,
          elementType: element.type,
          propertyPath: `props.${property}`,
          variablePath: path,
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length
        });
      }
    }
    for (const [property, binding] of Object.entries(element.bindings ?? {})) {
      const paths = binding.kind === "variable" ? [binding.path] : binding.kind === "template" ? binding.segments.filter((segment) => segment.kind === "variable").map((segment) => segment.path) : [];
      for (const path of paths) {
        if (variablePath && path !== variablePath) continue;
        references.push({
          kind: binding.kind === "variable" ? "variable-binding" : "template-binding",
          elementId: element.id,
          elementName: element.name,
          elementType: element.type,
          propertyPath: `bindings.${property}`,
          variablePath: path,
          start: 0,
          end: 0
        });
      }
    }
  }
  return references;
}

export function diagnoseVariableReferences(document: DesignDocument): VariableDiagnostic[] {
  const validDiagnostics = findVariableReferences(document).flatMap((reference): VariableDiagnostic[] => {
    const result = readVariablePath(document.variables, reference.variablePath);
    if (!result.ok) {
      return [{ severity: "error", code: "VARIABLE_NOT_FOUND", reference, message: `变量 ${reference.variablePath} 不存在` }];
    }
    if (result.value === null) {
      return [{ severity: "warning", code: "VARIABLE_NULL_VALUE", reference, message: `变量 ${reference.variablePath} 的值为 null` }];
    }
    if (typeof result.value === "object") {
      return [{ severity: "error", code: "VARIABLE_NOT_RENDERABLE", reference, message: `变量 ${reference.variablePath} 不能作为文本渲染` }];
    }
    if (reference.kind === "variable-binding") {
      const property = reference.propertyPath.slice("bindings.".length);
      const expected = bindingPropertyDefinition(reference.elementType, property)?.expectedType;
      const compatible = !expected || expected === "url" || expected === "string" ? typeof result.value === "string"
        : expected === "array" ? Array.isArray(result.value)
          : typeof result.value === expected;
      if (!compatible) return [{ severity: "error", code: "BINDING_TYPE_MISMATCH", reference, message: `变量 ${reference.variablePath} 与 ${expected} 属性不兼容` }];
    }
    return [];
  });
  return [...validDiagnostics, ...findInvalidVariableReferences(document)];
}

export function findMutationReferences(document: DesignDocument, path: string): VariableReference[] {
  const segments = path.split(".");
  const last = segments.at(-1) ?? "";
  if (!/^\d+$/.test(last)) return findVariableReferences(document, path);
  const prefix = segments.slice(0, -1).join(".");
  const removedIndex = Number(last);
  return findVariableReferences(document).filter((reference) => {
    const referenceSegments = reference.variablePath.split(".");
    if (referenceSegments.slice(0, -1).join(".") !== prefix) return false;
    const referenceIndex = referenceSegments.at(-1) ?? "";
    return /^\d+$/.test(referenceIndex) && Number(referenceIndex) >= removedIndex;
  });
}

export function replaceVariableReferences(document: DesignDocument, previousPath: string, nextPath: string): DesignElement[] {
  return document.elements.map((element) => {
    const properties = BINDABLE_PROPERTIES[element.type] ?? [];
    let nextProps = element.props;
    let nextBindings = element.bindings;
    let changed = false;
    for (const property of properties) {
      const value = nextProps?.[property];
      if (typeof value !== "string") continue;
      const replaced = value.replace(createVariablePlaceholderPattern(), (placeholder, path: string) => path === previousPath ? placeholder.replace(path, nextPath) : placeholder);
      if (replaced !== value) {
        nextProps = { ...nextProps, [property]: replaced };
        changed = true;
      }
    }
    if (nextBindings) {
      const replacedBindings = Object.fromEntries(Object.entries(nextBindings).map(([property, binding]) => [property, replaceBindingPath(binding, previousPath, nextPath)]));
      if (JSON.stringify(replacedBindings) !== JSON.stringify(nextBindings)) {
        nextBindings = replacedBindings;
        changed = true;
      }
    }
    return changed ? { ...element, props: nextProps, bindings: nextBindings } : element;
  });
}

function findInvalidVariableReferences(document: DesignDocument): VariableDiagnostic[] {
  const diagnostics: VariableDiagnostic[] = [];
  const candidatePattern = /\{\{\s*([^{}]*?)\s*\}\}/g;
  const validPattern = new RegExp(`^${VARIABLE_PLACEHOLDER_SOURCE}$`);
  for (const element of document.elements) {
    for (const property of BINDABLE_PROPERTIES[element.type] ?? []) {
      const value = element.props?.[property];
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(candidatePattern)) {
        if (validPattern.test(match[0])) continue;
        const reference: VariableReference = {
          kind: "legacy-template",
          elementId: element.id,
          elementName: element.name,
          elementType: element.type,
          propertyPath: `props.${property}`,
          variablePath: match[1].trim(),
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length
        };
        diagnostics.push({ severity: "error", code: "INVALID_VARIABLE_SYNTAX", reference, message: `无效变量语法：${match[0]}` });
      }
    }
  }
  return diagnostics;
}

function replaceBindingPath(binding: DesignBinding, previousPath: string, nextPath: string): DesignBinding {
  if (binding.kind === "variable") return binding.path === previousPath ? { ...binding, path: nextPath } : binding;
  if (binding.kind === "template") return {
    ...binding,
    segments: binding.segments.map((segment) => segment.kind === "variable" && segment.path === previousPath ? { ...segment, path: nextPath } : segment)
  };
  return binding;
}
