import { useEffect, useRef } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import interact from "interactjs";
import { clearDropPlacementIndicator, setDropPlacementIndicator } from "./dropPlacementIndicator";
import { resolveMaterialDropTarget, type MaterialDropPlacement, type MaterialDropTarget } from "./materialDropResolver";

const dragPreviews = new WeakMap<HTMLElement, HTMLElement>();
let activeDropTarget: MaterialDropTarget | null = null;
let previousBodyUserSelect: string | null = null;

export function useMaterialDragSources({
  onDrop,
  selector
}: {
  onDrop: (target: HTMLElement, placement: MaterialDropPlacement) => void;
  selector: string;
}) {
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const draggable = interact(selector).draggable({
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
          const preview = dragPreviews.get(target);
          const point = preview ? resolveEventPoint(event, preview) : { x: Number(event.clientX), y: Number(event.clientY) };
          const dropTarget = resolveMaterialDropTarget({ preview, clientX: point.x, clientY: point.y });
          if (dropTarget) onDropRef.current(target, dropTarget.placement);
          preview?.remove();
          dragPreviews.delete(target);
          target.classList.remove("opacity-45");
          setActiveDropTarget(null);
          unlockNativeTextSelection();
        }
      }
    });

    const clearDragArtifacts = () => {
      cancelMaterialDragArtifacts();
    };
    const clearDragArtifactsOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelMaterialDragArtifacts();
    };
    window.addEventListener("blur", clearDragArtifacts);
    window.addEventListener("drop", clearDragArtifacts);
    window.addEventListener("dragend", clearDragArtifacts);
    window.addEventListener("pointerup", clearDragArtifacts);
    window.addEventListener("keydown", clearDragArtifactsOnEscape);

    return () => {
      window.removeEventListener("blur", clearDragArtifacts);
      window.removeEventListener("drop", clearDragArtifacts);
      window.removeEventListener("dragend", clearDragArtifacts);
      window.removeEventListener("pointerup", clearDragArtifacts);
      window.removeEventListener("keydown", clearDragArtifactsOnEscape);
      cancelMaterialDragArtifacts();
      draggable.unset();
    };
  }, [selector]);
}

export function preventNativeMaterialSelection(event: ReactDragEvent<HTMLElement> | ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
  event.preventDefault();
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

function setActiveDropTarget(next: MaterialDropTarget | null) {
  if (activeDropTarget?.element === next?.element && activeDropTarget?.placement.position === next?.placement.position && activeDropTarget?.placement.axis === next?.placement.axis) {
    setDropPlacementIndicator(next);
    return;
  }
  activeDropTarget = next;
  setDropPlacementIndicator(next);
}

function cancelMaterialDragArtifacts() {
  activeDropTarget = null;
  clearDropPlacementIndicator();
  document.querySelectorAll(".material-drag-preview").forEach((node) => node.remove());
  document.querySelectorAll("[data-material-drag-source].opacity-45, [data-material-type].opacity-45, [data-complex-material-id].opacity-45, [data-builder-material-id].opacity-45, [data-data-drag-path].opacity-45").forEach((node) => node.classList.remove("opacity-45"));
  unlockNativeTextSelection();
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
