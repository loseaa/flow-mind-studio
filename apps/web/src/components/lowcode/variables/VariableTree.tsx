import type { DesignVariables, JsonValue } from "@flowmind/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Input } from "@flowmind/ui";
import { parseVariableInputValue, stringifyVariableInputValue } from "../variableEditorUtils";
import { setVariablePath } from "../variablePath";

export function VariableTree({
  rootPath,
  value,
  variables,
  onChange,
  onSelectPath,
  selectedPath
}: {
  rootPath: string;
  value: JsonValue;
  variables: DesignVariables;
  onChange: (variables: DesignVariables) => void;
  onSelectPath: (path: string) => void;
  selectedPath: string;
}) {
  return <TreeNode depth={0} label={rootPath} path={rootPath} value={value} variables={variables} onChange={onChange} onSelectPath={onSelectPath} selectedPath={selectedPath} root />;
}

function TreeNode({
  depth,
  label,
  onChange,
  onSelectPath,
  path,
  root = false,
  value,
  variables,
  selectedPath
}: {
  depth: number;
  label: string;
  onChange: (variables: DesignVariables) => void;
  onSelectPath: (path: string) => void;
  path: string;
  root?: boolean;
  value: JsonValue;
  variables: DesignVariables;
  selectedPath: string;
}) {
  const container = value !== null && typeof value === "object";
  const [open, setOpen] = useState(true);
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : container ? Object.entries(value) : [];

  return (
    <div>
      <div className={`grid grid-cols-[minmax(72px,1fr)_64px_minmax(86px,1.2fr)] items-center gap-2 border-b border-[#eef2f5] py-2 ${root ? "bg-[#f8fafb]" : ""}`} style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: "8px" }}>
        <div className="flex min-w-0 items-center gap-1.5">
          {container ? (
            <button aria-label={`${open ? "折叠" : "展开"} ${path}`} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-[#e5eaee]" type="button" onClick={() => setOpen((current) => !current)}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : <span className="h-5 w-5 shrink-0" />}
          <button className={`truncate rounded px-1 py-0.5 text-left font-mono text-xs font-semibold ${selectedPath === path ? "bg-[#d5efea] text-[#0f766e]" : "text-[#344054] hover:bg-[#eef2f5]"}`} type="button" onClick={() => onSelectPath(path)}>{label}</button>
        </div>
        <TypeBadge value={value} />
        {container ? (
          <span className="text-xs text-[#8a94a3]">{Array.isArray(value) ? `${value.length} items` : `${entries.length} fields`}</span>
        ) : (
          <Input
            aria-label={`Variable tree value: ${path}`}
            className="h-7 min-w-0 px-2 text-xs"
            value={stringifyVariableInputValue(value)}
            onChange={(event) => {
              const result = setVariablePath(variables, path, parseVariableInputValue(event.target.value));
              if (result.ok) onChange(result.value);
            }}
          />
        )}
      </div>
      {container && open ? entries.map(([key, child]) => (
        <TreeNode key={`${path}.${key}`} depth={depth + 1} label={Array.isArray(value) ? `[${key}]` : key} path={`${path}.${key}`} value={child} variables={variables} onChange={onChange} onSelectPath={onSelectPath} selectedPath={selectedPath} />
      )) : null}
      {container && open && entries.length === 0 ? <div className="border-b border-[#eef2f5] px-8 py-3 text-xs text-[#8a94a3]">空{Array.isArray(value) ? "数组" : "对象"}</div> : null}
    </div>
  );
}

export function TypeBadge({ value }: { value: JsonValue }) {
  const type = value === null ? "Null" : Array.isArray(value) ? "Array" : typeof value === "object" ? "Object" : typeof value === "string" ? "String" : typeof value === "number" ? "Number" : "Boolean";
  const tone = type === "String" ? "bg-[#eef2ff] text-[#4338ca]" : type === "Number" ? "bg-[#f5f3ff] text-[#7c3aed]" : type === "Boolean" ? "bg-[#fff7ed] text-[#c2410c]" : type === "Object" || type === "Array" ? "bg-[#e8f4f2] text-[#0f766e]" : "bg-[#eef2f5] text-[#5b6472]";
  return <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{type}</span>;
}
