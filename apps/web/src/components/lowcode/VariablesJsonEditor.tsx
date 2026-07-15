import { useEffect, useMemo, useState } from "react";
import type { DesignDocument, DesignVariables } from "@flowmind/shared";
import { Input } from "@flowmind/ui";
import { flattenVariablesToRows, nextVariablePath, parseVariableInputValue } from "./variableEditorUtils";
import { parseVariablePath, setVariablePath } from "./variablePath";
import { deleteVariableFromDocument, renameVariablePath } from "./variableOperations";
import { diagnoseVariableReferences, findMutationReferences } from "./variableReferences";

export function VariablesEditor({
  document,
  onChange,
  value = document.variables
}: {
  document: DesignDocument;
  onChange: (value: DesignDocument) => void;
  value?: DesignVariables;
}) {
  const rows = useMemo(() => flattenVariablesToRows(value), [value]);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => formatVariables(value));
  const [error, setError] = useState("");
  const diagnostics = useMemo(() => diagnoseVariableReferences(document), [document]);

  useEffect(() => {
    setJsonDraft(formatVariables(value));
    setError("");
  }, [value]);

  function updatePath(previousPath: string, nextPath: string, currentValue: string) {
    const normalizedPath = nextPath.trim();
    if (normalizedPath === previousPath) return;
    const result = renameVariablePath(document, previousPath, normalizedPath);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError("");
    onChange(result.document);
  }

  function updateValue(path: string, nextValue: string) {
    const result = setVariablePath(value, path, parseVariableInputValue(nextValue));
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError("");
    onChange({ ...document, variables: result.value });
  }

  function addVariable() {
    const result = setVariablePath(value, nextVariablePath(value), "");
    if (result.ok) onChange({ ...document, variables: result.value });
  }

  function deleteVariable(path: string) {
    const references = findMutationReferences(document, path);
    if (references.length > 0 && !window.confirm(`变量 ${path} 正被 ${references.length} 个属性引用，仍然删除吗？`)) return;
    const result = deleteVariableFromDocument(document, path);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError("");
    onChange(result.document);
  }

  function updateJsonDraft(nextDraft: string) {
    setJsonDraft(nextDraft);
    const parsed = parseVariablesDraft(nextDraft);
    if (!parsed.ok) {
      setError("Invalid JSON object");
      return;
    }
    setError("");
    onChange({ ...document, variables: parsed.value });
  }

  function formatJsonDraft() {
    const formatted = formatVariables(value);
    setJsonDraft(formatted);
    setError("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-normal text-[#8a94a3]">Variables</div>
          <p className="mt-1 text-xs leading-5 text-[#5b6472]">Use dot paths for nested data, then reference them as {"{{path}}"}</p>
        </div>
        <button className="h-8 shrink-0 rounded-md border border-[#cbd5df] bg-white px-2 text-xs font-semibold text-[#5b6472] hover:bg-[#f8fafb]" type="button" onClick={addVariable}>
          新增变量
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] font-bold uppercase tracking-normal text-[#8a94a3]">
        <div>Path</div>
        <div>Value</div>
        <div />
      </div>
      <div className="mt-1 space-y-2">
        {rows.map((row) => (
          <VariableRowEditor key={row.path} row={row} onCommitPath={updatePath} onUpdateValue={updateValue} onDelete={deleteVariable} />
        ))}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#b9c4cf] bg-[#f8fafb] p-4 text-sm text-[#5b6472]">暂无变量，点击“新增变量”开始配置。</div>
        ) : null}
      </div>

      {error ? <div role="alert" className="mt-3 rounded-md bg-[#fef2f2] px-2 py-1.5 text-xs font-semibold text-[#dc2626]">{error}</div> : null}
      {diagnostics.length > 0 ? (
        <div className="mt-3 rounded-lg border border-[#f5c2c7] bg-[#fff7f7] p-2 text-xs text-[#991b1b]">
          <div className="font-bold">变量引用问题（{diagnostics.length}）</div>
          {diagnostics.slice(0, 5).map((diagnostic, index) => (
            <div key={`${diagnostic.reference.elementId}-${diagnostic.reference.propertyPath}-${index}`} className="mt-1">
              {diagnostic.reference.elementName} · {diagnostic.reference.propertyPath}：{diagnostic.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-[#d9e1e8] bg-white">
        <button
          aria-expanded={jsonOpen}
          aria-label="高级 JSON"
          className="flex h-9 w-full items-center justify-between px-3 text-left text-xs font-bold text-[#344054]"
          type="button"
          onClick={() => setJsonOpen((open) => !open)}
        >
          <span>高级 JSON</span>
          <span aria-hidden="true" className="text-[#8a94a3]">{jsonOpen ? "收起" : "展开"}</span>
        </button>
        {jsonOpen ? (
          <div className="border-t border-[#d9e1e8] p-3">
            <div className="mb-2 flex justify-end">
              <button className="h-8 rounded-md border border-[#cbd5df] bg-white px-2 text-xs font-semibold text-[#5b6472] hover:bg-[#f8fafb]" type="button" onClick={formatJsonDraft}>
                格式化
              </button>
            </div>
            <textarea
              aria-label="Variables JSON"
              className="min-h-44 w-full resize-y rounded-md border border-[#d9e1e8] bg-white p-3 font-mono text-xs outline-none focus:border-[#9cc8c2] focus:ring-2 focus:ring-[#0f766e]/20"
              value={jsonDraft}
              onChange={(event) => updateJsonDraft(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VariableRowEditor({
  row,
  onCommitPath,
  onDelete,
  onUpdateValue
}: {
  row: { path: string; value: string };
  onCommitPath: (previousPath: string, nextPath: string, currentValue: string) => void;
  onDelete: (path: string) => void;
  onUpdateValue: (path: string, value: string) => void;
}) {
  const [pathDraft, setPathDraft] = useState(row.path);

  useEffect(() => setPathDraft(row.path), [row.path]);

  function commitPath() {
    const parsed = parseVariablePath(pathDraft);
    if (!parsed.ok) return onCommitPath(row.path, pathDraft, row.value);
    onCommitPath(row.path, parsed.value.join("."), row.value);
  }

  return (
    <div className="rounded-lg border border-[#d9e1e8] bg-[#f8fafb] p-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                aria-label={`Variable path: ${row.path}`}
                className="h-8 bg-white font-mono text-xs"
                value={pathDraft}
                onChange={(event) => setPathDraft(event.target.value)}
                onBlur={commitPath}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setPathDraft(row.path);
                }}
              />
              <Input
                aria-label={`Variable value: ${row.path}`}
                className="h-8 bg-white text-xs"
                value={row.value}
                onChange={(event) => onUpdateValue(row.path, event.target.value)}
              />
              <button className="h-8 rounded px-2 text-xs font-semibold text-[#dc2626] hover:bg-white" type="button" onClick={() => onDelete(row.path)}>
                删除
              </button>
            </div>
            <div className="mt-2 rounded-md bg-white px-2 py-1.5 font-mono text-[11px] text-[#0f766e]">{`{{${row.path}}}`}</div>
    </div>
  );
}

function formatVariables(value: DesignVariables) {
  return JSON.stringify(value, null, 2);
}

function parseVariablesDraft(value: string): { ok: true; value: DesignVariables } | { ok: false } {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    return { ok: true, value: parsed as DesignVariables };
  } catch {
    return { ok: false };
  }
}
