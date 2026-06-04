import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquareText,
  Radio,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card } from "@flowmind/ui";
import { apiGet, fallbackDashboard } from "../../api";
import { PageShell, PageTitle } from "../../components/app/PageShell";
import { StatCard } from "../../components/app/StatCard";

const modules = [
  {
    title: "AI 对话",
    text: "知识增强问答与工具执行",
    status: "12 个会话进行中",
    path: "/app/chat",
    icon: MessageSquareText,
    color: "#0f766e",
  },
  {
    title: "知识库",
    text: "上传、解析、索引",
    status: "3 个文档解析中",
    path: "/app/knowledge",
    icon: FileText,
    color: "#2563eb",
  },
  {
    title: "MCP",
    text: "连接内部工具网络",
    status: "2 个调用待确认",
    path: "/app/mcp",
    icon: Radio,
    color: "#b7791f",
  },
  {
    title: "低代码",
    text: "发布业务管理页面",
    status: "1 个页面待发布",
    path: "/app/lowcode",
    icon: Sparkles,
    color: "#5b6472",
  },
];

const capabilityCards = [
  ["RAG", "知识检索", "引用、权限、向量索引", "#2563eb"],
  ["Agent", "任务编排", "节点执行、重试、审计", "#0f766e"],
  ["MCP", "工具调用", "风险分级、人工确认", "#b7791f"],
  ["Low-code", "业务落地", "管理页、数据模型、发布", "#5b6472"],
];

export function DashboardPage() {
  const [data, setData] = useState(fallbackDashboard);

  useEffect(() => {
    void apiGet("/dashboard", fallbackDashboard).then(setData);
  }, []);

  return (
    <PageShell>
      <PageTitle
        description="统一查看 RAG、Agent、MCP 与低代码应用的运行状态，快速定位需要处理的工作。"
        action={
          <div className="flex gap-3">
            <span className="inline-flex h-9 items-center rounded-md border border-[#d9e1e8] bg-white px-4 font-mono text-xs text-[#5b6472]">
              09:42 更新
            </span>
            <Button
              asChild
              className="h-9 rounded-md bg-[#1e293b] px-5 text-[13px]"
            >
              <Link to="/app/chat">新建任务</Link>
            </Button>
          </div>
        }
      >
        总览
      </PageTitle>

      <DashboardHero />
      <DashboardMetrics metrics={data.metrics} />

      <section className="mt-7 grid gap-7 xl:grid-cols-[490px_1fr]">
        <ModuleEntrypoints />
        <RecentTasks tasks={data.recentTasks} />
      </section>

      <div className="mt-8 flex justify-end">
        <Button asChild variant="secondary">
          <Link to="/app/knowledge">
            <Upload size={16} />
            上传文档
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}

function DashboardHero() {
  return (
    <section className="mt-10 animate-fade-up rounded-lg border border-[#d9e1e8] bg-white p-6 shadow-[0_4px_18px_rgba(30,41,59,0.07)] transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(30,41,59,0.10)]">
      <div className="grid gap-8 xl:grid-cols-[360px_1fr]">
        <div>
          <Badge className="border-0 bg-[#e8f4f2] px-3 py-1.5 font-bold text-[#0f766e]">
            平台状态：稳定
          </Badge>
          <h2 className="mt-4 max-w-sm text-2xl font-bold">
            从知识到行动的 AI 业务闭环
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[#5b6472]">
            文档完成解析、向量化与权限绑定后，Agent 在对话中检索引用，并通过 MCP
            工具执行可审计操作。
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          {capabilityCards.map(([k, title, text, color]) => (
            <div
              key={k}
              className="rounded-lg border border-[#d9e1e8] bg-[#eef2f5] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="font-mono text-xs font-bold" style={{ color }}>
                {k}
              </div>
              <div className="mt-4 text-[17px] font-bold">{title}</div>
              <div className="mt-3 text-xs text-[#5b6472]">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardMetrics({
  metrics,
}: {
  metrics: typeof fallbackDashboard.metrics;
}) {
  return (
    <section className="mt-5 grid gap-5 md:grid-cols-4">
      {metrics.map((metric, index) => (
        <StatCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          detail={metric.delta}
          tone={index === 1 ? "orange" : "green"}
        />
      ))}
    </section>
  );
}

function ModuleEntrypoints() {
  return (
    <div>
      <h2 className="text-lg font-bold">核心模块入口</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              to={item.path}
              className="group rounded-lg border border-[#d9e1e8] bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <Icon size={18} style={{ color: item.color }} />
                <ArrowUpRight
                  size={16}
                  className="text-[#8a94a3] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </div>
              <div className="mt-4 text-[15px] font-bold">{item.title}</div>
              <div className="mt-3 text-xs text-[#5b6472]">{item.text}</div>
              <div
                className="mt-4 font-mono text-xs"
                style={{ color: item.color }}
              >
                {item.status}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RecentTasks({
  tasks,
}: {
  tasks: typeof fallbackDashboard.recentTasks;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold">最近任务</h2>
      <Card className="mt-4 overflow-hidden rounded-lg">
        <div className="grid grid-cols-[1fr_120px_120px] border-b border-[#d9e1e8] px-5 py-3 text-xs font-bold text-[#5b6472]">
          <span>任务</span>
          <span>类型</span>
          <span>状态</span>
        </div>
        {tasks.map((task, index) => (
          <RecentTaskRow key={task.id} task={task} index={index} />
        ))}
      </Card>
    </div>
  );
}

function RecentTaskRow({
  index,
  task,
}: {
  index: number;
  task: (typeof fallbackDashboard.recentTasks)[number];
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px] items-center border-b border-[#eef2f5] px-5 py-4 last:border-0">
      <div>
        <div className="text-sm font-semibold">{task.name}</div>
        <div className="mt-1 text-xs text-[#5b6472]">
          {index === 0
            ? "引用 8 个知识片段，调用 CRM 查询工具"
            : index === 1
              ? "解析 124 个文档，正在写入向量库"
              : "绑定客户数据模型与审批权限"}
        </div>
      </div>
      <span className="text-xs text-[#5b6472]">
        {index === 0 ? "Agent" : index === 1 ? "RAG" : "Low-code"}
      </span>
      <span className="inline-flex w-fit items-center gap-1 rounded-md bg-[#eef2f5] px-2 py-1 text-xs font-semibold text-[#111827]">
        {index === 0 ? (
          <CheckCircle2 size={13} className="text-[#15803d]" />
        ) : (
          <Clock3 size={13} className="text-[#b7791f]" />
        )}
        {index === 0 ? "完成" : index === 1 ? "运行中" : "草稿"}
      </span>
    </div>
  );
}
