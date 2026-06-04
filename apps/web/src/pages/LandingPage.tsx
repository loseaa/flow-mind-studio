import {
  ArrowRight,
  Boxes,
  FileText,
  MessageSquareText,
  Radio,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";

const capabilities = [
  {
    k: "RAG",
    title: "知识检索",
    text: "文件解析、向量索引、引用溯源和权限边界。",
  },
  {
    k: "Agent",
    title: "任务编排",
    text: "对话、检索、工具调用和业务步骤可观察执行。",
  },
  {
    k: "MCP",
    title: "工具调用",
    text: "风险分级、人工确认、审计日志和服务治理。",
  },
  {
    k: "Low-code",
    title: "业务落地",
    text: "围绕数据模型搭建表格、表单和动作流程。",
  },
];

const steps = [
  ["01", "上传知识", "导入文档，后台自动解析、切分并构建向量索引。"],
  ["02", "对话推理", "AI 在聊天中检索引用，结合上下文生成可追问答案。"],
  ["03", "执行落地", "通过 MCP 工具或低代码页面把结论转成业务动作。"],
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#111827]">
      <header className="border-b border-[#d9e1e8] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-6 lg:px-24">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#111827] text-sm font-bold text-white">
              F
            </span>
            <span className="text-lg font-semibold">
              FlowMindStudio 流思工作台
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <a
              href="#capabilities"
              className="text-[#111827] transition-colors duration-200 hover:text-[#0f766e]"
            >
              核心能力
            </a>
            <a
              href="#workflow"
              className="text-[#5b6472] transition-colors duration-200 hover:text-[#0f766e]"
            >
              工作流
            </a>
            <a
              href="#governance"
              className="text-[#5b6472] transition-colors duration-200 hover:text-[#0f766e]"
            >
              治理与安全
            </a>
            <Link
              to="/app/dashboard"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#111827] px-4 font-semibold text-white transition-all duration-200 hover:bg-[#0f766e] hover:shadow-md active:scale-95"
            >
              进入工作台
              <ArrowRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-[#111827] text-white">
        <div className="mx-auto grid max-w-[1440px] items-center gap-16 px-6 py-16 lg:grid-cols-[1fr_540px] lg:px-24 lg:py-[72px]">
          <div className="space-y-6">
            <span className="inline-flex animate-fade-down rounded-md border border-[#334155] bg-[#182333] px-2.5 py-1.5 text-sm font-semibold text-[#dff5f1]">
              面向 SaaS 团队的 AI 产品操作系统
            </span>
            <h1 className="animate-fade-up animate-delay-100 max-w-3xl text-5xl font-bold leading-none tracking-normal md:text-[68px]">
              FlowMindStudio
            </h1>
            <p className="animate-fade-up animate-delay-200 max-w-2xl text-lg leading-[1.45] text-[#cbd5e1]">
              AI 工作台 + RAG 知识库 + MCP 工具调用 +
              低代码管理页搭建能力，帮助企业团队把对话、知识、工具和业务页面组织成可审计的生产级工作流。
            </p>
            <div className="animate-fade-up animate-delay-300 flex flex-wrap gap-3">
              <Link
                to="/app/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-bold text-[#111827] transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
              >
                进入工作台
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/app/chat"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-[#334155] px-5 text-sm font-semibold text-white transition-all duration-200 hover:border-[#64748b] hover:bg-[#1e293b]"
              >
                体验 AI 对话
              </Link>
            </div>
            <div className="animate-fade-up animate-delay-400 grid max-w-2xl gap-4 pt-3 text-sm text-[#cbd5e1] sm:grid-cols-3">
              <span>多租户 RBAC</span>
              <span>OpenAI-compatible</span>
              <span>SSE 实时事件</span>
            </div>
          </div>

          <div className="animate-fade-up animate-delay-200 overflow-hidden rounded-lg border border-[#b9c4cf] bg-white text-[#111827] shadow-[0_18px_34px_-18px_rgba(0,0,0,0.55)] transition-shadow duration-300 hover:shadow-[0_24px_40px_-18px_rgba(0,0,0,0.65)]">
            <div className="flex h-[54px] items-center justify-between border-b border-[#d9e1e8] px-5">
              <span className="font-semibold">FlowMind Runtime</span>
              <span className="rounded-md bg-[#e8f4f2] px-2 py-1 text-xs font-bold text-[#0f766e]">
                Stable
              </span>
            </div>
            <div className="grid h-[306px] grid-cols-[170px_1fr]">
              <div className="border-r border-[#d9e1e8] bg-[#f6f8fa] p-4 text-sm">
                {["AI 对话", "知识库", "MCP", "低代码"].map((item, index) => (
                  <div
                    key={item}
                    className={`mb-2 rounded-md px-3 py-2 ${index === 0 ? "bg-[#e8f4f2] font-bold text-[#0f766e]" : "text-[#5b6472]"}`}
                  >
                    {item}
                  </div>
                ))}
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-lg border border-[#d9e1e8] p-4">
                  <div className="text-xs font-bold text-[#2563eb]">RAG</div>
                  <div className="mt-2 font-semibold">已检索 8 个知识片段</div>
                  <div className="mt-1 text-sm text-[#5b6472]">
                    产品文档、售后政策、客户档案
                  </div>
                </div>
                <div className="rounded-lg border border-[#d9e1e8] p-4">
                  <div className="text-xs font-bold text-[#b7791f]">MCP</div>
                  <div className="mt-2 font-semibold">
                    update_customer_stage 待确认
                  </div>
                  <div className="mt-1 text-sm text-[#5b6472]">
                    高风险工具调用将先进入审批。
                  </div>
                </div>
                <div className="rounded-lg bg-[#111827] p-4 text-white">
                  <div className="text-xs text-[#cbd5e1]">Low-code</div>
                  <div className="mt-2 font-semibold">
                    客户管理页 v1.4 准备发布
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="bg-white">
        <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-24">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-sm font-bold text-[#0f766e]">核心能力</div>
              <h2 className="mt-3 text-4xl font-bold">
                统一入口、统一权限、统一审计
              </h2>
            </div>
            <p className="text-sm font-medium text-[#5b6472]">
              把 AI 能力放进可治理的业务工作台，而不是孤立的聊天窗口。
            </p>
          </div>
          <div className="mt-8 grid overflow-hidden border border-[#b9c4cf] md:grid-cols-4">
            {capabilities.map((item, index) => (
              <div
                key={item.title}
                className={`min-h-[152px] p-5 transition-all duration-200 hover:bg-[#f8fafb] ${index < capabilities.length - 1 ? "border-b border-[#d9e1e8] md:border-b-0 md:border-r" : ""}`}
              >
                <div className="font-mono text-xs font-bold text-[#0f766e]">
                  {item.k}
                </div>
                <div className="mt-4 text-lg font-bold">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-[#5b6472]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="bg-[#f6f8fa]">
        <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-16">
          <div className="text-center">
            <div className="text-sm font-bold text-[#0f766e]">工作流</div>
            <h2 className="mt-3 text-4xl font-bold">从知识输入到可审计执行</h2>
          </div>
          <div className="mt-8 grid border border-[#b9c4cf] bg-white md:grid-cols-3">
            {steps.map(([num, title, text], index) => (
              <div
                key={num}
                className={`p-5 ${index < steps.length - 1 ? "border-b border-[#d9e1e8] md:border-b-0 md:border-r" : ""}`}
              >
                <div className="font-mono text-sm font-bold text-[#0f766e]">
                  {num}
                </div>
                <h3 className="mt-3 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5b6472]">{text}</p>
              </div>
            ))}
          </div>
          <div
            id="governance"
            className="mt-7 flex items-center gap-6 border border-[#d9e1e8] bg-white p-6"
          >
            <ShieldCheck className="shrink-0 text-[#0f766e]" size={24} />
            <div className="flex-1">
              <div className="font-bold">治理能力默认开启</div>
              <p className="mt-1 text-sm text-[#5b6472]">
                高风险 MCP
                调用确认、组织隔离、权限枚举和审计回放在第一版就进入主流程。
              </p>
            </div>
            <span className="hidden rounded-md bg-[#eef2f5] px-3 py-2 text-sm font-semibold text-[#111827] md:inline-flex">
              Production-ready MVP
            </span>
          </div>
        </div>
      </section>

      <section className="bg-[#0f766e]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-12 text-white md:flex-row md:items-center md:justify-between lg:px-24">
          <div>
            <h2 className="text-2xl font-semibold">
              准备把流思智能工作台接入你的业务系统？
            </h2>
            <p className="mt-2 text-sm text-[#dff5f1]">
              从私有知识到工具执行，一套工作台完成团队级智能协作落地。
            </p>
          </div>
          <Link
            to="/app/dashboard"
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#111827] transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
          >
            进入工作台
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
