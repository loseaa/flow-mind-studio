import type { DesignDocument, DesignVariables, JsonValue } from "@flowmind/shared";
import { AlertTriangle, Braces, Database, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button, Input } from "@flowmind/ui";
import { nextVariablePath } from "../variableEditorUtils";
import { deleteVariableFromDocument, renameVariablePath } from "../variableOperations";
import { setVariablePath } from "../variablePath";
import { diagnoseVariableReferences, findMutationReferences, findVariableReferences, type VariableDiagnostic } from "../variableReferences";
import { DeleteVariableDialog, RenameVariableDialog, VariableJsonDialog } from "./VariableDialogs";
import { TypeBadge, VariableTree } from "./VariableTree";
import { INTERNAL_VARIABLE_KEYS } from "../variableVisibility";
import { DataQueryWorkspace } from "./DataQueryWorkspace";

type Category = "variables" | "queries" | "diagnostics" | "system";

export function VariableWorkspace({ document, runtimeVariables = {}, onChange, onLocateElement }: {
  document: DesignDocument;
  runtimeVariables?: DesignVariables;
  onChange: (document: DesignDocument) => void;
  onLocateElement: (elementId: string) => void;
}) {
  const allKeys = useMemo(() => Object.keys(document.variables), [document.variables]);
  const keys = useMemo(() => allKeys.filter((key) => !INTERNAL_VARIABLE_KEYS.has(key)), [allKeys]);
  const systemKeys = useMemo(() => allKeys.filter((key) => INTERNAL_VARIABLE_KEYS.has(key)), [allKeys]);
  const diagnostics = useMemo(() => diagnoseVariableReferences({ ...document, variables: { ...document.variables, ...runtimeVariables } }), [document, runtimeVariables]);
  const [category, setCategory] = useState<Category>("variables");
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState(keys[0] ?? "");
  const [editingPath, setEditingPath] = useState(selectedPath);
  const [renameDraft, setRenameDraft] = useState(editingPath);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [operationError, setOperationError] = useState("");

  useEffect(() => {
    if (selectedPath && Object.prototype.hasOwnProperty.call(document.variables, selectedPath)) return;
    setSelectedPath(keys[0] ?? "");
  }, [document.variables, keys, selectedPath]);

  useEffect(() => {
    setEditingPath(selectedPath);
    setRenameDraft(selectedPath);
  }, [selectedPath]);

  const filteredKeys = keys.filter((key) => {
    const search = query.trim().toLowerCase();
    if (!search) return true;
    return key.toLowerCase().includes(search) || previewValue(document.variables[key]).toLowerCase().includes(search);
  });
  const selectedValue = selectedPath ? document.variables[selectedPath] : undefined;
  const selectedReferences = selectedPath ? referencesForPrefix(document, selectedPath) : [];

  function addVariable() {
    const path = nextVariablePath(document.variables);
    const result = setVariablePath(document.variables, path, "");
    if (!result.ok) return setOperationError(result.error.message);
    onChange({ ...document, variables: result.value });
    setSelectedPath(path);
    setCategory("variables");
  }

  function confirmRename() {
    if (!renameTarget) return;
    const result = renameVariablePath(document, editingPath, renameTarget);
    if (!result.ok) {
      setOperationError(result.error.message);
      setRenameTarget(null);
      return;
    }
    onChange(result.document);
    const nextRoot = renameTarget.trim().split(".")[0];
    setSelectedPath(nextRoot);
    setEditingPath(renameTarget.trim());
    setRenameTarget(null);
    setOperationError("");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const result = deleteVariableFromDocument(document, deleteTarget);
    if (!result.ok) {
      setOperationError(result.error.message);
      setDeleteTarget(null);
      return;
    }
    onChange(result.document);
    setEditingPath(selectedPath === deleteTarget ? (Object.keys(result.document.variables)[0] ?? "") : selectedPath);
    setDeleteTarget(null);
    setOperationError("");
  }

  return (
    <div className="grid min-h-0 min-w-[830px] flex-1 grid-cols-[190px_minmax(380px,1fr)_360px] overflow-auto bg-[#f6f8fa] max-xl:grid-cols-[170px_minmax(340px,1fr)_320px]" data-variable-workspace>
      <aside className="min-h-0 border-r border-[#d9e1e8] bg-white p-3">
        <div className="px-2 py-2">
          <div className="text-sm font-bold text-[#101828]">数据与变量</div>
          <div className="mt-1 text-xs text-[#8a94a3]">管理页面数据和引用</div>
        </div>
        <nav aria-label="变量分类" className="mt-3 space-y-1">
          <CategoryButton active={category === "variables"} count={keys.length} icon={<Database size={15} />} label="页面变量" onClick={() => setCategory("variables")} />
          <CategoryButton active={category === "queries"} icon={<Database size={15} />} label="查询变量" onClick={() => setCategory("queries")} />
          <CategoryButton active={category === "diagnostics"} count={diagnostics.length} danger={diagnostics.some((item) => item.severity === "error")} icon={<AlertTriangle size={15} />} label="引用问题" onClick={() => setCategory("diagnostics")} />
          <CategoryButton active={category === "system"} count={systemKeys.length} icon={<Braces size={15} />} label="系统数据" onClick={() => setCategory("system")} />
        </nav>
      </aside>

      <main className="min-h-0 overflow-auto border-r border-[#d9e1e8] bg-white">
        {category === "variables" ? (
          <>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#d9e1e8] bg-white p-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-2.5 text-[#8a94a3]" size={15} />
                <Input aria-label="搜索变量" className="h-9 w-full pl-9" placeholder="搜索 Key 或当前值" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <Button className="h-9 px-3" onClick={addVariable}><Plus size={15} />新建变量</Button>
              <Button aria-label="高级 JSON" className="h-9 px-3" variant="secondary" onClick={() => setJsonOpen(true)}><Braces size={15} /></Button>
            </div>
            <div className="grid grid-cols-[minmax(130px,1fr)_90px_minmax(120px,1fr)_64px_70px] gap-3 border-b border-[#d9e1e8] bg-[#f8fafb] px-4 py-2 text-[11px] font-bold uppercase text-[#8a94a3]">
              <div>Key</div><div>类型</div><div>当前值</div><div>引用</div><div>状态</div>
            </div>
            {filteredKeys.map((key) => {
              const value = document.variables[key];
              const refs = referencesForPrefix(document, key);
              const issues = diagnostics.filter((item) => item.reference.variablePath === key || item.reference.variablePath.startsWith(`${key}.`));
              return (
                <button key={key} aria-pressed={selectedPath === key} className={`grid w-full grid-cols-[minmax(130px,1fr)_90px_minmax(120px,1fr)_64px_70px] items-center gap-3 border-b border-[#eef2f5] px-4 py-3 text-left hover:bg-[#f8fafb] ${selectedPath === key ? "bg-[#edf8f6]" : "bg-white"}`} type="button" onClick={() => setSelectedPath(key)}>
                  <div className="min-w-0"><div className="truncate text-sm font-semibold text-[#101828]">{humanizeKey(key)}</div><div className="truncate font-mono text-[11px] text-[#5b6472]">{key}</div></div>
                  <TypeBadge value={value} />
                  <div className="truncate text-xs text-[#5b6472]">{previewValue(value)}</div>
                  <div className="text-xs font-semibold text-[#344054]">{refs.length}</div>
                  <div className={`text-xs font-semibold ${issues.length ? "text-[#b91c1c]" : "text-[#0f766e]"}`}>{issues.length ? `${issues.length} 问题` : "正常"}</div>
                </button>
              );
            })}
            {filteredKeys.length === 0 ? <EmptyState title={keys.length ? "没有匹配的变量" : "还没有页面变量"} action={keys.length ? undefined : addVariable} /> : null}
          </>
        ) : category === "queries" ? (
          <DataQueryWorkspace pageId={document.id} />
        ) : category === "diagnostics" ? (
          <DiagnosticsList diagnostics={diagnostics} onLocateElement={onLocateElement} />
        ) : (
          <SystemDataList document={document} keys={systemKeys} />
        )}
      </main>

      <aside className="min-h-0 overflow-auto bg-white">
        {category === "variables" && selectedValue !== undefined ? (
          <div>
            <div className="border-b border-[#d9e1e8] p-4">
              <div className="text-sm font-bold text-[#101828]">变量详情</div>
              <div className="mt-1 text-xs text-[#8a94a3]">编辑 Key、值和查看引用</div>
            </div>
            <div className="space-y-5 p-4">
              <section>
                <label className="text-xs font-bold text-[#344054]" htmlFor="variable-key">Key</label>
                <div className="mt-1.5 flex gap-2">
                  <Input id="variable-key" className="h-9 min-w-0 flex-1 font-mono text-xs" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                  <Button className="h-9 px-3" disabled={!renameDraft.trim() || renameDraft.trim() === editingPath} onClick={() => setRenameTarget(renameDraft.trim())}>修改</Button>
                </div>
                <div className="mt-2 text-xs text-[#5b6472]">选中节点：<code className="text-[#0f766e]">{editingPath}</code></div>
              </section>
              {operationError ? <div role="alert" className="rounded bg-[#fef2f2] px-3 py-2 text-xs font-semibold text-[#b91c1c]">{operationError}</div> : null}
              <section>
                <div className="mb-2 text-xs font-bold text-[#344054]">数据结构</div>
                <div className="overflow-hidden rounded-lg border border-[#d9e1e8]">
                  <VariableTree rootPath={selectedPath} value={selectedValue} variables={document.variables} selectedPath={editingPath} onSelectPath={(path) => { setEditingPath(path); setRenameDraft(path); }} onChange={(variables) => onChange({ ...document, variables })} />
                </div>
              </section>
              <section>
                <div className="text-xs font-bold text-[#344054]">引用位置（{selectedReferences.length}）</div>
                <div className="mt-2 space-y-2">
                  {selectedReferences.map((reference) => <button key={`${reference.elementId}-${reference.propertyPath}`} className="block w-full rounded-md border border-[#d9e1e8] p-2 text-left text-xs hover:bg-[#f8fafb]" type="button" onClick={() => onLocateElement(reference.elementId)}><span className="font-semibold">{reference.elementName}</span><span className="ml-1 text-[#8a94a3]">{reference.propertyPath}</span></button>)}
                  {!selectedReferences.length ? <div className="rounded bg-[#f8fafb] p-2 text-xs text-[#8a94a3]">暂无组件引用</div> : null}
                </div>
              </section>
              <section className="border-t border-[#eef2f5] pt-4">
                <Button className="h-9 w-full" variant="danger" onClick={() => setDeleteTarget(editingPath)}><Trash2 size={15} />删除所选节点</Button>
              </section>
            </div>
          </div>
        ) : <div className="p-6 text-sm text-[#8a94a3]">{category === "queries" ? "查询详情和预览位于中间区域" : "选择变量查看详情"}</div>}
      </aside>

      {renameTarget ? <RenameVariableDialog currentPath={editingPath} nextPath={renameTarget} references={findMutationReferences(document, editingPath)} onCancel={() => setRenameTarget(null)} onConfirm={confirmRename} /> : null}
      {deleteTarget ? <DeleteVariableDialog path={deleteTarget} references={findMutationReferences(document, deleteTarget)} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} /> : null}
      {jsonOpen ? <VariableJsonDialog variables={document.variables} onClose={() => setJsonOpen(false)} onApply={(variables) => { onChange({ ...document, variables }); setJsonOpen(false); }} /> : null}
    </div>
  );
}

function CategoryButton({ active, count, danger = false, icon, label, onClick }: { active: boolean; count?: number; danger?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold ${active ? "bg-[#e8f4f2] text-[#0f766e]" : "text-[#5b6472] hover:bg-[#f8fafb]"}`} type="button" onClick={onClick}>{icon}<span className="flex-1">{label}</span><span className={danger ? "text-[#b91c1c]" : "text-[#8a94a3]"}>{count}</span></button>;
}

function DiagnosticsList({ diagnostics, onLocateElement }: { diagnostics: VariableDiagnostic[]; onLocateElement: (elementId: string) => void }) {
  return <div><div className="border-b border-[#d9e1e8] p-4"><div className="text-sm font-bold">引用问题</div><div className="mt-1 text-xs text-[#8a94a3]">错误会阻止发布，警告不会。</div></div>{diagnostics.map((item, index) => <div key={`${item.reference.elementId}-${item.reference.propertyPath}-${index}`} className="border-b border-[#eef2f5] p-4"><div className={`text-xs font-bold ${item.severity === "error" ? "text-[#b91c1c]" : "text-[#b45309]"}`}>{item.severity === "error" ? "错误" : "警告"} · {item.code}</div><div className="mt-2 text-sm font-semibold text-[#101828]">{item.message}</div><div className="mt-1 text-xs text-[#5b6472]">{item.reference.elementName} · {item.reference.propertyPath}</div><Button className="mt-3 h-8 px-3 text-xs" variant="secondary" onClick={() => onLocateElement(item.reference.elementId)}>定位组件</Button></div>)}{!diagnostics.length ? <EmptyState title="没有变量引用问题" /> : null}</div>;
}

function SystemDataList({ document, keys }: { document: DesignDocument; keys: string[] }) {
  return <div><div className="border-b border-[#d9e1e8] p-4"><div className="text-sm font-bold">系统数据</div><div className="mt-1 text-xs text-[#8a94a3]">Agent 规划元数据，只读展示，不参与页面变量管理。</div></div>{keys.map((key) => <div key={key} className="grid grid-cols-[1fr_90px_1fr] items-center gap-3 border-b border-[#eef2f5] px-4 py-3"><div className="font-mono text-xs font-semibold text-[#344054]">{key}</div><TypeBadge value={document.variables[key]} /><div className="truncate text-xs text-[#8a94a3]">{previewValue(document.variables[key])} · 只读</div></div>)}{!keys.length ? <EmptyState title="暂无系统数据" /> : null}</div>;
}

function EmptyState({ action, title }: { action?: () => void; title: string }) {
  return <div className="grid min-h-[300px] place-items-center p-8 text-center"><div><Database className="mx-auto text-[#b9c4cf]" size={28} /><div className="mt-3 text-sm font-semibold text-[#5b6472]">{title}</div>{action ? <Button className="mt-4 h-9" onClick={action}><Plus size={15} />新建变量</Button> : null}</div></div>;
}

function referencesForPrefix(document: DesignDocument, path: string) {
  return findVariableReferences(document).filter((reference) => reference.variablePath === path || reference.variablePath.startsWith(`${path}.`));
}

function previewValue(value: JsonValue) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return `${Object.keys(value).length} fields`;
  if (value === "") return "空字符串";
  return String(value);
}

function humanizeKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
}
