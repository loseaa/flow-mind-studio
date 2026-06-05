import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import interact from "interactjs";
import type { CSSProperties } from "react";
import type { DesignDocument, DesignElement, DesignLayout, DesignTreeNode } from "@flowmind/shared";
import { Button, Input } from "@flowmind/ui";
import { customerRows, fieldLabels, isContainerElement } from "./lowcodeData";
import { elementMap } from "./designDocumentOps";

export function DesignCanvas({
  document,
  selectedId,
  onDelete,
  onMove,
  onReparent,
  onSelect
}: {
  document: DesignDocument;
  selectedId: string;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReparent: (id: string, parentId: string, index?: number) => void;
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
    const materialDropzones = interact(".design-node-dropzone").dropzone({
      accept: "[data-material-type]",
      overlap: 0.18,
      ondragenter: (event) => {
        event.target.classList.add("drop-target-active");
      },
      ondragleave: (event) => {
        event.target.classList.remove("drop-target-active");
      }
    });

    const sortableNodes = interact(".design-sortable-node").draggable({
      inertia: false,
      listeners: {
        start: (event) => {
          event.target.classList.add("dragging-node");
        },
        move: (event) => {
          const target = event.target as HTMLElement;
          const x = (Number(target.getAttribute("data-drag-x")) || 0) + event.dx;
          const y = (Number(target.getAttribute("data-drag-y")) || 0) + event.dy;
          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute("data-drag-x", String(x));
          target.setAttribute("data-drag-y", String(y));
        },
        end: (event) => {
          const target = event.target as HTMLElement;
          target.classList.remove("dragging-node");
          target.style.transform = "";
          target.removeAttribute("data-drag-x");
          target.removeAttribute("data-drag-y");
          const draggedId = target.getAttribute("data-node-id");
          const clientX = "clientX" in event ? Number(event.clientX) : 0;
          const clientY = "clientY" in event ? Number(event.clientY) : 0;
          const dropTarget = globalThis.document.elementFromPoint(clientX, clientY)?.closest(".design-sortable-node") as HTMLElement | null;
          if (!draggedId || !dropTarget || dropTarget === target) return;
          const parentId = dropTarget.getAttribute("data-parent-id");
          const siblings = Array.from(dropTarget.parentElement?.querySelectorAll(":scope > .design-sortable-node") ?? []);
          const index = siblings.indexOf(dropTarget);
          if (parentId && index >= 0) onReparent(draggedId, parentId, index);
        }
      }
    });

    return () => {
      materialDropzones.unset();
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
    if (event.button !== 2) return;
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
    <div className="h-full min-h-0 overflow-hidden bg-[#e8edf2]">
      <div className="h-full min-h-0 min-w-[760px] p-[18px_22px]">
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
    <>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">设计稿画布</div>
          <div className="mt-1 text-xs text-[#5b6472]">由 JSON schema 渲染，拖拽只更新结构数据。</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs text-[#5b6472]">
            <GripVertical size={14} />
            {Math.round(viewport.zoom * 100)}% · {document.canvas.width} / Desktop
          </div>
          <button className="rounded-md border border-[#cbd5df] bg-white px-3 py-2 text-xs font-semibold text-[#5b6472] hover:bg-[#f8fafb]" type="button" onClick={onResetViewport}>
            重置视图
          </button>
        </div>
      </div>
      <div
        className="mx-auto h-[calc(100%-52px)] min-h-[420px] overflow-hidden rounded-[18px] border border-[#b9c4cf] bg-[#dce4ec] p-5 shadow-[0_24px_60px_-35px_rgba(30,41,59,0.65)]"
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <div
          className="mx-auto overflow-hidden rounded-xl border border-[#aebac7] bg-white shadow-[0_18px_34px_-24px_rgba(30,41,59,0.7)] transition-shadow"
          style={{
            maxWidth: Math.min(document.canvas.width, 1100),
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: "top center"
          }}
        >
          {children}
        </div>
      </div>
    </>
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
  onSelect,
  parentId,
  selectedId
}: {
  elements: Map<string, DesignElement>;
  node: DesignTreeNode;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  parentId: string;
  selectedId: string;
}) {
  const element = elements.get(node.id);
  if (!element) return null;
  const children = (node.children ?? []).map((child) => (
    <DesignRenderer
      key={child.id}
      elements={elements}
      node={child}
      parentId={node.id}
      selectedId={selectedId}
      onDelete={onDelete}
      onMove={onMove}
      onSelect={onSelect}
    />
  ));

  return (
    <CanvasNodeFrame
      element={element}
      parentId={parentId}
      selected={selectedId === element.id}
      onDelete={onDelete}
      onMove={onMove}
      onSelect={onSelect}
    >
      {renderElementContent(element, children)}
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
      <div className={container ? "min-h-8" : ""}>{children}</div>
      {container ? <DropIndicator label={`拖入 ${element.name}`} /> : null}
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

function DropIndicator({ label }: { label: string }) {
  return (
    <div className="pointer-events-none mt-3 hidden rounded-md border border-dashed border-[#0f766e] bg-[#e8f4f2] px-3 py-2 text-center text-xs font-semibold text-[#0f766e] group-[.drop-target-active]/design:block">
      {label}
    </div>
  );
}

function renderElementContent(element: DesignElement, children: ReactNode) {
  if (element.type === "page") {
    return <div className={layoutClass(element, "min-h-[760px] bg-white p-8")}>{children}</div>;
  }
  if (element.type === "section") {
    return <section className={layoutClass(element, "rounded-lg border border-[#d9e1e8] bg-white p-5")}>{children}</section>;
  }
  if (element.type === "stack") {
    return <div className={layoutClass(element, "rounded-lg border border-dashed border-[#cbd5df] bg-[#f8fafb] p-4")}>{children}</div>;
  }
  if (element.type === "text") return <TextPreview element={element} />;
  if (element.type === "image") return <ImagePreview element={element} />;
  if (element.type === "input") return <InputPreview element={element} />;
  if (element.type === "badge") return <BadgePreview element={element} />;
  if (element.type === "divider") return <DividerPreview element={element} />;
  if (element.type === "stat") return <StatPreview element={element} />;
  if (element.type === "filter") return <FilterPreview element={element} />;
  if (element.type === "table") return <TablePreview element={element} />;
  if (element.type === "form") return <FormPreview element={element} />;
  if (element.type === "button") return <ButtonPreview element={element} />;
  return <div>{element.name}</div>;
}

function TextPreview({ element }: { element: DesignElement }) {
  const level = String(element.props?.level ?? "body");
  const text = String(element.props?.text ?? element.name);
  const description = String(element.props?.description ?? "");
  if (level === "h1") {
    return (
      <div className="min-w-0 flex-1">
        <h2 className="text-[28px] font-bold leading-tight text-[#101828]">{text}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-[#5b6472]">{description}</p> : null}
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm leading-6 text-[#101828]">{text}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-[#5b6472]">{description}</p> : null}
    </div>
  );
}

function StatPreview({ element }: { element: DesignElement }) {
  const tone = element.appearance?.tone ?? "muted";
  const toneClass = tone === "brand" ? "bg-[#e8f1ff] text-[#175cd3]" : tone === "success" ? "bg-[#e8f4f2] text-[#0f766e]" : tone === "warning" ? "bg-[#fff4e5] text-[#b54708]" : "bg-[#f3f5f7] text-[#344054]";
  return (
    <div className={`rounded-lg border border-[#d9e1e8] p-4 ${toneClass}`}>
      <div className="text-xs font-semibold opacity-80">{String(element.props?.label ?? element.name)}</div>
      <div className="mt-2 text-2xl font-bold text-[#101828]">{String(element.props?.value ?? "0")}</div>
      <div className="mt-1 text-xs font-semibold">{String(element.props?.delta ?? "")}</div>
    </div>
  );
}

function FilterPreview({ element }: { element: DesignElement }) {
  const fields = arrayProp(element.props?.fields, ["stage", "owner"]);
  return (
    <div className="rounded-lg border border-[#d9e1e8] bg-white p-4">
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
  const columns = arrayProp(element.props?.columns, ["name", "stage", "owner", "health"]);
  return (
    <div className="overflow-hidden rounded-lg border border-[#d9e1e8] bg-white">
      <div className="border-b border-[#eef2f5] px-4 py-3 text-sm font-bold text-[#101828]">{element.name}</div>
      <div className="flex bg-[#f8fafb] px-4 py-3 text-xs font-bold text-[#5b6472]">
        {columns.map((column) => <span key={column} className="min-w-[92px] flex-1">{fieldLabels[column] ?? column}</span>)}
      </div>
      {customerRows.map((row) => (
        <div key={row.name} className="flex border-t border-[#eef2f5] px-4 py-3 text-sm text-[#101828]">
          {columns.map((column) => <span key={column} className="min-w-[92px] flex-1">{String(row[column as keyof typeof row] ?? "-")}</span>)}
        </div>
      ))}
    </div>
  );
}

function FormPreview({ element }: { element: DesignElement }) {
  const fields = arrayProp(element.props?.fields, ["name", "stage", "owner"]);
  return (
    <div className="rounded-lg border border-[#d9e1e8] bg-white p-4">
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
  const tone = element.appearance?.tone === "brand" ? "bg-[#1e293b] text-white" : "border border-[#d9e1e8] bg-white text-[#101828]";
  return <button className={`h-10 rounded-md px-4 text-sm font-semibold ${tone}`}>{String(element.props?.label ?? element.name)}</button>;
}

function ImagePreview({ element }: { element: DesignElement }) {
  const aspectRatio = String(element.props?.aspectRatio ?? "wide") === "square" ? "aspect-square" : "aspect-[16/7]";
  return (
    <div className={`${aspectRatio} flex min-h-[120px] items-center justify-center overflow-hidden rounded-lg border border-[#d9e1e8] bg-[linear-gradient(135deg,#e8f4f2,#eef2f5_45%,#f8fafb)]`}>
      <div className="rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-[#5b6472]">{String(element.props?.alt ?? element.name)}</div>
    </div>
  );
}

function InputPreview({ element }: { element: DesignElement }) {
  return (
    <label className="block min-w-[220px]">
      <span className="mb-1.5 block text-xs font-semibold text-[#5b6472]">{String(element.props?.label ?? element.name)}</span>
      <Input readOnly placeholder={String(element.props?.placeholder ?? "请输入内容")} />
    </label>
  );
}

function BadgePreview({ element }: { element: DesignElement }) {
  const tone = element.appearance?.tone ?? "muted";
  const toneClass = tone === "brand" ? "border-[#b2ccff] bg-[#eff4ff] text-[#175cd3]" : tone === "success" ? "border-[#b7ddd6] bg-[#e8f4f2] text-[#0f766e]" : tone === "warning" ? "border-[#fedf89] bg-[#fff4e5] text-[#b54708]" : "border-[#d9e1e8] bg-[#f8fafb] text-[#5b6472]";
  return <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-bold ${toneClass}`}>{String(element.props?.label ?? element.name)}</span>;
}

function DividerPreview({ element }: { element: DesignElement }) {
  const label = String(element.props?.label ?? "");
  return (
    <div className="flex w-full items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[#d9e1e8]" />
      {label ? <span className="text-xs font-semibold text-[#8a94a3]">{label}</span> : null}
      <div className="h-px flex-1 bg-[#d9e1e8]" />
    </div>
  );
}

function layoutClass(element: DesignElement, base: string) {
  const layout = element.layout;
  const direction = layout?.direction === "horizontal" ? "flex-row" : "flex-col";
  const align = layout?.align === "center" ? "items-center" : layout?.align === "end" ? "items-end" : layout?.align === "stretch" ? "items-stretch" : "items-start";
  const justify = layout?.justify === "center" ? "justify-center" : layout?.justify === "end" ? "justify-end" : layout?.justify === "between" ? "justify-between" : "justify-start";
  const wrap = layout?.wrap ? "flex-wrap" : "flex-nowrap";
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
