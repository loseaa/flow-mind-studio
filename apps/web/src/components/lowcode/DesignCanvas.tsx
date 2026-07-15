import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import interact from "interactjs";
import type { CSSProperties } from "react";
import { designImageSlotSchema, type DesignBaseStyle, type DesignDocument, type DesignElement, type DesignImageSlot, type DesignLayout, type DesignTreeNode, type DesignVariables, type JsonValue } from "@flowmind/shared";
import { Button, Input } from "@flowmind/ui";
import { customerRows, fieldLabels, isContainerElement } from "./lowcodeData";
import { elementMap } from "./designDocumentOps";
import { clearDropPlacementIndicator, setDropPlacementIndicator } from "./dropPlacementIndicator";
import { resolveMaterialDropTarget } from "./materialDropResolver";
import { resolveVariableText } from "./variableResolver";
import { resolveElementProperty } from "./bindingResolver";

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
            variables={document.variables}
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
  selectedId,
  variables
}: {
  elements: Map<string, DesignElement>;
  node: DesignTreeNode;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void;
  onSelect: (id: string) => void;
  parentId: string;
  selectedId: string;
  variables: DesignVariables;
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
      variables={variables}
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
      {renderElementContent(element, children, selected, onSelect, onUpdateProps, emptyContainer, variables)}
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
    "group/design relative z-[1] transition",
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
      <div className={container ? "h-full min-h-8 w-full" : "h-full w-full"}>
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
  emptyContainer: boolean,
  variables: DesignVariables
) {
  if (element.type === "page") {
    return <div className={layoutClass(element, "relative min-h-[760px] bg-white p-8")} {...imageSlotDataAttributes(element)} style={containerVisualStyle(element)}>{renderContainerChildren(element, children, emptyContainer)}</div>;
  }
  if (element.type === "section") {
    return <section className={layoutClass(element, "relative rounded-lg border border-[#d9e1e8] bg-white p-5")} {...imageSlotDataAttributes(element)} style={containerVisualStyle(element)}>{renderContainerChildren(element, children, emptyContainer)}</section>;
  }
  if (element.type === "stack") {
    return <div className={layoutClass(element, "relative rounded-lg border border-dashed border-[#cbd5df] bg-[#f8fafb] p-4")} {...imageSlotDataAttributes(element)} style={containerVisualStyle(element)}>{renderContainerChildren(element, children, emptyContainer)}</div>;
  }
  if (element.type === "text") return <TextPreview element={element} selected={selected} onSelect={onSelect} onUpdateProps={onUpdateProps} variables={variables} />;
  if (element.type === "image") return <ImagePreview element={element} variables={variables} />;
  if (element.type === "input") return <InputPreview element={element} variables={variables} />;
  if (element.type === "badge") return <BadgePreview element={element} variables={variables} />;
  if (element.type === "divider") return <DividerPreview element={element} variables={variables} />;
  if (element.type === "shape") return <ShapePreview element={element} />;
  if (element.type === "stat") return <StatPreview element={element} variables={variables} />;
  if (element.type === "filter") return <FilterPreview element={element} />;
  if (element.type === "table") return <TablePreview element={element} variables={variables} />;
  if (element.type === "form") return <FormPreview element={element} />;
  if (element.type === "button") return <ButtonPreview element={element} variables={variables} />;
  return null;
}

function renderContainerChildren(element: DesignElement, children: ReactNode, emptyContainer: boolean) {
  const slot = readImageSlot(element);
  const hasBackground = Boolean(slot && slot.placement === "background" && element.style.base.backgroundImage?.trim());
  return (
    <>
      {hasBackground && slot ? <div aria-hidden data-image-slot-overlay={slot.id} className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]" style={backgroundOverlayStyle(slot)} /> : null}
      {emptyContainer ? <EmptyContainerHint /> : children}
    </>
  );
}
function TextPreview({
  element,
  onSelect,
  onUpdateProps,
  selected,
  variables
}: {
  element: DesignElement;
  selected: boolean;
  variables: DesignVariables;
  onSelect: (id: string) => void;
  onUpdateProps: (id: string, patch: Record<string, unknown>) => void;
}) {
  if (element.type !== "text") return null;
  const role = element.style.text.role;
  const hasStructuredBinding = Boolean(element.bindings?.text);
  const text = hasStructuredBinding
    ? String(resolveElementProperty(element, "text", variables, element.name, "string"))
    : resolveVariableText(String(element.props?.text ?? element.name), selected ? {} : variables);
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
          selected={selected && !hasStructuredBinding}
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
        selected={selected && !hasStructuredBinding}
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

function StatPreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "stat") return null;
  const valueClass = element.style.stat.valueSize === "xl" ? "text-2xl" : element.style.stat.valueSize === "lg" ? "text-xl" : "text-lg";
  const compact = Boolean(element.props?.compact);
  return (
    <div data-stat-card className={`rounded-md border border-[#d9e1e8] ${slotFillClass(element)} ${compact ? "p-2" : "p-4"}`} style={baseVisualStyle(element.style.base)}>
      <div className="text-xs font-semibold opacity-80">{resolveVariableText(String(element.props?.label ?? element.name), variables)}</div>
      <div className={`${compact ? "mt-0.5" : "mt-2"} font-bold text-[#101828] ${compact ? "text-sm" : valueClass}`}>{resolveVariableText(String(element.props?.value ?? "0"), variables)}</div>
      <div className={`${compact ? "mt-0 text-[11px]" : "mt-1 text-xs"} font-semibold`}>{resolveVariableText(String(element.props?.delta ?? ""), variables)}</div>
    </div>
  );
}

function FilterPreview({ element }: { element: DesignElement }) {
  if (element.type !== "filter") return null;
  const fields = arrayProp(element.props?.fields, ["stage", "owner"]);
  if (element.props?.compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-md p-1.5 ${slotFillClass(element)}`} style={baseVisualStyle(element.style.base)}>
        {fields.slice(0, 3).map((field) => (
          <div key={field} className="flex h-8 min-w-[108px] items-center justify-between gap-2 rounded-md border border-[#d9e1e8] bg-white px-2.5 text-xs text-[#101828]">
            <span>{fieldLabels[field] ?? field}</span>
            <span className="text-[#8a94a3]">⌄</span>
          </div>
        ))}
        {typeof element.props.activeLabel === "string" ? <span className="inline-flex h-6 items-center rounded-md bg-[#ddf7ef] px-2 text-[11px] font-medium text-[#0f766e]">{element.props.activeLabel}</span> : null}
      </div>
    );
  }
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

function TablePreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "table") return null;
  const columns = arrayProp(element.props?.columns, ["name", "stage", "owner", "health"]);
  const resolvedRows = resolveElementProperty(element, "rows", variables, (element.props?.rows ?? customerRows) as JsonValue, "array");
  const rows: Array<Record<string, JsonValue>> = Array.isArray(resolvedRows)
    ? resolvedRows.filter(isDataRow)
    : customerRows as Array<Record<string, JsonValue>>;
  const rowPadding = element.style.table.density === "compact" ? "px-4 py-2" : element.style.table.density === "comfortable" ? "px-4 py-4" : "px-4 py-3";
  const compact = Boolean(element.props?.compact);
  return (
    <div className={`overflow-hidden rounded-lg border border-[#d9e1e8] bg-white ${slotFillClass(element)}`} style={baseVisualStyle(element.style.base)}>
      {compact ? null : <div className="border-b border-[#eef2f5] px-4 py-3 text-sm font-bold text-[#101828]">{element.name}</div>}
      <div className={`flex ${compact ? "px-3 py-2" : "px-4 py-3"} text-xs font-bold text-[#5b6472]`} style={{ backgroundColor: colorValue(element.style.table.headerBackground) }}>
        {columns.map((column) => <span key={column} className="min-w-[92px] flex-1">{fieldLabels[column] ?? column}</span>)}
      </div>
      {rows.map((row, index) => (
        <div key={String(row.id ?? row.name ?? index)} className={`flex border-t border-[#eef2f5] text-sm text-[#101828] ${rowPadding}`} style={element.style.table.zebra && index % 2 === 1 ? { backgroundColor: colorValue("muted") } : undefined}>
          {columns.map((column) => <span key={column} className="min-w-[92px] flex-1">{renderCellValue(row[column])}</span>)}
        </div>
      ))}
    </div>
  );
}

function isDataRow(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function renderCellValue(value: JsonValue | undefined) {
  if (value === undefined) return "-";
  if (value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
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

function ButtonPreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "button") return null;
  const sizeClass = element.style.button.size === "lg" ? "h-11 px-5" : element.style.button.size === "sm" ? "h-8 px-3" : "h-10 px-4";
  const label = String(resolveElementProperty(element, "label", variables, element.name, "string"));
  const disabled = Boolean(resolveElementProperty(element, "disabled", variables, Boolean(element.props?.disabled), "boolean"));
  return <button aria-disabled={disabled} type="button" className={`inline-flex cursor-default items-center justify-center ${slotFillClass(element) || sizeClass} rounded-md text-sm font-semibold ${disabled ? "opacity-50" : ""}`} style={baseVisualStyle(element.style.base)}>{label}</button>;
}

function ImagePreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "image") return null;
  const slot = readImageSlot(element);
  const aspectRatio = element.style.image.aspectRatio === "square" ? "aspect-square" : element.style.image.aspectRatio === "portrait" ? "aspect-[4/5]" : "aspect-[16/7]";
  const src = typeof element.props?.src === "string" ? element.props.src : "";
  const alt = resolveVariableText(String(element.props?.alt ?? element.name), variables);
  const fixedSize = element.layout?.width === "fixed" || element.layout?.height === "fixed";
  const fallbackSizeClass = fixedSize ? "h-full w-full" : `${aspectRatio} min-h-[120px]`;
  const slotStyle = slot ? imageSlotStyle(slot) : undefined;
  return (
    <div
      data-image-slot={slot?.id}
      data-image-slot-placement={slot?.placement}
      data-image-slot-role={slot?.role}
      data-image-slot-safe-area={slot?.generation.safeArea}
      className={`${slot ? "" : fallbackSizeClass} flex items-center justify-center overflow-hidden rounded-lg border border-[#d9e1e8] bg-[linear-gradient(135deg,#e8f4f2,#eef2f5_45%,#f8fafb)]`}
      style={{ ...baseVisualStyle(element.style.base), ...slotStyle }}
    >
      {src ? <img src={src} alt={alt} className="block h-full w-full min-w-0" style={{ objectFit: slot?.display.objectFit ?? element.style.image.objectFit, objectPosition: slot ? focalPointValue(slot.display.focalPoint) : undefined }} /> : <div className="flex h-full min-h-[inherit] w-full items-center justify-center rounded-md bg-white/80 px-3 py-2 text-center text-xs font-semibold text-[#5b6472]">{alt}</div>}
    </div>
  );
}

function InputPreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "input") return null;
  if (element.props?.compact) {
    return (
      <label className={`block min-w-[220px] ${slotFillClass(element)}`} style={baseVisualStyle(element.style.base)}>
        <Input readOnly placeholder={resolveVariableText(String(element.props?.placeholder ?? "请输入内容"), variables)} className="h-8 text-xs" />
      </label>
    );
  }
  return (
    <label className="block min-w-[220px]" style={baseVisualStyle(element.style.base)}>
      <span className="mb-1.5 block text-xs font-semibold text-[#5b6472]">{resolveVariableText(String(element.props?.label ?? element.name), variables)}</span>
      <Input readOnly placeholder={resolveVariableText(String(element.props?.placeholder ?? "请输入内容"), variables)} />
    </label>
  );
}

function BadgePreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "badge") return null;
  const sizeClass = element.style.badge.size === "lg" ? "h-8 px-3 text-sm" : element.style.badge.size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs";
  return <span className={`inline-flex items-center justify-center rounded-md border font-bold ${slotFillClass(element) || sizeClass}`} style={baseVisualStyle(element.style.base)}>{resolveVariableText(String(element.props?.label ?? element.name), variables)}</span>;
}

function DividerPreview({ element, variables }: { element: DesignElement; variables: DesignVariables }) {
  if (element.type !== "divider") return null;
  const label = resolveVariableText(String(element.props?.label ?? ""), variables);
  return (
    <div className="flex w-full items-center gap-3 py-1">
      <div className="h-px flex-1" style={{ backgroundColor: colorValue(element.style.base.border.color) }} />
      {label ? <span className="text-xs font-semibold text-[#8a94a3]">{label}</span> : null}
      <div className="h-px flex-1" style={{ backgroundColor: colorValue(element.style.base.border.color) }} />
    </div>
  );
}

function ShapePreview({ element }: { element: DesignElement }) {
  if (element.type !== "shape") return null;
  const kind = element.style.shape.kind;
  const baseStyle = baseVisualStyle(element.style.base);
  if (kind === "line") {
    const thickness = element.style.shape.thickness === "lg" ? 3 : element.style.shape.thickness === "md" ? 2 : 1;
    const direction = element.style.shape.direction ?? "horizontal";
    const lineStyle: CSSProperties = direction === "vertical"
      ? { width: thickness, height: "100%", minHeight: 48 }
      : { width: "100%", minWidth: 48, height: thickness };
    return <div data-shape-line data-shape-line-direction={direction} style={{ ...baseStyle, ...lineStyle, borderRadius: 999 }} />;
  }
  const fillClass = slotFillClass(element);
  return (
    <div
      className={fillClass || "h-12 w-12"}
      style={{
        ...baseStyle,
        borderRadius: kind === "circle" ? 999 : baseStyle.borderRadius
      }}
    />
  );
}

function slotFillClass(element: DesignElement) {
  const width = element.layout?.width === "fill" || element.layout?.width === "fixed" ? "w-full" : "";
  const height = element.layout?.height === "fill" || element.layout?.height === "fixed" ? "h-full" : "";
  return [width, height].filter(Boolean).join(" ");
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

function containerVisualStyle(element: DesignElement): CSSProperties {
  const container = "container" in element.style ? element.style.container : undefined;
  const slot = readImageSlot(element);
  const slotStyle = slot ? backgroundImageSlotStyle(slot) : undefined;
  return {
    ...baseVisualStyle(element.style.base),
    ...slotStyle,
    boxShadow: shadowValue(container?.shadow),
    overflow: container?.overflow === "visible" ? undefined : container?.overflow
  };
}

function readImageSlot(element: DesignElement): DesignImageSlot | undefined {
  const parsed = designImageSlotSchema.safeParse(element.props?.imageSlot);
  return parsed.success ? parsed.data : undefined;
}


function imageSlotDataAttributes(element: DesignElement) {
  const slot = readImageSlot(element);
  if (!slot || slot.placement !== "background") return {};
  return {
    "data-image-slot": "true",
    "data-image-slot-id": slot.id,
    "data-image-slot-placement": slot.placement,
    "data-image-slot-role": slot.role,
    "data-image-slot-safe-area": slot.generation.safeArea
  };
}

function imageSlotStyle(slot: DesignImageSlot): CSSProperties {
  const width = slot.display.width === "fill" ? "100%" : slot.display.width === "half" ? "50%" : "33.333%";
  return {
    aspectRatio: slot.display.aspectRatio.replace(":", " / "),
    minHeight: slot.display.minHeight,
    maxHeight: slot.display.maxHeight,
    width,
    maxWidth: "100%",
    minWidth: 0,
    flexBasis: width,
    flexShrink: 1
  };
}

function backgroundImageSlotStyle(slot: DesignImageSlot): CSSProperties {
  return {
    minHeight: slot.display.minHeight,
    maxHeight: slot.display.maxHeight,
    backgroundSize: slot.display.objectFit,
    backgroundPosition: focalPointValue(slot.display.focalPoint),
    backgroundRepeat: "no-repeat"
  };
}

function backgroundOverlayStyle(slot: DesignImageSlot): CSSProperties {
  if (slot.generation.safeArea === "left") {
    return { background: "linear-gradient(90deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.48) 42%, rgba(255,255,255,0) 72%)" };
  }
  if (slot.generation.safeArea === "right") {
    return { background: "linear-gradient(270deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.48) 42%, rgba(255,255,255,0) 72%)" };
  }
  if (slot.generation.safeArea === "center") {
    return { background: "radial-gradient(circle at center, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.42) 44%, rgba(255,255,255,0) 76%)" };
  }
  return { background: "linear-gradient(180deg, rgba(255,255,255,0.48), rgba(255,255,255,0.18))" };
}
function focalPointValue(value: DesignImageSlot["display"]["focalPoint"]) {
  if (value === "top") return "center top";
  if (value === "left") return "left center";
  if (value === "right") return "right center";
  return "center center";
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

function shadowValue(token: string | undefined) {
  if (token === "sm") return "0 2px 4px rgba(16, 24, 40, 0.15)";
  if (token === "md") return "0 5px 10px rgba(16, 24, 40, 0.18)";
  if (token === "lg") return "0 9px 16px rgba(16, 24, 40, 0.2)";
  return undefined;
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
  if (value === "fill" || value === "fixed") return axis === "w" ? "w-full" : "h-full";
  if (value === "hug") return axis === "w" ? "w-fit" : "h-fit";
  return "";
}

function flexItemStyle(layout: DesignLayout | undefined): CSSProperties | undefined {
  if (!layout) return undefined;
  const style: CSSProperties = {};
  if (layout.width === "fill") {
    style.width = "100%";
    style.minWidth = 0;
  } else if (layout.width === "hug") {
    style.width = "fit-content";
  }
  if (layout.height === "fill") {
    style.height = "100%";
    style.minHeight = 0;
  } else if (layout.height === "hug") {
    style.height = "fit-content";
  }
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
