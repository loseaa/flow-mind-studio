import type { DesignDocument } from "@flowmind/shared";
import { deleteVariablePath, readVariablePath, setVariablePath, type VariablePathError } from "./variablePath";
import { findMutationReferences, findVariableReferences, replaceVariableReferences, type VariableReference } from "./variableReferences";

export type VariableOperationResult =
  | { ok: true; document: DesignDocument; updatedReferences: number }
  | { ok: false; error: VariablePathError };

export function renameVariablePath(document: DesignDocument, previousPath: string, nextPath: string): VariableOperationResult {
  if (previousPath === nextPath.trim()) return { ok: true, document, updatedReferences: 0 };
  const existing = readVariablePath(document.variables, previousPath);
  if (!existing.ok) return existing;
  const target = readVariablePath(document.variables, nextPath);
  if (target.ok) {
    return { ok: false, error: { code: "PATH_CONFLICT", path: nextPath, message: `变量路径 ${nextPath} 已存在` } };
  }
  if (target.error.code !== "PATH_NOT_FOUND") return target;
  const removed = deleteVariablePath(document.variables, previousPath);
  if (!removed.ok) return removed;
  const inserted = setVariablePath(removed.value, nextPath, existing.value);
  if (!inserted.ok) return inserted;
  const references = findVariableReferences(document, previousPath);
  return {
    ok: true,
    document: {
      ...document,
      variables: inserted.value,
      elements: replaceVariableReferences(document, previousPath, nextPath.trim())
    },
    updatedReferences: references.length
  };
}

export function deleteVariableFromDocument(document: DesignDocument, path: string): VariableOperationResult & { references?: VariableReference[] } {
  const references = findMutationReferences(document, path);
  const removed = deleteVariablePath(document.variables, path);
  if (!removed.ok) return removed;
  return { ok: true, document: { ...document, variables: removed.value }, updatedReferences: 0, references };
}
