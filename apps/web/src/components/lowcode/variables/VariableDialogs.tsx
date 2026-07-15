import type { DesignVariables } from "@flowmind/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@flowmind/ui";
import type { VariableReference } from "../variableReferences";
import { parseVariablePath } from "../variablePath";

export function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#101828]/35 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-label={title} aria-modal="true" className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-xl border border-[#d9e1e8] bg-white shadow-2xl" role="dialog">
        <div className="flex h-12 items-center justify-between border-b border-[#d9e1e8] px-4">
          <h2 className="text-sm font-bold text-[#101828]">{title}</h2>
          <button aria-label="关闭" className="h-8 rounded px-2 text-sm text-[#5b6472] hover:bg-[#eef2f5]" type="button" onClick={onClose}>关闭</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function RenameVariableDialog({ currentPath, nextPath, references, onCancel, onConfirm }: {
  currentPath: string;
  nextPath: string;
  references: VariableReference[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="确认修改变量 Key" onClose={onCancel}>
      <div className="p-4">
        <p className="text-sm text-[#344054]">将 <code>{currentPath}</code> 修改为 <code>{nextPath}</code>。</p>
        <ReferenceSummary references={references} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm}>确认修改</Button>
        </div>
      </div>
    </Modal>
  );
}

export function DeleteVariableDialog({ path, references, onCancel, onConfirm }: {
  path: string;
  references: VariableReference[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={`删除变量 ${path}？`} onClose={onCancel}>
      <div className="p-4">
        <p className="text-sm leading-6 text-[#344054]">删除后无法撤销。被引用的属性会产生发布错误。</p>
        <ReferenceSummary references={references} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="danger" onClick={onConfirm}>强制删除</Button>
        </div>
      </div>
    </Modal>
  );
}

export function VariableJsonDialog({ variables, onApply, onClose }: {
  variables: DesignVariables;
  onApply: (variables: DesignVariables) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(variables, null, 2));
  const [error, setError] = useState("");
  useEffect(() => setDraft(JSON.stringify(variables, null, 2)), [variables]);

  function apply() {
    try {
      const value = JSON.parse(draft) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("根节点必须是 JSON 对象");
      validateVariableKeys(value, "");
      onApply(value as DesignVariables);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JSON 格式错误");
    }
  }

  function format() {
    try {
      setDraft(JSON.stringify(JSON.parse(draft), null, 2));
      setError("");
    } catch {
      setError("JSON 格式错误，无法格式化");
    }
  }

  return (
    <Modal title="高级 JSON 编辑" onClose={onClose}>
      <div className="p-4">
        <p className="mb-3 text-xs text-[#5b6472]">修改保存在草稿中，点击“应用变更”后才会更新画布。</p>
        <textarea aria-label="Variables JSON draft" className="min-h-[360px] w-full resize-y rounded-lg border border-[#d9e1e8] p-3 font-mono text-xs outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/15" value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }} />
        {error ? <div role="alert" className="mt-2 rounded bg-[#fef2f2] px-3 py-2 text-xs font-semibold text-[#b91c1c]">{error}</div> : <div className="mt-2 text-xs font-semibold text-[#0f766e]">变更尚未应用</div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="secondary" onClick={format}>格式化</Button>
          <Button onClick={apply}>应用变更</Button>
        </div>
      </div>
    </Modal>
  );
}

function validateVariableKeys(value: unknown, prefix: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateVariableKeys(item, prefix ? `${prefix}.${index}` : String(index)));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const parsed = parseVariablePath(path);
    if (!parsed.ok) throw new Error(parsed.error.message);
    validateVariableKeys(nested, path);
  }
}

function ReferenceSummary({ references }: { references: VariableReference[] }) {
  return (
    <div className="mt-4 rounded-lg border border-[#d9e1e8] bg-[#f8fafb] p-3">
      <div className="text-xs font-bold text-[#344054]">受影响引用：{references.length}</div>
      {references.length ? references.slice(0, 8).map((reference) => (
        <div key={`${reference.elementId}-${reference.propertyPath}`} className="mt-2 text-xs text-[#5b6472]">{reference.elementName} · {reference.propertyPath}</div>
      )) : <div className="mt-2 text-xs text-[#8a94a3]">没有组件引用该变量。</div>}
    </div>
  );
}
