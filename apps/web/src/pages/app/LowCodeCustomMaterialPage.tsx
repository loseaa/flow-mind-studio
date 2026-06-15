import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DesignDocument, DesignElement, DesignElementStyle, DesignLayout, DesignVariables } from "@flowmind/shared";
import { Button, Input } from "@flowmind/ui";
import { apiUpload } from "../../api";
import { DesignCanvas } from "../../components/lowcode/DesignCanvas";
import { PropertyInspector } from "../../components/lowcode/PropertyInspector";
import {
  CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY,
  createCustomComplexMaterialRecord,
  createCustomMaterialBuilderDocument,
  createElementFromMaterial,
  isContainerElement,
  materialCategories,
  readCustomComplexMaterialRecords,
  type MaterialDefinition
} from "../../components/lowcode/lowcodeData";
import { elementMap, insertElement, moveNode, removeNode, reparentNode, updateElement, updateElementLayout, updateElementProps, updateElementStyle } from "../../components/lowcode/designDocumentOps";
import { preventNativeMaterialSelection, useMaterialDragSources } from "../../components/lowcode/useMaterialDragSources";

export function LowCodeCustomMaterialPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DesignDocument>(() => createCustomMaterialBuilderDocument());
  const [selectedId, setSelectedId] = useState("custom_builder_root");
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const elements = useMemo(() => elementMap(draft), [draft]);
  const selectedElement = elements.get(selectedId) ?? elements.get(draft.tree.id) ?? draft.elements[0];
  const parentElement = elements.get(findParentId(draft.tree, selectedElement.id) ?? "");
  const canSave = label.trim().length > 0 && Boolean(draft.tree.children?.length);

  function commit(next: DesignDocument | ((current: DesignDocument) => DesignDocument)) {
    setDraft((current) => typeof next === "function" ? next(current) : next);
  }

  function addMaterial(materialId: MaterialDefinition["id"], parentId = selectedElement.id, index?: number) {
    const element = createElementFromMaterial(materialId);
    commit((current) => {
      const currentElements = elementMap(current);
      const parent = currentElements.get(parentId);
      const normalizedParentId = parent && isContainerElement(parent.type) ? parentId : current.tree.id;
      return insertElement(current, normalizedParentId, element, index);
    });
    setSelectedId(element.id);
  }

  useMaterialDragSources({
    selector: "[data-builder-material-id]",
    onDrop: (target, placement) => {
      const materialId = target.getAttribute("data-builder-material-id") as MaterialDefinition["id"] | null;
      if (materialId) addMaterial(materialId, placement.parentId, placement.index);
    }
  });

  function deleteElement(id: string) {
    commit((current) => removeNode(current, id));
    setSelectedId(draft.tree.id);
  }

  async function uploadBackgroundImage(file: File) {
    const result = await apiUpload<{ url: string }>("/low-code/assets/background-image", file);
    return result.url;
  }

  function saveCustomMaterial() {
    const record = createCustomComplexMaterialRecord({ label, desc, document: draft });
    if (!record) return;
    const current = readCustomComplexMaterialRecords(localStorage.getItem(CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY));
    localStorage.setItem(CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY, JSON.stringify([...current, record]));
    navigate("/app/lowcode");
  }

  return (
    <div className="flex h-[calc(100vh-72px)] min-h-0 flex-col bg-[#f6f8fa]">
      <div className="flex h-14 items-center justify-between border-b border-[#d9e1e8] bg-white px-5">
        <div>
          <div className="text-sm font-bold text-[#101828]">新建复杂物料</div>
          <div className="text-xs text-[#5b6472]">用基础物料组装一个可复用模板</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate("/app/lowcode")}>返回</Button>
          <Button data-custom-complex-save type="button" disabled={!canSave} onClick={saveCustomMaterial}>保存物料</Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_320px]">
        <aside className="min-h-0 overflow-y-auto border-r border-[#d9e1e8] bg-white p-3">
          <div className="mb-3 text-xs font-bold uppercase tracking-normal text-[#8a94a3]">基础物料</div>
          <div className="space-y-4">
            {materialCategories.map((category) => (
              <section key={category.title} className="space-y-2">
                <div className="text-[11px] font-bold text-[#5b6472]">{category.title}</div>
                {category.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      data-material-drag-source
                      data-builder-material-id={item.id}
                      type="button"
                      className="flex w-full cursor-grab touch-none select-none items-center gap-2 rounded-md border border-[#d9e1e8] bg-white px-2.5 py-2 text-left text-xs font-semibold text-[#344054] hover:border-[#9cc8c2]"
                      onDragStart={preventNativeMaterialSelection}
                      onMouseDown={preventNativeMaterialSelection}
                      onPointerDown={preventNativeMaterialSelection}
                      onClick={(event) => {
                        const target = event.currentTarget;
                        if (target.getAttribute("data-was-dragged") === "true") {
                          target.removeAttribute("data-was-dragged");
                          return;
                        }
                        addMaterial(item.id);
                      }}
                    >
                      <Icon size={14} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        </aside>
        <main className="min-h-0">
          <DesignCanvas
            document={draft}
            selectedId={selectedElement.id}
            onDelete={deleteElement}
            onMove={(id, direction) => commit((current) => moveNode(current, id, direction))}
            onReparent={(id, parentId, index) => commit((current) => reparentNode(current, id, parentId, index))}
            onUpdateProps={(id, patch) => commit((current) => updateElementProps(current, id, patch))}
            onSelect={setSelectedId}
          />
        </main>
        <aside className="min-h-0 overflow-hidden border-l border-[#d9e1e8] bg-white">
          <PropertyInspector
            document={draft}
            parentElement={parentElement}
            selectedElement={selectedElement}
            onUpdate={(patch: Partial<DesignElement>) => commit((current) => updateElement(current, selectedElement.id, patch))}
            onUpdateLayout={(patch: Partial<DesignLayout>) => commit((current) => updateElementLayout(current, selectedElement.id, patch))}
            onUpdateProps={(patch) => commit((current) => updateElementProps(current, selectedElement.id, patch))}
            onUpdateStyle={(patch: Partial<DesignElementStyle>) => commit((current) => updateElementStyle(current, selectedElement.id, patch))}
            onUploadBackgroundImage={uploadBackgroundImage}
            variables={{} satisfies DesignVariables}
          />
        </aside>
      </div>
      <div className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-3 border-t border-[#d9e1e8] bg-white p-4">
        <label className="block">
          <span className="text-xs font-semibold text-[#344054]">名称</span>
          <Input aria-label="Custom material name" className="mt-1 h-9" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[#344054]">说明</span>
          <Input aria-label="Custom material description" className="mt-1 h-9" value={desc} onChange={(event) => setDesc(event.target.value)} />
        </label>
        <Button data-custom-complex-cancel type="button" variant="secondary" onClick={() => navigate("/app/lowcode")}>取消</Button>
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
