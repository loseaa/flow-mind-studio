import { Database, Eye, LayoutPanelTop, Monitor, Redo2, Undo2 } from "lucide-react";
import type { DesignDocument } from "@flowmind/shared";
import { Button } from "@flowmind/ui";
import { ToolbarIconButton } from "../app/ToolbarIconButton";

export function LowCodeToolbar({
  document,
  mode,
  onModeChange,
  saveState,
  onPublish,
  onSave
}: {
  document: DesignDocument;
  mode: "design" | "data";
  onModeChange: (mode: "design" | "data") => void;
  saveState: "draft" | "saved" | "published";
  onPublish: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-[#d9e1e8] bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-xs font-bold">{document.name} 搭建器</h1>
        <span className="rounded bg-[#eef2f5] px-1.5 py-0.5 font-mono text-[10px] text-[#5b6472]">{document.schemaVersion}</span>
        <span className="rounded bg-[#e8f4f2] px-1.5 py-0.5 text-[10px] font-bold text-[#0f766e]">
          {saveState === "published" ? "已发布" : saveState === "saved" ? "已保存" : "草稿"}
        </span>
      </div>
      <div className="flex items-center gap-1 rounded-md bg-[#eef2f5] p-0.5">
        <button aria-pressed={mode === "design"} className={`flex h-7 items-center gap-1.5 rounded px-3 text-xs font-bold ${mode === "design" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472]"}`} type="button" onClick={() => onModeChange("design")}>
          <LayoutPanelTop size={14} />设计
        </button>
        <button aria-pressed={mode === "data"} className={`flex h-7 items-center gap-1.5 rounded px-3 text-xs font-bold ${mode === "data" ? "bg-white text-[#101828] shadow-sm" : "text-[#5b6472]"}`} type="button" onClick={() => onModeChange("data")}>
          <Database size={14} />数据与变量
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-0.5 xl:flex">
          <ToolbarIconButton label="撤销"><Undo2 size={16} /></ToolbarIconButton>
          <ToolbarIconButton label="重做"><Redo2 size={16} /></ToolbarIconButton>
          <ToolbarIconButton label="桌面预览"><Monitor size={16} /></ToolbarIconButton>
          <ToolbarIconButton label="预览"><Eye size={16} /></ToolbarIconButton>
        </div>
        <Button variant="secondary" className="h-7 px-2 text-xs" onClick={onSave}>保存草稿</Button>
        <Button onClick={onPublish} className="h-7 bg-[#1e293b] px-2 text-xs">发布预览</Button>
      </div>
    </div>
  );
}
