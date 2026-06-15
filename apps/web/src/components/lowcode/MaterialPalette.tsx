import { useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { Upload } from "lucide-react";
import type { DesignVariables } from "@flowmind/shared";
import { Input } from "@flowmind/ui";
import { aiActions, complexMaterialCategoriesFor, materialCategories, type ComplexMaterialDefinition, type MaterialDefinition } from "./lowcodeData";
import { CustomScrollbar } from "../CustomScrollbar";
import { VariablesEditor } from "./VariablesJsonEditor";
import { preventNativeMaterialSelection, useMaterialDragSources } from "./useMaterialDragSources";

export function MaterialPalette({
  complexMaterials,
  onAdd,
  onAddComplex,
  onDeleteCustomComplex,
  onUpdateVariables,
  onUploadImage,
  variables
}: {
  complexMaterials: ComplexMaterialDefinition[];
  onAdd: (materialId: MaterialDefinition["id"], parentId?: string, index?: number) => void;
  onAddComplex: (id: ComplexMaterialDefinition["id"], parentId?: string, index?: number) => void;
  onDeleteCustomComplex?: (id: ComplexMaterialDefinition["id"]) => void;
  onUpdateVariables: (variables: DesignVariables) => void;
  onUploadImage: (file: File | undefined) => Promise<void> | void;
  variables: DesignVariables;
}) {
  const onAddRef = useRef(onAdd);
  const onAddComplexRef = useRef(onAddComplex);
  const [activeTab, setActiveTab] = useState<"basic" | "complex" | "variables">("complex");
  const [uploading, setUploading] = useState(false);
  onAddRef.current = onAdd;
  onAddComplexRef.current = onAddComplex;

  useMaterialDragSources({
    selector: "[data-material-type], [data-complex-material-id]",
    onDrop: (target, placement) => {
      const materialId = target.getAttribute("data-material-id") as MaterialDefinition["id"] | null;
      const complexId = target.getAttribute("data-complex-material-id") as ComplexMaterialDefinition["id"] | null;
      if (materialId) onAddRef.current(materialId, placement.parentId, placement.index);
      if (complexId) onAddComplexRef.current(complexId, placement.parentId, placement.index);
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
          <VariablesTab variables={variables} onUpdateVariables={onUpdateVariables} />
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
  onUpdateVariables,
  variables
}: {
  onUpdateVariables: (variables: DesignVariables) => void;
  variables: DesignVariables;
}) {
  return (
    <div className="mt-4">
      <div>
        <div className="text-sm font-bold">全局变量</div>
        <p className="mt-1 text-xs leading-5 text-[#5b6472]">编辑当前设计稿内的 JSON 变量对象，内容字段可用 {"{{customer.name}}"} 引用。</p>
      </div>
      <div className="mt-4">
        <VariablesEditor value={variables} onChange={onUpdateVariables} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-normal text-[#8a94a3]">{children}</div>;
}
