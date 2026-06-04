import { ArrowUp, Check, FileText, Paperclip, Search, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { KnowledgeBase } from "@flowmind/shared";

export function ChatComposer({
  input,
  disabled = false,
  modelLabel = "deepseek-v4-flash",
  knowledgeBases = [],
  selectedKnowledgeBaseIds = [],
  onChange,
  onSend,
  onToggleKnowledgeBase,
}: {
  input: string;
  disabled?: boolean;
  modelLabel?: string;
  knowledgeBases?: KnowledgeBase[];
  selectedKnowledgeBaseIds?: string[];
  onChange: (value: string) => void;
  onSend: () => void;
  onToggleKnowledgeBase?: (knowledgeBaseId: string) => void;
}) {
  return (
    <div className="group rounded-2xl border border-[#b9c4cf] bg-white p-3.5 shadow-[0_10px_30px_-18px_rgba(30,41,59,0.45)] transition-shadow duration-300 focus-within:border-[#0f766e] focus-within:shadow-[0_10px_30px_-14px_rgba(15,118,110,0.25)]">
      <textarea
        value={input}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled) onSend();
          }
        }}
        disabled={disabled}
        placeholder="继续追问、粘贴资料，或让 FlowMind 帮你生成下一版方案..."
        className="min-h-[74px] w-full resize-none border-0 bg-transparent px-1 text-[15px] leading-6 outline-none placeholder:text-[#8a94a3] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex items-center justify-between pt-2">
        <div className="flex flex-wrap gap-2">
          <ComposerChip icon={<Paperclip size={14} />} label="附件" />
          {knowledgeBases.map((knowledgeBase) => {
            const selected = selectedKnowledgeBaseIds.includes(knowledgeBase.id);
            return (
              <button
                key={knowledgeBase.id}
                type="button"
                onClick={() => onToggleKnowledgeBase?.(knowledgeBase.id)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all duration-200 ${
                  selected ? "border-[#0f766e] bg-[#e8f4f2] text-[#0f766e]" : "border-[#d9e1e8] bg-[#f4f7fa] text-[#5b6472] hover:bg-white"
                }`}
              >
                {selected ? <Check size={14} /> : <FileText size={14} />}
                {knowledgeBase.name}
              </button>
            );
          })}
          <ComposerChip icon={<Search size={14} />} label={modelLabel} />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-[#8a94a3] sm:inline-flex">
            <UserRound size={13} className="mr-1" />宋
          </span>
          <button
            disabled={disabled || !input.trim()}
            onClick={onSend}
            className="inline-flex h-10 w-12 items-center justify-center rounded-[10px] bg-[#1e293b] text-white transition-all duration-200 hover:bg-[#111827] hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label="发送"
          >
            <ArrowUp
              size={18}
              className="transition-transform duration-200 group-focus-within:-translate-y-px"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function ComposerChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d9e1e8] bg-[#f4f7fa] px-3 text-xs font-medium text-[#5b6472] transition-all duration-200 hover:border-[#b9c4cf] hover:bg-white hover:text-[#111827] hover:shadow-sm">
      {icon}
      {label}
    </button>
  );
}
