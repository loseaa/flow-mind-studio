import { useEffect, useMemo, useState } from "react";
import type { DataQuery, DataQueryResult, DesignDocument, DesignElement, DesignElementStyle, DesignLayout, JsonValue, LowCodeImageAsset } from "@flowmind/shared";
import { designDocumentSchema } from "@flowmind/shared";
import { apiGet, apiPostStrict, apiUpload } from "../../api";
import { DesignCanvas } from "../../components/lowcode/DesignCanvas";
import { LowCodeToolbar } from "../../components/lowcode/LowCodeToolbar";
import { LowCodeAgentChat } from "../../components/lowcode/LowCodeAgentChat";
import { MaterialPalette } from "../../components/lowcode/MaterialPalette";
import { PropertyInspector } from "../../components/lowcode/PropertyInspector";
import { aiGeneratedDesignDocument } from "../../components/lowcode/aiGeneratedDesignDocument";
import {
  CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY,
  complexMaterials,
  createElementFromMaterial,
  createImageElementFromAsset,
  customComplexMaterialRecordToDefinition,
  fallbackDesignDocument,
  isContainerElement,
  readCustomComplexMaterialRecords,
  type ComplexMaterialDefinition,
  type CustomComplexMaterialRecord,
  type MaterialDefinition
} from "../../components/lowcode/lowcodeData";
import { elementMap, insertElement, insertElementTree, moveNode, removeNode, reparentNode, updateElement, updateElementLayout, updateElementProps, updateElementStyle } from "../../components/lowcode/designDocumentOps";
import { diagnoseVariableReferences } from "../../components/lowcode/variableReferences";
import { VariableWorkspace } from "../../components/lowcode/variables/VariableWorkspace";
import { inferComponentTree, type InferableData } from "../../components/lowcode/componentInference";

const STORAGE_KEY = "flowmind.lowcode.designDocument";

type LatestDesignAgentPreview = {
  runId: string;
  document?: DesignDocument;
  updatedAt?: string;
};

type StoredDesignDocument = { draftDocument: DesignDocument; draftRevision: number; publishedRevision: number | null };

export type LowCodePageProps = {
  initialDocument?: DesignDocument;
  loadStoredDocument?: boolean;
  storageKey?: string;
};

export function LowCodePage({
  initialDocument,
  loadStoredDocument = true,
  storageKey = STORAGE_KEY
}: LowCodePageProps = {}) {
  const resolvedInitialDocument = initialDocument ?? (loadStoredDocument ? fallbackDesignDocument : aiGeneratedDesignDocument);
  const [document, setDocument] = useState<DesignDocument>(resolvedInitialDocument);
  const [customComplexRecords, setCustomComplexRecords] = useState<CustomComplexMaterialRecord[]>([]);
  const [selectedId, setSelectedId] = useState(resolvedInitialDocument.tree.id);
  const [saveState, setSaveState] = useState<"draft" | "saved" | "published">("draft");
  const [publishError, setPublishError] = useState("");
  const [leftPanelTab, setLeftPanelTab] = useState<"materials" | "ai">("materials");
  const [workspaceMode, setWorkspaceMode] = useState<"design" | "data">("design");
  const [runtimeQueries, setRuntimeQueries] = useState<Record<string, JsonValue>>({});
  const runtimeDocument = useMemo<DesignDocument>(() => ({ ...document, variables: { ...document.variables, query: runtimeQueries } }), [document, runtimeQueries]);
  const elements = useMemo(() => elementMap(document), [document]);
  const availableComplexMaterials = useMemo(() => [
    ...complexMaterials,
    ...customComplexRecords.map(customComplexMaterialRecordToDefinition)
  ], [customComplexRecords]);
  const selectedElement = elements.get(selectedId) ?? elements.get(document.tree.id) ?? document.elements[0];
  const parentElement = elements.get(findParentId(document.tree, selectedElement.id) ?? "");

  useEffect(() => {
    let cancelled = false;

    setDocument(resolvedInitialDocument);
    setSelectedId(resolvedInitialDocument.tree.id);
    setSaveState("draft");

    const raw = loadStoredDocument ? localStorage.getItem(storageKey) : null;
    if (raw) {
      const parsed = designDocumentSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success) {
        setDocument(parsed.data);
        setSelectedId(parsed.data.tree.id);
        setSaveState("saved");
      }
    }
    setCustomComplexRecords(readCustomComplexMaterialRecords(localStorage.getItem(CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY)));
    if (!initialDocument && !loadStoredDocument) {
      void (async () => {
        const stored = await apiGet<StoredDesignDocument | null>(`/low-code/design-documents/${resolvedInitialDocument.id}`, null);
        if (cancelled) return;
        const candidate = stored?.draftDocument ?? (await apiGet<LatestDesignAgentPreview | null>("/low-code/design-agent/latest", null))?.document;
        if (!candidate || cancelled) return;
        const parsed = designDocumentSchema.safeParse(candidate);
        if (!parsed.success) return;
        setDocument(parsed.data);
        setSelectedId(parsed.data.tree.id);
        setSaveState("saved");
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [initialDocument, resolvedInitialDocument, loadStoredDocument, storageKey]);

  useEffect(() => {
    let cancelled = false;
    setRuntimeQueries({});
    void apiGet<DataQuery[]>(`/data-queries?pageId=${encodeURIComponent(document.id)}`, []).then(async (queries) => {
      if (!Array.isArray(queries)) return;
      const enabledQueries = queries.filter((query) => query.enabled);
      setRuntimeQueries(Object.fromEntries(enabledQueries.map((query) => [query.key, { data: [], loading: query.trigger === "pageLoad", error: null, updatedAt: null }])) as Record<string, JsonValue>);
      const pageLoadQueries = enabledQueries.filter((query) => query.trigger === "pageLoad");
      if (!pageLoadQueries.length || cancelled) return;
      const results = await Promise.all(pageLoadQueries.map(async (query) => {
        try {
          const result = await apiPostStrict<DataQueryResult>(`/data-queries/${query.id}/execute`, { parameters: {} });
          return [query.key, { data: result.rows, loading: false, error: null, updatedAt: new Date().toISOString() }] as const;
        } catch (error) {
          return [query.key, { data: [], loading: false, error: { message: error instanceof Error ? error.message : "查询执行失败" }, updatedAt: null }] as const;
        }
      }));
      if (!cancelled) setRuntimeQueries((current) => ({ ...current, ...Object.fromEntries(results) }));
    });
    return () => { cancelled = true; };
  }, [document.id]);

  function commit(next: DesignDocument | ((current: DesignDocument) => DesignDocument)) {
    setDocument((current) => typeof next === "function" ? next(current) : next);
    setSaveState("draft");
    setPublishError("");
  }

  function addElement(materialId: MaterialDefinition["id"], parentId = selectedElement?.id ?? document.tree.id, index?: number) {
    const element = createElementFromMaterial(materialId);
    commit((current) => {
      const currentElements = elementMap(current);
      const parent = currentElements.get(parentId);
      const normalizedParentId = parent && isContainerElement(parent.type) ? parentId : current.tree.id;
      return insertElement(current, normalizedParentId, element, index);
    });
    setSelectedId(element.id);
  }

  function addComplexMaterial(id: ComplexMaterialDefinition["id"], parentId = selectedElement?.id ?? document.tree.id, index?: number) {
    const definition = availableComplexMaterials.find((item) => item.id === id);
    if (!definition) return;
    const template = definition.createTemplate();
    commit((current) => insertElementTree(current, parentId, template, index));
    setSelectedId(template.selectId ?? template.root.id);
  }

  function addInferredComponent(input: InferableData, parentId = selectedElement?.id ?? document.tree.id, index?: number) {
    const inferred = inferComponentTree(input);
    commit((current) => insertElementTree(current, parentId, inferred.tree, index));
    if (input.source === "queryResult") {
      const queryKey = input.path.split(".")[1];
      if (queryKey) {
        setRuntimeQueries((current) => ({
          ...current,
          [queryKey]: { data: input.value, loading: false, error: null, updatedAt: new Date().toISOString() }
        }));
      }
    }
    setSelectedId(inferred.selectId);
  }

  async function uploadImageMaterial(file: File | undefined) {
    if (!file) return;
    const asset = await apiUpload<LowCodeImageAsset>("/low-code/assets/images", file);
    const element = createImageElementFromAsset(asset);
    commit((current) => insertElement(current, current.tree.id, element));
    setSelectedId(element.id);
  }

  function deleteElement(id: string) {
    commit((current) => removeNode(current, id));
    setSelectedId(document.tree.id);
  }

  function saveDraft() {
    const draft = storeLocalDraft();
    if (!draft) return false;
    void apiPostStrict<StoredDesignDocument>("/low-code/design-documents/draft", draft).catch((error) => {
      setSaveState("draft");
      setPublishError(`服务端保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    });
    return true;
  }

  function storeLocalDraft() {
    const parsed = designDocumentSchema.safeParse(document);
    if (!parsed.success) {
      setSaveState("draft");
      return null;
    }
    localStorage.setItem(storageKey, JSON.stringify(parsed.data));
    setSaveState("saved");
    return parsed.data;
  }

  async function publishPreview() {
    const errors = diagnoseVariableReferences(runtimeDocument).filter((diagnostic) => diagnostic.severity === "error");
    if (errors.length > 0) {
      setPublishError(`发布失败：存在 ${errors.length} 个无效变量引用，请在变量面板中修复。`);
      setSaveState("draft");
      return;
    }
    const draft = storeLocalDraft();
    if (!draft) return;
    try {
      await apiPostStrict<StoredDesignDocument>("/low-code/design-documents/draft", draft);
      await apiPostStrict(`/low-code/design-documents/${document.id}/publish`);
      setPublishError("");
      setSaveState("published");
    } catch (error) {
      setPublishError(`发布失败：${error instanceof Error ? error.message : "未知错误"}`);
      setSaveState("saved");
    }
  }

  async function uploadBackgroundImage(file: File) {
    const result = await apiUpload<{ url: string }>("/low-code/assets/background-image", file);
    return result.url;
  }

  function deleteCustomComplexMaterial(id: ComplexMaterialDefinition["id"]) {
    setCustomComplexRecords((current) => {
      const next = current.filter((item) => item.id !== id);
      localStorage.setItem(CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function applyAgentDocument(nextDocument: DesignDocument) {
    commit(nextDocument);
    setSelectedId(nextDocument.tree.id);
  }

  return (
    <div className="lowcode-page flex h-[calc(100vh-72px)] min-h-0 flex-col bg-[#f6f8fa]">
      <LowCodeToolbar document={document} mode={workspaceMode} onModeChange={setWorkspaceMode} saveState={saveState} onPublish={publishPreview} onSave={saveDraft} />
      {publishError ? <div role="alert" className="border-b border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-xs font-semibold text-[#b91c1c]">{publishError}</div> : null}
      {workspaceMode === "data" ? (
        <VariableWorkspace
          document={document}
          runtimeVariables={{ query: runtimeQueries }}
          onChange={commit}
          onLocateElement={(elementId) => {
            setSelectedId(elementId);
            setWorkspaceMode("design");
          }}
        />
      ) : <div className="grid min-h-0 flex-1 grid-cols-[286px_1fr_330px] overflow-hidden max-xl:grid-cols-[260px_1fr] max-lg:grid-cols-1">
        <div className="flex min-h-0 flex-col bg-white max-lg:hidden">
          <div className="grid grid-cols-2 gap-1 border-r border-[#d9e1e8] bg-[#eef2f5] p-1.5">
            <button
              type="button"
              aria-pressed={leftPanelTab === "materials"}
              className={`h-8 rounded text-xs font-bold transition ${leftPanelTab === "materials" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
              onClick={() => setLeftPanelTab("materials")}
            >
              {"\u7269\u6599"}
            </button>
            <button
              type="button"
              aria-pressed={leftPanelTab === "ai"}
              className={`h-8 rounded text-xs font-bold transition ${leftPanelTab === "ai" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
              onClick={() => setLeftPanelTab("ai")}
            >
              {"AI \u5bf9\u8bdd"}
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <div className={leftPanelTab === "materials" ? "h-full" : "hidden h-full"} aria-hidden={leftPanelTab !== "materials"}>
              <MaterialPalette
                document={document}
                complexMaterials={availableComplexMaterials}
                onAdd={(type, parentId, index) => addElement(type, parentId, index)}
                onAddComplex={(id, parentId, index) => addComplexMaterial(id, parentId, index)}
                onDeleteCustomComplex={deleteCustomComplexMaterial}
                onInferData={addInferredComponent}
                onOpenVariableWorkspace={() => setWorkspaceMode("data")}
                onUploadImage={uploadImageMaterial}
              />
            </div>
            <div className={leftPanelTab === "ai" ? "h-full" : "hidden h-full"} aria-hidden={leftPanelTab !== "ai"}>
              <LowCodeAgentChat onApplyDocument={applyAgentDocument} />
            </div>
          </div>
        </div>
        <DesignCanvas
          document={runtimeDocument}
          selectedId={selectedElement.id}
          onDelete={deleteElement}
          onMove={(id, direction) => commit((current) => moveNode(current, id, direction))}
          onReparent={(id, parentId, index) => commit((current) => reparentNode(current, id, parentId, index))}
          onUpdateProps={(id, patch) => commit((current) => updateElementProps(current, id, patch))}
          onSelect={setSelectedId}
        />
        <PropertyInspector
          document={document}
          parentElement={parentElement}
          selectedElement={selectedElement}
          onUpdate={(patch: Partial<DesignElement>) => commit((current) => updateElement(current, selectedElement.id, patch))}
          onUpdateLayout={(patch: Partial<DesignLayout>) => commit((current) => updateElementLayout(current, selectedElement.id, patch))}
          onUpdateProps={(patch) => commit((current) => updateElementProps(current, selectedElement.id, patch))}
          onUpdateStyle={(patch: Partial<DesignElementStyle>) => commit((current) => updateElementStyle(current, selectedElement.id, patch))}
          onUploadBackgroundImage={uploadBackgroundImage}
          variables={runtimeDocument.variables}
        />
      </div>}
    </div>
  );
}

function findParentId(node: DesignDocument["tree"], id: string, parentId?: string): string | undefined {
  if (node.id === id) return parentId;
  for (const child of node.children ?? []) {
    const found = findParentId(child, id, node.id);
    if (found) return found;
  }
  return undefined;
}
