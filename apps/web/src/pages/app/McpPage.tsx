import { AlertTriangle, CheckCircle2, Plug, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { McpInvocation } from "@flowmind/shared";
import { Badge, Button, Card } from "@flowmind/ui";
import { apiGet, apiPost, fallbackInvocations, fallbackMcpServers } from "../../api";
import { PageShell, PageTitle } from "../../components/app/PageShell";
import { RiskBadge } from "../../components/app/StatusBadge";
import { StatCard } from "../../components/app/StatCard";

export function McpPage() {
  const [invocations, setInvocations] = useState<McpInvocation[]>(fallbackInvocations);
  const [servers, setServers] = useState(fallbackMcpServers);

  useEffect(() => {
    void apiGet("/mcp/servers", fallbackMcpServers).then(setServers);
    void apiGet("/mcp/invocations", fallbackInvocations).then(setInvocations);
  }, []);

  async function confirm(id: string) {
    const updated = await apiPost<McpInvocation>(`/mcp/invocations/${id}/confirm`, {}, invocations.find((item) => item.id === id)!);
    setInvocations((current) => current.map((item) => (item.id === id ? updated : item)));
  }

  return (
    <PageShell>
      <PageTitle
        description="统一管理企业 MCP 服务、工具风险等级与智能体调用审批。"
        action={
          <Button className="h-10 bg-[#1e293b]">
            <Plug size={16} />
            连接服务
          </Button>
        }
      >
        MCP 控制台
      </PageTitle>

      <McpStats pendingCount={invocations.filter((item) => item.status === "pending_confirmation").length} />

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_390px]">
        <div className="space-y-3.5">
          <McpFilters />
          <div className="grid gap-4">
            {servers.map((server) => <McpServerCard key={server.id} server={server} />)}
          </div>
        </div>

        <InvocationApprovalPanel invocations={invocations} onConfirm={(id) => void confirm(id)} />
      </section>
    </PageShell>
  );
}

function McpStats({ pendingCount }: { pendingCount: number }) {
  return (
    <section className="mt-7 grid gap-3.5 md:grid-cols-3">
      <StatCard label="在线服务" value="8 / 9" detail="1 个授权即将过期" tone="orange" />
      <StatCard label="工具权限" value="47" detail="低 31 · 中 11 · 高 5" tone="green" />
      <StatCard label="待确认调用" value={String(pendingCount)} detail="高风险 2 个待审批" tone="red" />
    </section>
  );
}

function McpFilters() {
  return (
    <div className="flex h-[52px] items-center gap-3">
      <Button variant="secondary">全部服务</Button>
      <Button variant="secondary">风险等级</Button>
      <Button variant="secondary">仅待确认</Button>
    </div>
  );
}

function McpServerCard({ server }: { server: (typeof fallbackMcpServers)[number] }) {
  return (
    <Card className="rounded-lg p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{server.name}</h2>
            <Badge className="border-0 bg-[#e8f4f2] text-[#0f766e]">在线</Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-[#5b6472]">{server.transport.toUpperCase()} · {server.endpoint}</p>
        </div>
        <ShieldCheck className="text-[#0f766e]" size={22} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {server.tools.map((tool) => (
          <div key={tool.id} className="rounded-lg border border-[#d9e1e8] bg-[#f8fafb] p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold">{tool.name}</span>
              <RiskBadge risk={tool.risk} />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#5b6472]">{tool.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InvocationApprovalPanel({ invocations, onConfirm }: { invocations: McpInvocation[]; onConfirm: (id: string) => void }) {
  return (
    <aside>
      <Card className="rounded-lg p-5">
        <h2 className="text-xl font-bold">右侧调用确认</h2>
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#991b1b]">
            <AlertTriangle size={16} />
            高风险工具等待确认
          </div>
          <p className="mt-2 text-xs leading-5 text-[#7f1d1d]">update_customer_stage 将改变客户销售阶段，需要审批后执行。</p>
        </div>
        <div className="mt-4 space-y-3">
          {invocations.map((invocation) => (
            <InvocationCard key={invocation.id} invocation={invocation} onConfirm={onConfirm} />
          ))}
        </div>
        <p className="mt-5 text-xs leading-5 text-[#5b6472]">策略：高风险工具必须由工具审批员确认；中风险进入草稿队列；低风险只记录审计日志。</p>
      </Card>
    </aside>
  );
}

function InvocationCard({ invocation, onConfirm }: { invocation: McpInvocation; onConfirm: (id: string) => void }) {
  return (
    <div className="rounded-lg border border-[#d9e1e8] p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold">{invocation.toolId}</span>
        <Badge>{invocation.status}</Badge>
      </div>
      <pre className="mt-3 overflow-auto custom-scrollbar-container rounded-md bg-[#0f172a] p-3 text-xs text-[#dbeafe]">{invocation.inputPreview}</pre>
      {invocation.status === "pending_confirmation" ? (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => onConfirm(invocation.id)} className="h-9 flex-1 bg-[#0f766e]">
            <CheckCircle2 size={15} />
            确认
          </Button>
          <Button variant="secondary" className="h-9 flex-1">拒绝</Button>
        </div>
      ) : null}
    </div>
  );
}
