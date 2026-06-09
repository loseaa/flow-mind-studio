import { useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import interact from "interactjs";
import { Upload } from "lucide-react";
import { Input } from "@flowmind/ui";
import { aiActions, materialCategories, type MaterialDefinition } from "./lowcodeData";
import { CustomScrollbar } from "../CustomScrollbar";
import { resolveMaterialDropTarget, type MaterialDropTarget } from "./materialDropResolver";
import { setDropPlacementIndicator } from "./dropPlacementIndicator";

const dragPreviews = new WeakMap<HTMLElement, HTMLElement>();
let activeDropTarget: MaterialDropTarget | null = null;
let previousBodyUserSelect: string | null = null;

export function MaterialPalette({
  onAdd,
  onUploadImage
}: {
  onAdd: (type: MaterialDefinition["type"], parentId?: string, index?: number) => void;
  onUploadImage: (file: File | undefined) => Promise<void> | void;
}) {
  const onAddRef = useRef(onAdd);
  const [uploading, setUploading] = useState(false);
  onAddRef.current = onAdd;

  useEffect(() => {
    const draggable = interact("[data-material-type]").draggable({
      inertia: false,
      listeners: {
        start: (event) => {
          const target = event.target as HTMLElement;
          const preview = target.cloneNode(true) as HTMLElement;
          const rect = target.getBoundingClientRect();
          const clientX = "clientX" in event ? Number(event.clientX) : rect.left;
          const clientY = "clientY" in event ? Number(event.clientY) : rect.top;
          preview.setAttribute("data-pointer-offset-x", String(clientX - rect.left));
          preview.setAttribute("data-pointer-offset-y", String(clientY - rect.top));
          preview.setAttribute("data-origin-left", String(rect.left));
          preview.setAttribute("data-origin-top", String(rect.top));
          preview.style.position = "fixed";
          preview.style.left = `${rect.left}px`;
          preview.style.top = `${rect.top}px`;
          preview.style.width = `${rect.width}px`;
          preview.style.pointerEvents = "none";
          preview.style.zIndex = "2147483646";
          preview.style.transform = "translate3d(0, 0, 0) scale(1.02)";
          preview.style.transition = "none";
          preview.style.willChange = "transform";
          preview.style.boxShadow = "0 24px 45px -20px rgba(15, 23, 42, 0.55)";
          preview.style.userSelect = "none";
          preview.classList.add("material-drag-preview", "opacity-95");
          lockNativeTextSelection();
          document.body.appendChild(preview);
          dragPreviews.set(target, preview);
          target.classList.add("opacity-45");
          target.removeAttribute("data-was-dragged");
        },
        move: (event) => {
          const target = event.target as HTMLElement;
          const preview = dragPreviews.get(target);
          if (!preview) return;
          target.setAttribute("data-was-dragged", "true");
          const offsetX = Number(preview.getAttribute("data-pointer-offset-x")) || 0;
          const offsetY = Number(preview.getAttribute("data-pointer-offset-y")) || 0;
          const originLeft = Number(preview.getAttribute("data-origin-left")) || 0;
          const originTop = Number(preview.getAttribute("data-origin-top")) || 0;
          const x = Number(event.clientX) - offsetX - originLeft;
          const y = Number(event.clientY) - offsetY - originTop;
          preview.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.02)`;
          setActiveDropTarget(resolveMaterialDropTarget({ preview, clientX: Number(event.clientX), clientY: Number(event.clientY) }));
        },
        end: (event) => {
          const target = event.target as HTMLElement;
          const type = target.getAttribute("data-material-type") as MaterialDefinition["type"] | null;
          const preview = dragPreviews.get(target);
          const point = preview ? resolveEventPoint(event, preview) : { x: Number(event.clientX), y: Number(event.clientY) };
          const dropTarget = resolveMaterialDropTarget({ preview, clientX: point.x, clientY: point.y });
          if (type && dropTarget) onAddRef.current(type, dropTarget.placement.parentId, dropTarget.placement.index);
          preview?.remove();
          dragPreviews.delete(target);
          target.classList.remove("opacity-45");
          setActiveDropTarget(null);
          unlockNativeTextSelection();
        }
      }
    });

    return () => {
      setActiveDropTarget(null);
      unlockNativeTextSelection();
      draggable.unset();
    };
  }, []);

  return (
    <CustomScrollbar className="relative z-40 h-full min-h-0 border-r border-[#d9e1e8] bg-white max-lg:hidden" variant="slate">
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">物料区</div>
          <span className="text-xs text-[#8a94a3]">拖拽到画布</span>
        </div>
        <Input placeholder="搜索物料" className="mt-3 h-9" />
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
                    key={item.type}
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
                      onAddRef.current(item.type);
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
        <div className="mt-5 space-y-3">
          <SectionTitle>AI / MCP 动作</SectionTitle>
          {aiActions.map((item) => (
            <button key={item} type="button" className="w-full rounded-lg border border-dashed border-[#b9c4cf] bg-[#f8fafb] px-3 py-2 text-left text-sm font-medium text-[#5b6472]">
              {item}
            </button>
          ))}
        </div>
      </div>
    </CustomScrollbar>
  );
}

function resolveEventPoint(event: { clientX?: number; clientY?: number }, preview: HTMLElement) {
  const rect = preview.getBoundingClientRect();
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  return {
    x: Number.isFinite(x) ? x : rect.left + rect.width / 2,
    y: Number.isFinite(y) ? y : rect.top + rect.height / 2
  };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-normal text-[#8a94a3]">{children}</div>;
}

function setActiveDropTarget(next: MaterialDropTarget | null) {
  if (activeDropTarget?.element === next?.element && activeDropTarget?.placement.position === next?.placement.position && activeDropTarget?.placement.axis === next?.placement.axis) {
    setDropPlacementIndicator(next);
    return;
  }
  activeDropTarget = next;
  setDropPlacementIndicator(next);
}

function lockNativeTextSelection() {
  if (previousBodyUserSelect !== null) return;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = "none";
  document.body.classList.add("material-dragging");
  document.addEventListener("selectstart", preventDocumentSelection, true);
  document.addEventListener("dragstart", preventDocumentSelection, true);
  window.getSelection()?.removeAllRanges();
}

function unlockNativeTextSelection() {
  if (previousBodyUserSelect === null) return;
  document.body.style.userSelect = previousBodyUserSelect;
  document.body.classList.remove("material-dragging");
  document.removeEventListener("selectstart", preventDocumentSelection, true);
  document.removeEventListener("dragstart", preventDocumentSelection, true);
  window.getSelection()?.removeAllRanges();
  previousBodyUserSelect = null;
}

function preventDocumentSelection(event: Event) {
  event.preventDefault();
}

function preventNativeMaterialSelection(event: ReactDragEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>) {
  event.preventDefault();
}
