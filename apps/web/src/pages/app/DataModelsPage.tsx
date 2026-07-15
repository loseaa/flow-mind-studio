import { useEffect, useState, type ReactNode } from "react";
import type { DatabaseTable, DataSource } from "@flowmind/shared";
import { Badge, Button, Card, Input } from "@flowmind/ui";
import { Database, DatabaseZap, PlugZap, RefreshCw } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { apiGet, apiPostStrict } from "../../api";

type FormMode = "connect" | "provision";
type SourceDraft = {
  name: string;
  host: string;
  port: string;
  database: string;
  maintenanceDatabase: string;
  username: string;
  password: string;
  sslMode: DataSource["sslMode"];
};
const emptyDraft: SourceDraft = { name: "", host: "", port: "5432", database: "", maintenanceDatabase: "postgres", username: "", password: "", sslMode: "require" };

export function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [draft, setDraft] = useState<SourceDraft>(emptyDraft);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [busyId, setBusyId] = useState("");
  const [schema, setSchema] = useState<{ sourceId: string; tables: DatabaseTable[] } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { void apiGet<DataSource[]>("/data-sources", []).then(setSources); }, []);

  async function submitSource() {
    if (!formMode) return;
    setMessage(""); setBusyId("new");
    try {
      const source = await apiPostStrict<DataSource>(formMode === "provision" ? "/data-sources/databases" : "/data-sources", {
        ...draft,
        port: Number(draft.port),
        type: "postgresql"
      });
      setSources((current) => [source, ...current]);
      setDraft(emptyDraft);
      setFormMode(null);
      setMessage(formMode === "provision" ? `数据库 ${source.database} 已创建，并已配置专用查询账号 ${source.username}。管理员凭据未保存。` : "数据库连接已保存，建议立即测试连接。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : formMode === "provision" ? "新建数据库失败" : "保存连接失败");
    } finally { setBusyId(""); }
  }

  async function testSource(source: DataSource) {
    setBusyId(source.id); setMessage("");
    try {
      const result = await apiPostStrict<{ ok: boolean; latencyMs: number }>(`/data-sources/${source.id}/test`);
      setSources(await apiGet<DataSource[]>("/data-sources", sources));
      setMessage(`连接成功，耗时 ${result.latencyMs}ms。`);
    } catch (error) {
      setSources(await apiGet<DataSource[]>("/data-sources", sources));
      setMessage(error instanceof Error ? error.message : "连接测试失败");
    } finally { setBusyId(""); }
  }

  async function inspectSource(source: DataSource) {
    setBusyId(source.id); setMessage("");
    try {
      const result = await apiPostStrict<{ tables: DatabaseTable[] }>(`/data-sources/${source.id}/introspect`);
      setSchema({ sourceId: source.id, tables: result.tables });
      setMessage(`已发现 ${result.tables.length} 张表或视图。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "读取数据库结构失败"); }
    finally { setBusyId(""); }
  }

  function openForm(mode: FormMode) {
    setDraft(emptyDraft);
    setFormMode(mode);
    setMessage("");
  }

  return <div className="space-y-6">
    <PageHeader title="数据源" text="统一管理数据库连接。页面变量和 SQL 查询变量在各自低码页面中配置。" />
    <div className="grid gap-4 md:grid-cols-2">
      <ActionCard icon={<PlugZap size={21} />} title="连接已有数据库" description="保存一个现有 PostgreSQL 数据库连接，用于页面 SQL 查询。" action="连接数据库" onClick={() => openForm("connect")} />
      <ActionCard icon={<DatabaseZap size={21} />} title="新建数据库" description="使用具备 CREATEDB 权限的账号创建 PostgreSQL 数据库，并自动保存连接。" action="新建数据库" onClick={() => openForm("provision")} />
    </div>
    {message ? <div role="status" className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div> : null}
    {formMode ? <SourceForm mode={formMode} draft={draft} busy={busyId === "new"} onChange={setDraft} onCancel={() => setFormMode(null)} onSubmit={submitSource} /> : null}
    <div>
      <div className="mb-3 flex items-center gap-2"><Database size={17} /><h2 className="font-semibold text-slate-950">已连接数据库</h2><Badge>{sources.length}</Badge></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {sources.map((source) => <Card key={source.id} className="p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">{source.name}</h3><div className="mt-1 font-mono text-xs text-slate-500">{source.username}@{source.host}:{source.port}/{source.database}</div></div><StatusBadge status={source.status} /></div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500"><Badge>PostgreSQL</Badge><Badge>TLS: {source.sslMode}</Badge><Badge>{source.hasCredentials ? "凭据已加密" : "无密码"}</Badge></div>
          {source.lastErrorMessage ? <div className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{source.lastErrorMessage}</div> : null}
          <div className="mt-4 flex gap-2"><Button variant="secondary" disabled={busyId === source.id} onClick={() => void testSource(source)}><PlugZap size={15} />测试连接</Button><Button variant="secondary" disabled={busyId === source.id} onClick={() => void inspectSource(source)}><RefreshCw size={15} />读取结构</Button></div>
          {schema?.sourceId === source.id ? <SchemaPreview tables={schema.tables} /> : null}
        </Card>)}
      </div>
      {!sources.length && !formMode ? <Card className="grid min-h-56 place-items-center p-8 text-center text-sm text-slate-500">还没有数据库连接。连接完成后，可在页面变量中创建 SQL 查询变量。</Card> : null}
    </div>
  </div>;
}

export const DataModelsPage = DataSourcesPage;

function SourceForm({ mode, draft, busy, onChange, onCancel, onSubmit }: { mode: FormMode; draft: SourceDraft; busy: boolean; onChange: (draft: SourceDraft) => void; onCancel: () => void; onSubmit: () => void }) {
  const update = (key: keyof SourceDraft, value: string) => onChange({ ...draft, [key]: value });
  const valid = draft.name.trim() && draft.host.trim() && draft.database.trim() && draft.username.trim() && Number(draft.port) > 0 && (mode === "connect" || Boolean(draft.password));
  return <Card className="p-5"><div className="mb-1 font-semibold">{mode === "provision" ? "新建 PostgreSQL 数据库" : "连接已有 PostgreSQL 数据库"}</div><div className="mb-4 text-xs text-slate-500">{mode === "provision" ? "管理员凭据仅用于执行 CREATE ROLE / CREATE DATABASE，不会保存；平台将自动生成专用查询账号。" : "平台不会在浏览器中直接连接数据库，凭据由 API 加密保存。"}</div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
    <Field label="连接名称"><Input className="w-full" value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="生产报表库" /></Field>
    <Field label="主机"><Input className="w-full" value={draft.host} onChange={(event) => update("host", event.target.value)} placeholder="db.example.com" /></Field>
    <Field label="端口"><Input className="w-full" type="number" value={draft.port} onChange={(event) => update("port", event.target.value)} /></Field>
    {mode === "provision" ? <Field label="维护数据库"><Input className="w-full" value={draft.maintenanceDatabase} onChange={(event) => update("maintenanceDatabase", event.target.value)} placeholder="postgres" /></Field> : null}
    <Field label={mode === "provision" ? "新数据库名" : "数据库名"}><Input className="w-full" value={draft.database} onChange={(event) => update("database", event.target.value)} placeholder={mode === "provision" ? "customer_app" : "analytics"} /></Field>
    <Field label={mode === "provision" ? "管理员用户名" : "用户名"}><Input className="w-full" value={draft.username} onChange={(event) => update("username", event.target.value)} /></Field>
    <Field label={mode === "provision" ? "管理员密码" : "密码"}><Input className="w-full" type="password" value={draft.password} onChange={(event) => update("password", event.target.value)} /></Field>
    <Field label="TLS"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={draft.sslMode} onChange={(event) => update("sslMode", event.target.value)}><option value="disable">关闭（仅开发）</option><option value="require">启用</option><option value="verify-full">验证证书和主机</option></select></Field>
  </div><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>取消</Button><Button disabled={!valid || busy} onClick={onSubmit}>{busy ? "处理中…" : mode === "provision" ? "创建并连接" : "保存连接"}</Button></div></Card>;
}

function ActionCard({ icon, title, description, action, onClick }: { icon: ReactNode; title: string; description: string; action: string; onClick: () => void }) { return <Card className="flex items-center gap-4 p-5"><div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-700">{icon}</div><div className="min-w-0 flex-1"><div className="font-semibold text-slate-950">{title}</div><div className="mt-1 text-xs text-slate-500">{description}</div></div><Button variant="secondary" onClick={onClick}>{action}</Button></Card>; }
function SchemaPreview({ tables }: { tables: DatabaseTable[] }) { return <div className="mt-4 max-h-60 overflow-auto rounded-md border border-slate-200"><div className="sticky top-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">数据库结构</div>{tables.map((table) => <div key={`${table.schema}.${table.name}`} className="border-t border-slate-100 px-3 py-2"><div className="font-mono text-xs font-semibold">{table.schema}.{table.name}</div><div className="mt-1 truncate text-xs text-slate-500">{table.columns.map((column) => `${column.name}: ${column.dataType}`).join(" · ")}</div></div>)}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="space-y-1.5 text-xs font-medium text-slate-600"><span>{label}</span>{children}</label>; }
function StatusBadge({ status }: { status: DataSource["status"] }) { return <Badge className={status === "online" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "error" ? "border-red-200 bg-red-50 text-red-700" : ""}>{status === "online" ? "在线" : status === "error" ? "异常" : "未测试"}</Badge>; }
