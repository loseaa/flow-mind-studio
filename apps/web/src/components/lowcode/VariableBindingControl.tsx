import type { DesignBinding, DesignVariables, JsonValue } from "@flowmind/shared";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@flowmind/ui";
import { compileLegacyTemplate, resolveBinding, serializeBinding, type BindingExpectedType } from "./bindingResolver";
import type { BindingMode } from "./bindingRegistry";
import { VariableTextEditor } from "./VariableTextEditor";
import { isUserVariableKey } from "./variableVisibility";

export function VariableBindingControl({
  ariaLabel,
  binding,
  expectedType,
  literalValue,
  modes,
  onChangeBinding,
  onChangeLiteral,
  variables
}: {
  ariaLabel: string;
  binding?: DesignBinding;
  expectedType: BindingExpectedType;
  literalValue: JsonValue;
  modes: BindingMode[];
  onChangeBinding: (binding: DesignBinding | undefined) => void;
  onChangeLiteral: (value: JsonValue) => void;
  variables: DesignVariables;
}) {
  const legacyText = typeof literalValue === "string" ? literalValue : String(literalValue ?? "");
  const inferred = binding ?? compileLegacyTemplate(legacyText);
  const derivedMode: BindingMode = binding?.kind ?? (legacyText.includes("{{") ? inferred.kind === "variable" ? "variable" : "template" : "literal");
  const [mode, setMode] = useState<BindingMode>(derivedMode);
  const paths = useMemo(() => listCompatiblePaths(variables, expectedType), [expectedType, variables]);
  const preview = binding ? resolveBinding(binding, variables, expectedType) : null;
  useEffect(() => setMode(derivedMode), [binding, derivedMode, legacyText]);

  function changeMode(nextMode: BindingMode) {
    setMode(nextMode);
    if (nextMode === "literal") {
      if (binding) onChangeLiteral(resolveBinding(binding, variables, expectedType).value);
      onChangeBinding(undefined);
      return;
    }
    if (nextMode === "variable") {
      const path = inferred.kind === "variable" ? inferred.path : paths[0];
      if (path) onChangeBinding({ kind: "variable", path });
      return;
    }
    const compiled = compileLegacyTemplate(binding ? serializeBinding(binding) : legacyText);
    onChangeBinding(compiled.kind === "template" ? compiled : { kind: "template", segments: [{ kind: "text", value: serializeBinding(compiled) }] });
  }

  return (
    <div className="mt-1 rounded-lg border border-[#d9e1e8] bg-[#f8fafb] p-2" data-binding-control={ariaLabel}>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-[#eef2f5] p-0.5">
        {modes.map((option) => <button key={option} aria-pressed={mode === option} className={`h-7 rounded text-[11px] font-bold ${mode === option ? "bg-white text-[#0f766e] shadow-sm" : "text-[#5b6472]"}`} type="button" onClick={() => changeMode(option)}>{modeLabel(option)}</button>)}
      </div>
      {mode === "literal" ? (
        expectedType === "boolean" ? <label className="mt-2 flex items-center gap-2 text-xs"><input checked={Boolean(literalValue)} type="checkbox" onChange={(event) => onChangeLiteral(event.target.checked)} />启用</label>
          : <VariableTextEditor ariaLabel={ariaLabel} value={legacyText} variables={variables} onChange={onChangeLiteral} />
      ) : mode === "variable" ? (
        <div className="mt-2">
          <select aria-label={`${ariaLabel} variable`} className="h-9 w-full rounded-md border border-[#d9e1e8] bg-white px-2 font-mono text-xs" value={binding?.kind === "variable" ? binding.path : inferred.kind === "variable" ? inferred.path : ""} onChange={(event) => onChangeBinding({ kind: "variable", path: event.target.value })}>
            <option value="" disabled>选择兼容变量</option>
            {paths.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
          {!paths.length ? <div className="mt-2 text-xs font-semibold text-[#b45309]">没有类型兼容的变量</div> : null}
        </div>
      ) : (
        <VariableTextEditor ariaLabel={`${ariaLabel} template`} value={binding ? serializeBinding(binding) : legacyText} variables={variables} onChange={(value) => {
          const compiled = compileLegacyTemplate(value);
          onChangeBinding(compiled.kind === "template" ? compiled : { kind: "template", segments: [{ kind: "text", value }] });
        }} />
      )}
      {preview ? <div className={`mt-2 truncate text-[11px] ${preview.ok ? "text-[#0f766e]" : "text-[#b91c1c]"}`}>{preview.ok ? `当前值：${String(preview.value)}` : preview.error}</div> : null}
    </div>
  );
}

function listCompatiblePaths(value: JsonValue, expectedType: BindingExpectedType, prefix = ""): string[] {
  const compatible = expectedType === "array" ? Array.isArray(value) : expectedType === "url" || expectedType === "string" ? typeof value === "string" : typeof value === expectedType;
  if (compatible && prefix) return [prefix];
  if (Array.isArray(value)) return value.flatMap((item, index) => listCompatiblePaths(item, expectedType, prefix ? `${prefix}.${index}` : String(index)));
  if (value && typeof value === "object") return Object.entries(value)
    .filter(([key]) => Boolean(prefix) || isUserVariableKey(key))
    .flatMap(([key, nested]) => listCompatiblePaths(nested, expectedType, prefix ? `${prefix}.${key}` : key));
  return [];
}

function modeLabel(mode: BindingMode) {
  return mode === "literal" ? "静态值" : mode === "variable" ? "变量" : "模板";
}
