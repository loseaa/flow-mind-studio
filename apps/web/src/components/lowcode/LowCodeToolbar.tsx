import { Eye, Monitor, Redo2, Undo2 } from "lucide-react";
import type { DesignDocument } from "@flowmind/shared";
import { Button } from "@flowmind/ui";
import { ToolbarIconButton } from "../app/ToolbarIconButton";

export function LowCodeToolbar({
  document,
  saveState,
  onPublish,
  onSave
}: {
  document: DesignDocument;
  saveState: "draft" | "saved" | "published";
  onPublish: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-[#d9e1e8] bg-white px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold">{document.name} 搭建器</h1>
        <span className="rounded-md bg-[#eef2f5] px-2 py-1 font-mono text-xs text-[#5b6472]">{document.schemaVersion}</span>
        <span className="rounded-md bg-[#e8f4f2] px-2 py-1 text-xs font-bold text-[#0f766e]">
          {saveState === "published" ? "已发布" : saveState === "saved" ? "已保存" : "草稿"}
        </span>
      </div>
      <div className="hidden items-center gap-1 md:flex">
        <ToolbarIconButton label="撤销"><Undo2 size={16} /></ToolbarIconButton>
        <ToolbarIconButton label="重做"><Redo2 size={16} /></ToolbarIconButton>
        <span className="mx-2 h-5 w-px bg-[#d9e1e8]" />
        <ToolbarIconButton label="桌面预览"><Monitor size={16} /></ToolbarIconButton>
        <ToolbarIconButton label="预览"><Eye size={16} /></ToolbarIconButton>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="h-9" onClick={onSave}>保存草稿</Button>
        <Button onClick={onPublish} className="h-9 bg-[#1e293b]">发布预览</Button>
      </div>
    </div>
  );
}
