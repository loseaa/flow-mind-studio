export function ChatWelcome() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#eef7f5] px-3 text-[13px] font-bold text-[#0f766e] animate-fade-down">
        <span className="h-2.5 w-2.5 rounded-full bg-[#0f766e] animate-pulse-soft" />
        FlowMind AI
      </span>
      <h1 className="animate-fade-up animate-delay-100 text-[34px] font-bold">今天想探索什么？</h1>
      <p className="animate-fade-up animate-delay-200 max-w-[720px] text-base leading-7 text-[#5b6472]">
        我可以帮你查询知识库、分析业务问题、生成管理页面，也可以在需要时调用企业工具。
      </p>
    </section>
  );
}
