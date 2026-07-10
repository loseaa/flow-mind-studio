import { useEffect, useMemo, useState } from "react";
import type { DesignDocument, DesignElement, DesignElementStyle, DesignLayout, DesignVariables, LowCodeImageAsset } from "@flowmind/shared";
import { designDocumentSchema } from "@flowmind/shared";
import { apiUpload } from "../../api";
import { DesignCanvas } from "../../components/lowcode/DesignCanvas";
import { LowCodeToolbar } from "../../components/lowcode/LowCodeToolbar";
import { LowCodeAgentChat } from "../../components/lowcode/LowCodeAgentChat";
import { MaterialPalette } from "../../components/lowcode/MaterialPalette";
import { PropertyInspector } from "../../components/lowcode/PropertyInspector";
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

const STORAGE_KEY = "flowmind.lowcode.designDocument";

export type LowCodePageProps = {
  initialDocument?: DesignDocument;
  loadStoredDocument?: boolean;
  storageKey?: string;
};

export function LowCodePage({
  initialDocument = fallbackDesignDocument,
  loadStoredDocument = true,
  storageKey = STORAGE_KEY
}: LowCodePageProps = {}) {
  const [document, setDocument] = useState<DesignDocument>(initialDocument);
  const [customComplexRecords, setCustomComplexRecords] = useState<CustomComplexMaterialRecord[]>([]);
  const [selectedId, setSelectedId] = useState(initialDocument.tree.id);
  const [saveState, setSaveState] = useState<"draft" | "saved" | "published">("draft");
  const [leftPanelTab, setLeftPanelTab] = useState<"materials" | "ai">("materials");
  const elements = useMemo(() => elementMap(document), [document]);
  const availableComplexMaterials = useMemo(() => [
    ...complexMaterials,
    ...customComplexRecords.map(customComplexMaterialRecordToDefinition)
  ], [customComplexRecords]);
  const selectedElement = elements.get(selectedId) ?? elements.get(document.tree.id) ?? document.elements[0];
  const parentElement = elements.get(findParentId(document.tree, selectedElement.id) ?? "");

  useEffect(() => {
    setDocument(initialDocument);
    setSelectedId(initialDocument.tree.id);
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
  }, [initialDocument, loadStoredDocument, storageKey]);

  function commit(next: DesignDocument | ((current: DesignDocument) => DesignDocument)) {
    setDocument((current) => typeof next === "function" ? next(current) : next);
    setSaveState("draft");
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
    const parsed = designDocumentSchema.safeParse(document);
    if (!parsed.success) {
      setSaveState("draft");
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(parsed.data));
    setSaveState("saved");
  }

  function publishPreview() {
    saveDraft();
    setSaveState("published");
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

  function updateVariables(variables: DesignVariables) {
    commit((current) => ({
      ...current,
      variables
    }));
  }

  function applyAgentDocument(nextDocument: DesignDocument) {
    commit(nextDocument);
    setSelectedId(nextDocument.tree.id);
  }

  return (
    <div className="lowcode-page flex h-[calc(100vh-72px)] min-h-0 flex-col bg-[#f6f8fa]">
      <LowCodeToolbar document={document} saveState={saveState} onPublish={publishPreview} onSave={saveDraft} />
      <div className="grid min-h-0 flex-1 grid-cols-[286px_1fr_330px] overflow-hidden max-xl:grid-cols-[260px_1fr] max-lg:grid-cols-1">
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
                complexMaterials={availableComplexMaterials}
                onAdd={(type, parentId, index) => addElement(type, parentId, index)}
                onAddComplex={(id, parentId, index) => addComplexMaterial(id, parentId, index)}
                onDeleteCustomComplex={deleteCustomComplexMaterial}
                onUploadImage={uploadImageMaterial}
                variables={document.variables}
                onUpdateVariables={updateVariables}
              />
            </div>
            <div className={leftPanelTab === "ai" ? "h-full" : "hidden h-full"} aria-hidden={leftPanelTab !== "ai"}>
              <LowCodeAgentChat onApplyDocument={applyAgentDocument} />
            </div>
          </div>
        </div>
        <DesignCanvas
          document={document}
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
          variables={document.variables}
        />
      </div>
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
