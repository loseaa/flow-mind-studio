import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import interact from "interactjs";
import { Input } from "@flowmind/ui";
import { aiActions, materialCategories, type MaterialDefinition } from "./lowcodeData";
import { CustomScrollbar } from "../CustomScrollbar";

const dragPreviews = new WeakMap<HTMLElement, HTMLElement>();
let activeDropzone: HTMLElement | null = null;

export function MaterialPalette({ onAdd }: { onAdd: (type: MaterialDefinition["type"], parentId?: string) => void }) {
  const onAddRef = useRef(onAdd);
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
          preview.style.position = "fixed";
          preview.style.left = `${rect.left}px`;
          preview.style.top = `${rect.top}px`;
          preview.style.width = `${rect.width}px`;
          preview.style.pointerEvents = "none";
          preview.style.zIndex = "2147483647";
          preview.style.transform = "translate(0, 0)";
          preview.style.boxShadow = "0 24px 45px -20px rgba(15, 23, 42, 0.55)";
          preview.classList.add("opacity-95", "scale-[1.02]");
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
          preview.style.left = `${Number(event.clientX) - offsetX}px`;
          preview.style.top = `${Number(event.clientY) - offsetY}px`;
          setActiveDropzone(resolveDropzone(preview, Number(event.clientX), Number(event.clientY)));
        },
        end: (event) => {
          const target = event.target as HTMLElement;
          const type = target.getAttribute("data-material-type") as MaterialDefinition["type"] | null;
          const preview = dragPreviews.get(target);
          const point = preview ? resolveEventPoint(event, preview) : { x: Number(event.clientX), y: Number(event.clientY) };
          const dropzone = preview ? resolveDropzone(preview, point.x, point.y) : null;
          const parentId = dropzone?.getAttribute("data-drop-parent-id") ?? undefined;
          if (type && parentId) onAddRef.current(type, parentId);
          preview?.remove();
          dragPreviews.delete(target);
          target.classList.remove("opacity-45");
          setActiveDropzone(null);
        }
      }
    });

    return () => {
      setActiveDropzone(null);
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
                    className="flex w-full cursor-grab touch-none items-start gap-3 rounded-lg border border-[#d9e1e8] bg-white p-3 text-left transition hover:border-[#b9c4cf] hover:bg-[#f8fafb]"
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

function setActiveDropzone(next: HTMLElement | null) {
  if (activeDropzone === next) return;
  activeDropzone?.classList.remove("drop-target-active");
  next?.classList.add("drop-target-active");
  activeDropzone = next;
}

function resolveDropzone(preview: HTMLElement, clientX: number, clientY: number) {
  const previewRect = preview.getBoundingClientRect();
  const previewArea = Math.max(1, previewRect.width * previewRect.height);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(".design-node-dropzone"))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area <= 0) return null;
      const pointerInside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const intersection = intersectionArea(previewRect, rect);
      if (!pointerInside && intersection <= 0) return null;
      const depth = dropzoneDepth(element);
      const pointerScore = pointerInside ? 100000 + depth * 1000 + 10000 / Math.max(area, 1) : 0;
      const overlapScore = (intersection / Math.min(previewArea, area)) * 100 + depth;
      return { element, score: pointerScore + overlapScore };
    })
    .filter((item): item is { element: HTMLElement; score: number } => item !== null)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.element ?? null;
}

function intersectionArea(left: DOMRect, right: DOMRect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function dropzoneDepth(element: HTMLElement) {
  let depth = 0;
  let current = element.parentElement?.closest(".design-node-dropzone") as HTMLElement | null;
  while (current) {
    depth += 1;
    current = current.parentElement?.closest(".design-node-dropzone") as HTMLElement | null;
  }
  return depth;
}
