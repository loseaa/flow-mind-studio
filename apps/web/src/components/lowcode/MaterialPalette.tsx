import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { Database, Play, Upload } from "lucide-react";
import type { DataQuery, DataQueryResult, DesignDocument, JsonValue } from "@flowmind/shared";
import { Button, Input } from "@flowmind/ui";
import { aiActions, complexMaterialCategoriesFor, materialCategories, type ComplexMaterialDefinition, type MaterialDefinition } from "./lowcodeData";
import { CustomScrollbar } from "../CustomScrollbar";
import { preventNativeMaterialSelection, useMaterialDragSources } from "./useMaterialDragSources";
import { apiGet, apiPostStrict } from "../../api";
import { readVariablePath } from "./variablePath";
import { INTERNAL_VARIABLE_KEYS } from "./variableVisibility";
import type { InferableData } from "./componentInference";

export function MaterialPalette({
  complexMaterials,
  onAdd,
  onAddComplex,
  onDeleteCustomComplex,
  onInferData,
  onOpenVariableWorkspace,
  onUploadImage,
  document
}: {
  document: DesignDocument;
  complexMaterials: ComplexMaterialDefinition[];
  onAdd: (materialId: MaterialDefinition["id"], parentId?: string, index?: number) => void;
  onAddComplex: (id: ComplexMaterialDefinition["id"], parentId?: string, index?: number) => void;
  onDeleteCustomComplex?: (id: ComplexMaterialDefinition["id"]) => void;
  onInferData: (input: InferableData, parentId?: string, index?: number) => void;
  onOpenVariableWorkspace: () => void;
  onUploadImage: (file: File | undefined) => Promise<void> | void;
}) {
  const onAddRef = useRef(onAdd);
  const onAddComplexRef = useRef(onAddComplex);
  const onInferDataRef = useRef(onInferData);
  const queryOutputsRef = useRef(new Map<string, { query: DataQuery; result: DataQueryResult }>());
  const [activeTab, setActiveTab] = useState<"basic" | "complex" | "variables">("complex");
  const [uploading, setUploading] = useState(false);
  onAddRef.current = onAdd;
  onAddComplexRef.current = onAddComplex;
  onInferDataRef.current = onInferData;

  useMaterialDragSources({
    selector: "[data-material-type], [data-complex-material-id], [data-data-drag-path]",
    onDrop: (target, placement) => {
      const materialId = target.getAttribute("data-material-id") as MaterialDefinition["id"] | null;
      const complexId = target.getAttribute("data-complex-material-id") as ComplexMaterialDefinition["id"] | null;
      if (materialId) onAddRef.current(materialId, placement.parentId, placement.index);
      if (complexId) onAddComplexRef.current(complexId, placement.parentId, placement.index);
      const path = target.getAttribute("data-data-drag-path");
      const source = target.getAttribute("data-data-drag-source");
      if (path && source === "pageVariable") {
        const resolved = readVariablePath(document.variables, path);
        if (resolved.ok) onInferDataRef.current({ source, path, label: target.getAttribute("data-data-label") || path, value: resolved.value }, placement.parentId, placement.index);
      }
      if (path && source === "queryResult") {
        const output = queryOutputsRef.current.get(target.getAttribute("data-query-id") ?? "");
        if (output) onInferDataRef.current(queryInferenceInput(output.query, output.result), placement.parentId, placement.index);
      }
    }
  });

  return (
    <CustomScrollbar className="relative z-40 h-full min-h-0 border-r border-[#d9e1e8] bg-white max-lg:hidden" variant="slate">
      <div className="p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#101828]">物料区</div>
            <div className="mt-0.5 text-[11px] text-[#8a94a3]">拖拽到画布插入</div>
          </div>
          <span className="rounded bg-[#e8f4f2] px-1.5 py-0.5 text-[10px] font-bold text-[#0f766e]">复杂</span>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-[#eef2f5] p-1">
          <button
            type="button"
            aria-pressed={activeTab === "basic"}
            className={`h-8 rounded text-xs font-bold transition ${activeTab === "basic" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
            onClick={() => setActiveTab("basic")}
          >
            基础物料
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "complex"}
            className={`h-8 rounded text-xs font-bold transition ${activeTab === "complex" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
            onClick={() => setActiveTab("complex")}
          >
            复杂物料
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "variables"}
            className={`h-8 rounded text-xs font-bold transition ${activeTab === "variables" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
            onClick={() => setActiveTab("variables")}
          >
            变量
          </button>
        </div>

        {activeTab === "basic" ? (
          <BasicMaterialsTab onAddRef={onAddRef} onUploadImage={onUploadImage} uploading={uploading} setUploading={setUploading} />
        ) : activeTab === "complex" ? (
          <ComplexMaterialsTab complexMaterials={complexMaterials} onAddComplexRef={onAddComplexRef} onDeleteCustomComplex={onDeleteCustomComplex} />
        ) : (
          <VariablesTab document={document} onInferDataRef={onInferDataRef} onOpenVariableWorkspace={onOpenVariableWorkspace} queryOutputsRef={queryOutputsRef} />
        )}
      </div>
    </CustomScrollbar>
  );
}

function BasicMaterialsTab({
  onAddRef,
  onUploadImage,
  setUploading,
  uploading
}: {
  onAddRef: MutableRefObject<(materialId: MaterialDefinition["id"], parentId?: string, index?: number) => void>;
  onUploadImage: (file: File | undefined) => Promise<void> | void;
  setUploading: (value: boolean) => void;
  uploading: boolean;
}) {
  return (
    <>
      <Input placeholder="搜索基础物料" className="mt-3 h-9" />
      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#b9c4cf] bg-[#f8fafb] px-3 py-2 text-sm font-semibold text-[#344054] hover:border-[#8a94a3] hover:bg-white">
        <Upload size={16} />
        <span>{uploading ? "上传中..." : "上传图片物料"}</span>
        <input
          aria-label="上传图片物料"
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setUploading(true);
            void Promise.resolve(onUploadImage(file)).finally(() => {
              setUploading(false);
              event.target.value = "";
            });
          }}
        />
      </label>
      <div className="mt-4 space-y-5">
        {materialCategories.map((category) => (
          <section key={category.title} className="space-y-3">
            <SectionTitle>{category.title}</SectionTitle>
            {category.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  data-material-drag-source
                  data-material-id={item.id}
                  data-material-type={item.type}
                  type="button"
                  className="flex w-full cursor-grab touch-none select-none items-start gap-3 rounded-lg border border-[#d9e1e8] bg-white p-3 text-left transition hover:border-[#b9c4cf] hover:bg-[#f8fafb]"
                  onDragStart={preventNativeMaterialSelection}
                  onMouseDown={preventNativeMaterialSelection}
                  onPointerDown={preventNativeMaterialSelection}
                  onClick={(event) => {
                    const target = event.currentTarget;
                    if (target.getAttribute("data-was-dragged") === "true") {
                      target.removeAttribute("data-was-dragged");
                      return;
                    }
                    onAddRef.current(item.id);
                  }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#eef2f5] text-[#5b6472]">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#5b6472]">{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}

function ComplexMaterialsTab({
  complexMaterials,
  onAddComplexRef,
  onDeleteCustomComplex
}: {
  complexMaterials: ComplexMaterialDefinition[];
  onAddComplexRef: MutableRefObject<(id: ComplexMaterialDefinition["id"], parentId?: string, index?: number) => void>;
  onDeleteCustomComplex?: (id: ComplexMaterialDefinition["id"]) => void;
}) {
  const categories = complexMaterialCategoriesFor(complexMaterials);
  return (
    <>
      <a
        data-custom-complex-open
        href="/app/lowcode/materials/new"
        className="mt-4 flex w-full items-center justify-between rounded-md border border-dashed border-[#8fb9b2] bg-[#f0faf8] px-3 py-2 text-left text-sm font-bold text-[#0f766e] hover:bg-[#e6f4f1]"
      >
        <span>新建复杂物料</span>
        <span className="text-lg leading-none">+</span>
      </a>
      <div className="mt-4 space-y-5">
        {categories.map((category) => (
          <section key={category.title} className="space-y-3">
            <SectionTitle>{category.title}</SectionTitle>
            {category.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  data-material-drag-source
                  data-complex-material-id={item.id}
                  type="button"
                  className="flex w-full cursor-grab touch-none select-none flex-col gap-2 rounded-md border border-[#d9e1e8] bg-white p-2.5 text-left transition hover:border-[#b9c4cf] hover:bg-[#f8fafb]"
                  onDragStart={preventNativeMaterialSelection}
                  onMouseDown={preventNativeMaterialSelection}
                  onPointerDown={preventNativeMaterialSelection}
                  onClick={(event) => {
                    const target = event.currentTarget;
                    if (target.getAttribute("data-was-dragged") === "true") {
                      target.removeAttribute("data-was-dragged");
                      return;
                    }
                    onAddComplexRef.current(item.id);
                  }}
                >
                  <span className="flex items-start gap-3">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md bg-[#e6f4f1] text-[#0f766e]">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-[#101828]">{item.label}</span>
                      <span className="mt-1 block text-[10px] leading-4 text-[#5b6472]">{item.desc}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1 pl-[38px]">
                    {item.composition.map((part) => (
                      <span key={part} className="rounded bg-[#eef2f5] px-1.5 py-0.5 text-[9px] font-medium text-[#5b6472]">
                        {part}
                      </span>
                    ))}
                    {item.id.startsWith("custom_") && onDeleteCustomComplex ? (
                      <span
                        data-delete-custom-complex-id={item.id}
                        role="button"
                        tabIndex={0}
                        className="rounded bg-[#fff1f2] px-1.5 py-0.5 text-[9px] font-semibold text-[#b42318]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteCustomComplex(item.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteCustomComplex(item.id);
                        }}
                      >
                        删除
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <SectionTitle>AI / MCP 动作</SectionTitle>
        {aiActions.map((item) => (
          <button key={item} type="button" className="w-full rounded-lg border border-dashed border-[#b9c4cf] bg-[#f8fafb] px-3 py-2 text-left text-sm font-medium text-[#5b6472]">
            {item}
          </button>
        ))}
      </div>
    </>
  );
}

function VariablesTab({
  document,
  onInferDataRef,
  onOpenVariableWorkspace,
  queryOutputsRef
}: {
  document: DesignDocument;
  onInferDataRef: MutableRefObject<(input: InferableData, parentId?: string, index?: number) => void>;
  onOpenVariableWorkspace: () => void;
  queryOutputsRef: MutableRefObject<Map<string, { query: DataQuery; result: DataQueryResult }>>;
}) {
  const variables = inferableVariableEntries(document.variables);
  const [queries, setQueries] = useState<DataQuery[]>([]);
  const [previews, setPreviews] = useState<Record<string, DataQueryResult>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void apiGet<DataQuery[]>(`/data-queries?pageId=${encodeURIComponent(document.id)}`, []).then(setQueries);
  }, [document.id]);

  async function previewQuery(query: DataQuery) {
    setBusyId(query.id);
    setError("");
    try {
      const result = await apiPostStrict<DataQueryResult>(`/data-queries/${query.id}/preview`, { parameters: {} });
      setPreviews((current) => ({ ...current, [query.id]: result }));
      queryOutputsRef.current.set(query.id, { query, result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "查询预览失败");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <div>
        <div className="flex items-center justify-between"><div className="text-sm font-bold">全局变量</div><span className="rounded bg-[#e8f4f2] px-1.5 py-0.5 text-[10px] font-bold text-[#0f766e]">组件推导</span></div>
        <p className="mt-1 text-xs leading-5 text-[#5b6472]">拖拽变量到画布，自动生成匹配组件。</p>
        <div className="mt-3 space-y-2">
          {variables.map((entry) => (
            <DataDragButton key={entry.path} label={entry.label} path={entry.path} source="pageVariable" summary={valueSummary(entry.value)} onActivate={() => onInferDataRef.current({ source: "pageVariable", path: entry.path, label: entry.label, value: entry.value })} />
          ))}
          {!variables.length ? <div className="rounded-md bg-[#f8fafb] p-3 text-xs text-[#8a94a3]">暂无可推导的页面变量</div> : null}
        </div>
      </div>
      <section>
        <SectionTitle>Query 输出</SectionTitle>
        <p className="mt-1 text-xs leading-5 text-[#5b6472]">Query 运行并产生数据后才能拖拽。</p>
        {error ? <div role="alert" className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}
        <div className="mt-3 space-y-2">
          {queries.map((query) => {
            const preview = previews[query.id];
            return (
              <div key={query.id} className="rounded-lg border border-[#d9e1e8] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate text-xs font-bold text-[#101828]">{query.name}</div><code className="text-[10px] text-[#0f766e]">query.{query.key}.data</code></div>
                  <Button className="h-7 shrink-0 px-2 text-[10px]" variant="secondary" disabled={busyId === query.id} onClick={() => void previewQuery(query)}><Play size={11} />{preview ? "刷新" : "运行"}</Button>
                </div>
                {preview ? <DataDragButton label={query.name} path={`query.${query.key}.data`} queryId={query.id} source="queryResult" summary={`${preview.rowCount} 行 · ${preview.fields.length} 字段`} onActivate={() => onInferDataRef.current(queryInferenceInput(query, preview))} /> : null}
              </div>
            );
          })}
          {!queries.length ? <div className="rounded-md bg-[#f8fafb] p-3 text-xs text-[#8a94a3]">当前页面还没有 Query</div> : null}
        </div>
      </section>
      <button className="h-9 w-full rounded-md bg-[#0f766e] px-3 text-sm font-bold text-white hover:bg-[#0b625c]" type="button" onClick={onOpenVariableWorkspace}>打开数据与变量</button>
    </div>
  );
}

function DataDragButton({ label, onActivate, path, queryId, source, summary }: { label: string; onActivate: () => void; path: string; queryId?: string; source: InferableData["source"]; summary: string }) {
  return (
    <button
      data-data-drag-path={path}
      data-data-drag-source={source}
      data-data-label={label}
      data-query-id={queryId}
      type="button"
      className="mt-2 flex w-full cursor-grab touch-none select-none items-center gap-2 rounded-md border border-[#d9e1e8] bg-[#f8fafb] p-2.5 text-left hover:border-[#8fb9b2] hover:bg-[#f0faf8]"
      onDragStart={preventNativeMaterialSelection}
      onMouseDown={preventNativeMaterialSelection}
      onPointerDown={preventNativeMaterialSelection}
      onClick={(event) => {
        if (event.currentTarget.getAttribute("data-was-dragged") === "true") {
          event.currentTarget.removeAttribute("data-was-dragged");
          return;
        }
        onActivate();
      }}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-[#e8f4f2] text-[#0f766e]"><Database size={14} /></span>
      <span className="min-w-0"><span className="block truncate text-xs font-bold text-[#101828]">{label}</span><span className="block truncate font-mono text-[10px] text-[#5b6472]">{path}</span><span className="block text-[10px] text-[#8a94a3]">{summary}</span></span>
    </button>
  );
}

function inferableVariableEntries(variables: DesignDocument["variables"]) {
  const entries: Array<{ path: string; label: string; value: JsonValue }> = [];
  for (const [key, value] of Object.entries(variables)) {
    if (INTERNAL_VARIABLE_KEYS.has(key)) continue;
    entries.push({ path: key, label: key, value });
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [field, child] of Object.entries(value)) {
        if (child === null || typeof child !== "object") entries.push({ path: `${key}.${field}`, label: field, value: child });
      }
    }
  }
  return entries;
}

function valueSummary(value: JsonValue) {
  if (Array.isArray(value)) return `${value.length} 项数组`;
  if (value && typeof value === "object") return `${Object.keys(value).length} 字段对象`;
  if (value === null) return "空值";
  return typeof value;
}

function queryInferenceInput(query: DataQuery, result: DataQueryResult): InferableData {
  return {
    source: "queryResult",
    path: `query.${query.key}.data`,
    label: query.name,
    value: JSON.parse(JSON.stringify(result.rows)) as JsonValue,
    columns: result.fields.map((field) => field.name),
    queryId: query.id,
    queryRevision: query.revision
  };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-normal text-[#8a94a3]">{children}</div>;
}
