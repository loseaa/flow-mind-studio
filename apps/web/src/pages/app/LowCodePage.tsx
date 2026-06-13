import { useEffect, useMemo, useState } from "react";
import type { DesignDocument, DesignElement, DesignElementStyle, DesignLayout, DesignVariables, LowCodeImageAsset } from "@flowmind/shared";
import { designDocumentSchema } from "@flowmind/shared";
import { apiUpload } from "../../api";
import { DesignCanvas } from "../../components/lowcode/DesignCanvas";
import { LowCodeToolbar } from "../../components/lowcode/LowCodeToolbar";
import { MaterialPalette } from "../../components/lowcode/MaterialPalette";
import { PropertyInspector } from "../../components/lowcode/PropertyInspector";
import { createElementFromMaterial, createImageElementFromAsset, fallbackDesignDocument, isContainerElement, type MaterialDefinition } from "../../components/lowcode/lowcodeData";
import { elementMap, insertElement, moveNode, removeNode, reparentNode, updateElement, updateElementLayout, updateElementProps, updateElementStyle } from "../../components/lowcode/designDocumentOps";

const STORAGE_KEY = "flowmind.lowcode.designDocument";

export function LowCodePage() {
  const [document, setDocument] = useState<DesignDocument>(fallbackDesignDocument);
  const [selectedId, setSelectedId] = useState(fallbackDesignDocument.tree.id);
  const [saveState, setSaveState] = useState<"draft" | "saved" | "published">("draft");
  const elements = useMemo(() => elementMap(document), [document]);
  const selectedElement = elements.get(selectedId) ?? elements.get(document.tree.id) ?? document.elements[0];
  const parentElement = elements.get(findParentId(document.tree, selectedElement.id) ?? "");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = designDocumentSchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) {
      setDocument(parsed.data);
      setSelectedId(parsed.data.tree.id);
      setSaveState("saved");
    }
  }, []);

  function commit(next: DesignDocument | ((current: DesignDocument) => DesignDocument)) {
    setDocument((current) => typeof next === "function" ? next(current) : next);
    setSaveState("draft");
  }

  function addElement(type: MaterialDefinition["type"], parentId = selectedElement?.id ?? document.tree.id, index?: number) {
    const element = createElementFromMaterial(type);
    commit((current) => {
      const currentElements = elementMap(current);
      const parent = currentElements.get(parentId);
      const normalizedParentId = parent && isContainerElement(parent.type) ? parentId : current.tree.id;
      return insertElement(current, normalizedParentId, element, index);
    });
    setSelectedId(element.id);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
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

  function updateVariables(variables: DesignVariables) {
    commit((current) => ({
      ...current,
      variables
    }));
  }

  return (
    <div className="lowcode-page flex h-[calc(100vh-72px)] min-h-0 flex-col bg-[#f6f8fa]">
      <LowCodeToolbar document={document} saveState={saveState} onPublish={publishPreview} onSave={saveDraft} />
      <div className="grid min-h-0 flex-1 grid-cols-[286px_1fr_330px] overflow-hidden max-xl:grid-cols-[260px_1fr] max-lg:grid-cols-1">
        <MaterialPalette
          onAdd={(type, parentId, index) => addElement(type, parentId, index)}
          onUploadImage={uploadImageMaterial}
          variables={document.variables}
          onUpdateVariables={updateVariables}
        />
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
