import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import interact from "interactjs";
import type { CSSProperties } from "react";
import type { DesignBaseStyle, DesignDocument, DesignElement, DesignLayout, DesignTreeNode } from "@flowmind/shared";
import { Button, Input } from "@flowmind/ui";
import { customerRows, fieldLabels, isContainerElement } from "./lowcodeData";
import { elementMap } from "./designDocumentOps";
import { clearDropPlacementIndicator, setDropPlacementIndicator } from "./dropPlacementIndicator";
import { resolveMaterialDropTarget } from "./materialDropResolver";

export function DesignCanvas({
  document,
  selectedId,
  onDelete,
  onMove,
  onReparent,
  onUpdateProps,
  onSelect
}: {
  document: DesignDocument;
  selectedId: string;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReparent: (id: string, parentId: string, index?: number) => void;
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void;
  onSelect: (id: string) => void;
}) {
  const elements = useMemo(() => elementMap(document), [document]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const panRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  });

  useEffect(() => {
    let pendingDropFrame: number | null = null;
    let latestDropPoint: { clientX: number; clientY: number; draggedId?: string } | null = null;

    function cancelCanvasDragArtifacts() {
      latestDropPoint = null;
      if (pendingDropFrame !== null) {
        window.cancelAnimationFrame(pendingDropFrame);
        pendingDropFrame = null;
      }
      globalThis.document.querySelectorAll<HTMLElement>(".dragging-node").forEach((target) => {
        target.classList.remove("dragging-node");
        target.style.transform = "";
        target.style.transition = "";
        target.style.willChange = "";
        target.style.zIndex = "";
        target.removeAttribute("data-drag-x");
        target.removeAttribute("data-drag-y");
      });
      clearDropPlacementIndicator();
    }

    function scheduleDropIndicator(clientX: number, clientY: number, draggedId?: string) {
      latestDropPoint = { clientX, clientY, draggedId };
      if (pendingDropFrame !== null) return;
      pendingDropFrame = window.requestAnimationFrame(() => {
        pendingDropFrame = null;
        if (!latestDropPoint) return;
        const dropTarget = resolveMaterialDropTarget({
          clientX: latestDropPoint.clientX,
          clientY: latestDropPoint.clientY,
          ignoredNodeIds: latestDropPoint.draggedId ? [latestDropPoint.draggedId] : []
        });
        setDropPlacementIndicator(dropTarget);
      });
    }

    const sortableNodes = interact(".design-sortable-node").draggable({
      inertia: false,
      ignoreFrom: "[data-canvas-text-editor], [data-canvas-text-trigger], input, textarea, button, select",
      listeners: {
        start: (event) => {
          const target = event.target as HTMLElement;
          target.style.transition = "none";
          target.style.willChange = "transform";
          target.style.zIndex = "40";
          target.classList.add("dragging-node");
        },
        move: (event) => {
          const target = event.target as HTMLElement;
          const x = (Number(target.getAttribute("data-drag-x")) || 0) + event.dx;
          const y = (Number(target.getAttribute("data-drag-y")) || 0) + event.dy;
          target.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          target.setAttribute("data-drag-x", String(x));
          target.setAttribute("data-drag-y", String(y));
          const draggedId = target.getAttribute("data-node-id");
          scheduleDropIndicator(Number(event.clientX), Number(event.clientY), draggedId ?? undefined);
        },
        end: (event) => {
          const target = event.target as HTMLElement;
          target.classList.remove("dragging-node");
          target.style.transform = "";
          target.style.transition = "";
          target.style.willChange = "";
          target.style.zIndex = "";
          target.removeAttribute("data-drag-x");
          target.removeAttribute("data-drag-y");
          latestDropPoint = null;
          if (pendingDropFrame !== null) {
            window.cancelAnimationFrame(pendingDropFrame);
            pendingDropFrame = null;
          }
          const draggedId = target.getAttribute("data-node-id");
          const clientX = "clientX" in event ? Number(event.clientX) : 0;
          const clientY = "clientY" in event ? Number(event.clientY) : 0;
          const dropTarget = resolveMaterialDropTarget({
            clientX,
            clientY,
            ignoredNodeIds: draggedId ? [draggedId] : []
          });
          clearDropPlacementIndicator();
          if (!draggedId || !dropTarget) return;
          onReparent(draggedId, dropTarget.placement.parentId, dropTarget.placement.index);
        }
      }
    });

    const clearDragArtifacts = () => {
      cancelCanvasDragArtifacts();
    };
    const clearDragArtifactsOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelCanvasDragArtifacts();
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
      cancelCanvasDragArtifacts();
      sortableNodes.unset();
    };
  }, [document.tree.id, onReparent]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!panRef.current.active) return;
      event.preventDefault();
      const deltaX = event.clientX - panRef.current.startX;
      const deltaY = event.clientY - panRef.current.startY;
      setViewport((current) => ({
        ...current,
        x: panRef.current.originX + deltaX,
        y: panRef.current.originY + deltaY
      }));
    };
    const onMouseUp = () => {
      panRef.current.active = false;
      globalThis.document.body.style.cursor = "";
      globalThis.document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      globalThis.document.body.style.cursor = "";
      globalThis.document.body.style.userSelect = "";
    };
  }, []);

  function startPan(event: ReactMouseEvent) {
    const target = event.target as HTMLElement;
    const interactiveTarget = target.closest("[data-node-id], button, input, textarea, select, [contenteditable='true']");
    const panSurface = target.closest("[data-canvas-pan-surface]");
    const shouldPan = event.button === 1 || event.button === 2 || (event.button === 0 && panSurface && !interactiveTarget);
    if (!shouldPan) return;
    event.preventDefault();
    panRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y
    };
    globalThis.document.body.style.cursor = "grabbing";
    globalThis.document.body.style.userSelect = "none";
  }

  function zoomCanvas(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = clamp(viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.45, 1.8);
    const ratio = nextZoom / viewport.zoom;
    setViewport((current) => ({
      zoom: nextZoom,
      x: pointerX - (pointerX - current.x) * ratio,
      y: pointerY - (pointerY - current.y) * ratio
    }));
  }

  function resetViewport() {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#dde5ed]">
      <div className="flex h-full min-h-0 min-w-[760px] flex-col p-0">
        <DesignCanvasShell
          document={document}
          viewport={viewport}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={startPan}
          onResetViewport={resetViewport}
          onWheel={zoomCanvas}
        >
          <DesignRenderer
            elements={elements}
            node={document.tree}
            parentId=""
            selectedId={selectedId}
            onDelete={onDelete}
            onMove={onMove}
            onUpdateProps={onUpdateProps}
            onSelect={onSelect}
          />
        </DesignCanvasShell>
      </div>
    </div>
  );
}

function DesignCanvasShell({
  children,
  document,
  onContextMenu,
  onMouseDown,
  onResetViewport,
  onWheel,
  viewport
}: {
  children: ReactNode;
  document: DesignDocument;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetViewport: () => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  viewport: { x: number; y: number; zoom: number };
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="absolute right-4 top-3 z-30 flex h-8 shrink-0 items-center justify-end gap-2">
          <div className="flex h-8 items-center gap-2 rounded-md bg-white/95 px-2.5 text-xs text-[#5b6472] shadow-sm ring-1 ring-[#d9e1e8]">
            <GripVertical size={14} />
            {Math.round(viewport.zoom * 100)}% · {document.canvas.width} / Desktop
          </div>
          <button className="h-8 rounded-md border border-[#cbd5df] bg-white/95 px-3 text-xs font-semibold text-[#5b6472] shadow-sm hover:bg-white" type="button" onClick={onResetViewport}>
            重置视图
          </button>
      </div>
      <div
        data-canvas-pan-surface
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-[#dce4ec] active:cursor-grabbing"
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(91, 100, 114, 0.28) 1px, transparent 0)",
          backgroundSize: "28px 28px"
        }}
      >
        <div
          data-canvas-pan-surface
          className="absolute left-1/2 top-14 overflow-hidden rounded-xl border border-[#aebac7] bg-white shadow-[0_18px_34px_-24px_rgba(30,41,59,0.7)] transition-shadow"
          style={{
            transform: `translate(calc(-50% + ${viewport.x}px), ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: "top center",
            width: document.canvas.width
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function DesignRenderer({
  elements,
  node,
  onDelete,
  onMove,
  onUpdateProps,
  onSelect,
  parentId,
  selectedId
}: {
  elements: Map<string, DesignElement>;
  node: DesignTreeNode;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void;
  onSelect: (id: string) => void;
  parentId: string;
  selectedId: string;
}) {
  const element = elements.get(node.id);
  if (!element) return null;
  const childNodes = node.children ?? [];
  const children = childNodes.map((child) => (
    <DesignRenderer
      key={child.id}
      elements={elements}
      node={child}
      parentId={node.id}
      selectedId={selectedId}
      onDelete={onDelete}
      onMove={onMove}
      onUpdateProps={onUpdateProps}
      onSelect={onSelect}
    />
  ));
  const selected = selectedId === element.id;
  const emptyContainer = isContainerElement(element.type) && element.type !== "page" && childNodes.length === 0;

  return (
    <CanvasNodeFrame
      element={element}
      parentId={parentId}
      selected={selected}
      onDelete={onDelete}
      onMove={onMove}
      onSelect={onSelect}
    >
      {renderElementContent(element, children, selected, onSelect, onUpdateProps, emptyContainer)}
    </CanvasNodeFrame>
  );
}

function CanvasNodeFrame({
  children,
  element,
  onDelete,
  onMove,
  onSelect,
  parentId,
  selected
}: {
  children: ReactNode;
  element: DesignElement;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  parentId: string;
  selected: boolean;
}) {
  const container = isContainerElement(element.type);
  const className = [
    "group/design relative transition",
    element.type !== "page" ? "design-sortable-node" : "",
    container ? "design-node-dropzone" : "",
    selected ? "z-10 ring-2 ring-[#0f766e] ring-offset-2 ring-offset-white" : "hover:ring-1 hover:ring-[#9db0c4]",
    element.type !== "page" ? "rounded-lg" : ""
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      data-drop-parent-id={container ? element.id : undefined}
      data-layout-direction={container ? element.layout?.direction ?? "vertical" : undefined}
      data-node-id={element.id}
      data-parent-id={parentId}
      style={element.type === "page" ? undefined : flexItemStyle(element.layout)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(element.id);
      }}
    >
      {selected && element.type !== "page" ? (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-[#cbd5df] bg-white/95 p-1 shadow-sm">
          <IconAction label="上移" onClick={() => onMove(element.id, "up")}><ArrowUp size={13} /></IconAction>
          <IconAction label="下移" onClick={() => onMove(element.id, "down")}><ArrowDown size={13} /></IconAction>
          <IconAction label="删除" onClick={() => onDelete(element.id)}><Trash2 size={13} /></IconAction>
        </div>
      ) : null}
      <div className={container ? "min-h-8" : ""}>
        {children}
      </div>
    </div>
  );
}

function EmptyContainerHint() {
  return (
    <div className="pointer-events-none flex min-h-[92px] items-center justify-center rounded-lg border border-dashed border-[#8fb9b2] bg-[repeating-linear-gradient(135deg,rgba(232,244,242,0.78)_0,rgba(232,244,242,0.78)_8px,rgba(248,250,251,0.94)_8px,rgba(248,250,251,0.94)_16px)] p-3">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="grid h-10 w-16 place-items-center rounded-md border border-[#b7d5d0] bg-white/85 shadow-inner">
          <span className="text-lg font-semibold leading-none text-[#0f766e]/70">+</span>
        </div>
        <span className="text-xs font-medium text-[#5b6472]">拖入内容</span>
      </div>
    </div>
  );
}

function IconAction({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded text-[#5b6472] hover:bg-[#eef2f5]"
      title={label}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function renderElementContent(
  element: DesignElement,
  children: ReactNode,
  selected: boolean,
  onSelect: (id: string) => void,
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void,
  emptyContainer: boolean
) {
  if (element.type === "page") {
    return <div className={layoutClass(element, "min-h-[760px] bg-white p-8")} style={baseVisualStyle(element.style.base)}>{children}</div>;
  }
  if (element.type === "section") {
    return <section className={layoutClass(element, "rounded-lg border border-[#d9e1e8] bg-white p-5")} style={baseVisualStyle(element.style.base)}>{emptyContainer ? <EmptyContainerHint /> : children}</section>;
  }
  if (element.type === "stack") {
    return <div className={layoutClass(element, "rounded-lg border border-dashed border-[#cbd5df] bg-[#f8fafb] p-4")} style={baseVisualStyle(element.style.base)}>{emptyContainer ? <EmptyContainerHint /> : children}</div>;
  }
  if (element.type === "text") return <TextPreview element={element} selected={selected} onSelect={onSelect} onUpdateProps={onUpdateProps} />;
  if (element.type === "image") return <ImagePreview element={element} />;
  if (element.type === "input") return <InputPreview element={element} />;
  if (element.type === "badge") return <BadgePreview element={element} />;
  if (element.type === "divider") return <DividerPreview element={element} />;
  if (element.type === "stat") return <StatPreview element={element} />;
  if (element.type === "filter") return <FilterPreview element={element} />;
  if (element.type === "table") return <TablePreview element={element} />;
  if (element.type === "form") return <FormPreview element={element} />;
  if (element.type === "button") return <ButtonPreview element={element} />;
  return null;
}

function TextPreview({
  element,
  onSelect,
  onUpdateProps,
  selected
}: {
  element: DesignElement;
  selected: boolean;
  onSelect: (id: string) => void;
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void;
}) {
  if (element.type !== "text") return null;
  const role = element.style.text.role;
  const text = String(element.props?.text ?? element.name);
  const textStyle: CSSProperties = {
    ...baseVisualStyle(element.style.base),
    textDecoration: element.style.text.decoration === "lineThrough" ? "line-through" : element.style.text.decoration,
    textTransform: element.style.text.transform === "none" ? undefined : element.style.text.transform
  };
  if (role === "heading" || role === "subheading") {
    return (
      <div className="min-w-0 flex-1">
        <EditableCanvasText
          as="h2"
          className="min-h-[34px] cursor-text rounded px-1 text-[28px] font-bold leading-tight text-[#101828] outline-none focus:bg-[#e8f4f2] focus:ring-2 focus:ring-[#0f766e]/30"
          element={element}
          selected={selected}
          style={textStyle}
          text={text}
          onSelect={onSelect}
          onUpdateProps={onUpdateProps}
        />
      </div>
    );
  }
  return (
    <div>
      <EditableCanvasText
        as="p"
        className="min-h-6 cursor-text rounded px-1 text-sm leading-6 text-[#101828] outline-none focus:bg-[#e8f4f2] focus:ring-2 focus:ring-[#0f766e]/30"
        element={element}
        selected={selected}
        style={textStyle}
        text={text}
        onSelect={onSelect}
        onUpdateProps={onUpdateProps}
      />
    </div>
  );
}

function EditableCanvasText({
  as,
  className,
  element,
  onSelect,
  onUpdateProps,
  selected,
  style,
  text
}: {
  as: "h2" | "p";
  className: string;
  element: DesignElement;
  selected: boolean;
  style?: CSSProperties;
  text: string;
  onSelect: (id: string) => void;
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void;
}) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  const Tag = as;

  useLayoutEffect(() => {
    const node = ref.current;
    if (node && node.textContent !== text) node.textContent = text;
  }, [element.id, text]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!selected || !node || document.activeElement === node) return;
    node.focus();
    selectTextNodeContents(node);
  }, [element.id, selected]);

  return (
    <Tag
      ref={ref}
      contentEditable={selected}
      data-canvas-text-editor={selected ? "true" : undefined}
      data-canvas-text-trigger={selected ? undefined : "true"}
      suppressContentEditableWarning
      tabIndex={0}
      className={className}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(element.id);
      }}
      onInput={(event) => onUpdateProps(element.id, { text: event.currentTarget.textContent ?? "" })}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.blur();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!selected) {
          event.preventDefault();
          onSelect(element.id);
        }
      }}
    />
  );
}

function selectTextNodeContents(node: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function StatPreview({ element }: { element: DesignElement }) {
  if (element.type !== "stat") return null;
  const valueClass = element.style.stat.valueSize === "xl" ? "text-2xl" : element.style.stat.valueSize === "lg" ? "text-xl" : "text-lg";
  return (
    <div data-stat-card className="rounded-lg border border-[#d9e1e8] p-4" style={baseVisualStyle(element.style.base)}>
      <div className="text-xs font-semibold opacity-80">{String(element.props?.label ?? element.name)}</div>
      <div className={`mt-2 font-bold text-[#101828] ${valueClass}`}>{String(element.props?.value ?? "0")}</div>
      <div className="mt-1 text-xs font-semibold">{String(element.props?.delta ?? "")}</div>
    </div>
  );
}

function FilterPreview({ element }: { element: DesignElement }) {
  if (element.type !== "filter") return null;
  const fields = arrayProp(element.props?.fields, ["stage", "owner"]);
  return (
    <div className="rounded-lg border border-[#d9e1e8] bg-white p-4" style={baseVisualStyle(element.style.base)}>
      <div className="flex flex-wrap items-center gap-3">
        <Input readOnly placeholder="搜索客户名称 / 邮箱" className="min-w-[220px] flex-1" />
        {fields.slice(0, 3).map((field) => (
          <select key={field} className="h-10 min-w-[140px] rounded-md border border-[#d9e1e8] bg-white px-3 text-sm text-[#5b6472]">
            <option>{fieldLabels[field] ?? field}</option>
          </select>
        ))}
        <Button variant="secondary">筛选</Button>
      </div>
    </div>
  );
}

function TablePreview({ element }: { element: DesignElement }) {
  if (element.type !== "table") return null;
  const columns = arrayProp(element.props?.columns, ["name", "stage", "owner", "health"]);
  const rowPadding = element.style.table.density === "compact" ? "px-4 py-2" : element.style.table.density === "comfortable" ? "px-4 py-4" : "px-4 py-3";
  return (
    <div className="overflow-hidden rounded-lg border border-[#d9e1e8] bg-white" style={baseVisualStyle(element.style.base)}>
      <div className="border-b border-[#eef2f5] px-4 py-3 text-sm font-bold text-[#101828]">{element.name}</div>
      <div className="flex px-4 py-3 text-xs font-bold text-[#5b6472]" style={{ backgroundColor: colorValue(element.style.table.headerBackground) }}>
        {columns.map((column) => <span key={column} className="min-w-[92px] flex-1">{fieldLabels[column] ?? column}</span>)}
      </div>
      {customerRows.map((row, index) => (
        <div key={row.name} className={`flex border-t border-[#eef2f5] text-sm text-[#101828] ${rowPadding}`} style={element.style.table.zebra && index % 2 === 1 ? { backgroundColor: colorValue("muted") } : undefined}>
          {columns.map((column) => <span key={column} className="min-w-[92px] flex-1">{String(row[column as keyof typeof row] ?? "-")}</span>)}
        </div>
      ))}
    </div>
  );
}

function FormPreview({ element }: { element: DesignElement }) {
  if (element.type !== "form") return null;
  const fields = arrayProp(element.props?.fields, ["name", "stage", "owner"]);
  return (
    <div className="rounded-lg border border-[#d9e1e8] bg-white p-4" style={baseVisualStyle(element.style.base)}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold">{element.name}</div>
        <span className="rounded-md bg-[#eef2f5] px-2 py-1 text-xs text-[#5b6472]">{String(element.props?.mode ?? "drawer")}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {fields.map((field) => (
          <div key={field} className="min-w-[180px] flex-1">
            <div className="mb-1.5 text-xs font-semibold text-[#5b6472]">{fieldLabels[field] ?? field}</div>
            <div className="h-10 rounded-md border border-[#d9e1e8] bg-[#f8fafb]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ButtonPreview({ element }: { element: DesignElement }) {
  if (element.type !== "button") return null;
  const sizeClass = element.style.button.size === "lg" ? "h-11 px-5" : element.style.button.size === "sm" ? "h-8 px-3" : "h-10 px-4";
  return <button className={`${sizeClass} rounded-md text-sm font-semibold`} style={baseVisualStyle(element.style.base)}>{String(element.props?.label ?? element.name)}</button>;
}

function ImagePreview({ element }: { element: DesignElement }) {
  if (element.type !== "image") return null;
  const aspectRatio = element.style.image.aspectRatio === "square" ? "aspect-square" : element.style.image.aspectRatio === "portrait" ? "aspect-[4/5]" : "aspect-[16/7]";
  const src = typeof element.props?.src === "string" ? element.props.src : "";
  const alt = String(element.props?.alt ?? element.name);
  return (
    <div className={`${aspectRatio} flex min-h-[120px] items-center justify-center overflow-hidden rounded-lg border border-[#d9e1e8] bg-[linear-gradient(135deg,#e8f4f2,#eef2f5_45%,#f8fafb)]`} style={baseVisualStyle(element.style.base)}>
      {src ? <img src={src} alt={alt} className="h-full w-full" style={{ objectFit: element.style.image.objectFit }} /> : <div className="rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-[#5b6472]">{alt}</div>}
    </div>
  );
}

function InputPreview({ element }: { element: DesignElement }) {
  if (element.type !== "input") return null;
  return (
    <label className="block min-w-[220px]" style={baseVisualStyle(element.style.base)}>
      <span className="mb-1.5 block text-xs font-semibold text-[#5b6472]">{String(element.props?.label ?? element.name)}</span>
      <Input readOnly placeholder={String(element.props?.placeholder ?? "请输入内容")} />
    </label>
  );
}

function BadgePreview({ element }: { element: DesignElement }) {
  if (element.type !== "badge") return null;
  const sizeClass = element.style.badge.size === "lg" ? "h-8 px-3 text-sm" : element.style.badge.size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs";
  return <span className={`inline-flex items-center rounded-md border font-bold ${sizeClass}`} style={baseVisualStyle(element.style.base)}>{String(element.props?.label ?? element.name)}</span>;
}

function DividerPreview({ element }: { element: DesignElement }) {
  if (element.type !== "divider") return null;
  const label = String(element.props?.label ?? "");
  return (
    <div className="flex w-full items-center gap-3 py-1">
      <div className="h-px flex-1" style={{ backgroundColor: colorValue(element.style.base.border.color) }} />
      {label ? <span className="text-xs font-semibold text-[#8a94a3]">{label}</span> : null}
      <div className="h-px flex-1" style={{ backgroundColor: colorValue(element.style.base.border.color) }} />
    </div>
  );
}

function baseVisualStyle(style: DesignBaseStyle): CSSProperties {
  const borderWidth = borderWidthValue(style.border.width);
  const backgroundImage = style.backgroundImage?.trim();
  return {
    backgroundColor: style.backgroundColor === "transparent" ? undefined : colorValue(style.backgroundColor),
    backgroundImage: backgroundImage ? cssUrl(backgroundImage) : undefined,
    backgroundPosition: backgroundImage ? "center" : undefined,
    backgroundRepeat: backgroundImage ? "no-repeat" : undefined,
    backgroundSize: backgroundImage ? "cover" : undefined,
    borderColor: colorValue(style.border.color),
    borderStyle: style.border.style,
    borderWidth,
    borderRadius: radiusValue(style.radius),
    color: colorValue(style.text.color),
    fontFamily: fontFamilyValue(style.text.fontFamily),
    fontSize: fontSizeValue(style.text.fontSize),
    fontWeight: fontWeightValue(style.text.fontWeight),
    lineHeight: lineHeightValue(style.text.lineHeight),
    textAlign: style.text.align
  };
}

function cssUrl(value: string) {
  return `url(${JSON.stringify(value)})`;
}

function colorValue(token: string) {
  const colors: Record<string, string> = {
    transparent: "transparent",
    surface: "#ffffff",
    muted: "#f8fafb",
    white: "#ffffff",
    brand: "#0f766e",
    success: "#12a879",
    warning: "#f59e0b",
    danger: "#dc2626",
    textPrimary: "#101828",
    textSecondary: "#5b6472",
    border: "#d9e1e8"
  };
  return colors[token] ?? colors.textPrimary;
}

function radiusValue(token: string) {
  const radii: Record<string, string> = {
    none: "0",
    xs: "2px",
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
    full: "999px"
  };
  return radii[token] ?? radii.md;
}

function borderWidthValue(token: string) {
  if (token === "sm") return 1;
  if (token === "md") return 2;
  if (token === "lg") return 3;
  return 0;
}

function fontFamilyValue(token: string) {
  if (token === "mono") return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  if (token === "serif") return "Georgia, Cambria, Times New Roman, serif";
  return "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
}

function fontSizeValue(token: string) {
  const sizes: Record<string, string> = {
    xs: "12px",
    sm: "14px",
    md: "16px",
    lg: "18px",
    xl: "22px",
    "2xl": "28px",
    "3xl": "34px"
  };
  return sizes[token] ?? sizes.md;
}

function fontWeightValue(token: string) {
  if (token === "medium") return 500;
  if (token === "semibold") return 600;
  if (token === "bold") return 700;
  return 400;
}

function lineHeightValue(token: string) {
  if (token === "tight") return 1.2;
  if (token === "relaxed") return 1.65;
  return 1.45;
}

function layoutClass(element: DesignElement, base: string) {
  const layout = element.layout;
  const direction = layout?.direction === "horizontal" ? "flex-row" : "flex-col";
  const align = layout?.align === "center" ? "items-center" : layout?.align === "end" ? "items-end" : layout?.align === "stretch" ? "items-stretch" : "items-start";
  const justify = layout?.justify === "center" ? "justify-center" : layout?.justify === "end" ? "justify-end" : layout?.justify === "between" ? "justify-between" : "justify-start";
  const allowWrap = layout?.wrap ?? layout?.direction === "horizontal";
  const wrap = allowWrap ? "flex-wrap" : "flex-nowrap";
  return [
    base,
    "flex",
    direction,
    align,
    justify,
    wrap,
    gapClass(layout?.gap),
    paddingClass(layout?.padding),
    sizeClass("w", layout?.width),
    sizeClass("h", layout?.height)
  ].filter(Boolean).join(" ");
}

function gapClass(value: string | undefined) {
  if (value === "none") return "gap-0";
  if (value === "xs") return "gap-1";
  if (value === "sm") return "gap-2";
  if (value === "lg") return "gap-6";
  if (value === "xl") return "gap-8";
  return "gap-4";
}

function paddingClass(value: string | undefined) {
  if (!value || value === "none") return "";
  if (value === "xs") return "p-1";
  if (value === "sm") return "p-2";
  if (value === "lg") return "p-6";
  if (value === "xl") return "p-8";
  return "p-4";
}

function sizeClass(axis: "w" | "h", value: DesignLayout["width"] | DesignLayout["height"]) {
  if (value === "fill") return axis === "w" ? "w-full" : "h-full";
  if (value === "hug") return axis === "w" ? "w-fit" : "h-fit";
  return "";
}

function flexItemStyle(layout: DesignLayout | undefined): CSSProperties | undefined {
  if (!layout) return undefined;
  const style: CSSProperties = {};
  if (layout.grow === "fill") {
    style.flexGrow = 1;
    style.flexShrink = 1;
    style.flexBasis = 0;
  } else if (layout.grow === "none") {
    style.flexGrow = 0;
    style.flexShrink = 0;
  }
  if (layout.width === "fixed" && layout.fixedWidth) style.width = layout.fixedWidth;
  if (layout.height === "fixed" && layout.fixedHeight) style.height = layout.fixedHeight;
  return Object.keys(style).length > 0 ? style : undefined;
}

function arrayProp(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}
