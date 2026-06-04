export function QuickPromptGrid({ onPick, prompts }: { onPick: (prompt: string) => void; prompts: string[][] }) {
  return (
    <div className="space-y-3 animate-fade-up">
      <div className="text-[13px] font-bold text-[#8a94a3]">可以这样开始</div>
      <div className="grid gap-3 md:grid-cols-2">
        {prompts.map(([title, text], index) => (
          <button
            key={title}
            onClick={() => onPick(title)}
            className="rounded-xl border border-[#e1e7ee] bg-white/80 p-4 text-left transition-all duration-200 hover:border-[#b9c4cf] hover:bg-white hover:shadow-md hover:-translate-y-0.5 animate-fade-up"
            style={{ animationDelay: `${120 + index * 80}ms` }}
          >
            <div className="text-sm font-bold">{title}</div>
            <div className="mt-2 text-xs text-[#5b6472]">{text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
