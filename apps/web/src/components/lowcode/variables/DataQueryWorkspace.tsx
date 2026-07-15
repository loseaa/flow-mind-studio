import { useEffect, useState, type ReactNode } from "react";
import type { DataQuery, DataQueryResult, DataSource } from "@flowmind/shared";
import { Badge, Button, Card, Input } from "@flowmind/ui";
import { Play, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPostStrict } from "../../../api";

export function DataQueryWorkspace({ pageId }: { pageId: string }) {
  const [queries, setQueries] = useState<DataQuery[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ queryId: string; result: DataQueryResult } | null>(null);
  const [draft, setDraft] = useState({ key: "", name: "", dataSourceId: "", statement: "SELECT * FROM public.example", trigger: "manual" as DataQuery["trigger"] });

  useEffect(() => {
    void Promise.all([
      apiGet<DataQuery[]>(`/data-queries?pageId=${encodeURIComponent(pageId)}`, []).then(setQueries),
      apiGet<DataSource[]>("/data-sources", []).then((items) => { setSources(items); setDraft((current) => ({ ...current, dataSourceId: current.dataSourceId || items[0]?.id || "" })); })
    ]);
  }, [pageId]);

  async function createQuery() {
    setBusyId("new"); setError("");
    try {
      const query = await apiPostStrict<DataQuery>("/data-queries", { ...draft, pageId, parameters: [], timeoutMs: 5000, maxRows: 100, enabled: true });
      setQueries((current) => [...current, query]);
      setCreating(false);
      setDraft((current) => ({ ...current, key: "", name: "", statement: "SELECT * FROM public.example" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建查询失败"); }
    finally { setBusyId(""); }
  }

  async function runQuery(query: DataQuery) {
    setBusyId(query.id); setError("");
    try { setPreview({ queryId: query.id, result: await apiPostStrict<DataQueryResult>(`/data-queries/${query.id}/preview`, { parameters: {} }) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "查询执行失败"); }
    finally { setBusyId(""); }
  }

  async function removeQuery(query: DataQuery) {
    setBusyId(query.id); setError("");
    try { await apiDelete(`/data-queries/${query.id}`); setQueries((current) => current.filter((item) => item.id !== query.id)); if (preview?.queryId === query.id) setPreview(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "删除查询失败"); }
    finally { setBusyId(""); }
  }

  return <div className="p-4">
    <div className="flex items-center justify-between"><div><div className="text-sm font-bold text-[#101828]">查询变量</div><div className="mt-1 text-xs text-[#8a94a3]">选择已连接数据库，用 SQL 提取数据为 query.&lt;key&gt;.data</div></div><Button className="h-9" disabled={!sources.length} onClick={() => setCreating((value) => !value)}><Plus size={15} />新建查询变量</Button></div>
    {!sources.length ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">请先到“数据中心”创建并测试 PostgreSQL 数据源。</div> : null}
    {error ? <div role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
    {creating ? <Card className="mt-4 space-y-3 p-4"><div className="grid grid-cols-2 gap-3"><Field label="查询名称"><Input className="w-full" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="Query Key"><Input className="w-full font-mono" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} placeholder="customers" /></Field></div><Field label="数据源"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={draft.dataSourceId} onChange={(event) => setDraft({ ...draft, dataSourceId: event.target.value })}>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></Field><Field label="只读 SQL"><textarea className="min-h-32 w-full rounded-md border border-slate-200 p-3 font-mono text-xs outline-none focus:border-slate-400" value={draft.statement} onChange={(event) => setDraft({ ...draft, statement: event.target.value })} /></Field><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={draft.trigger === "pageLoad"} onChange={(event) => setDraft({ ...draft, trigger: event.target.checked ? "pageLoad" : "manual" })} />页面加载时自动执行</label><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(false)}>取消</Button><Button disabled={busyId === "new" || !draft.name || !draft.key || !draft.dataSourceId || !draft.statement} onClick={() => void createQuery()}>保存查询</Button></div></Card> : null}
    <div className="mt-4 space-y-3">{queries.map((query) => <Card key={query.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-900">{query.name}</div><code className="text-xs text-teal-700">query.{query.key}.data</code></div><div className="flex items-center gap-2"><Badge>{query.trigger === "pageLoad" ? "页面加载" : "手动"}</Badge><Button className="h-8 px-3 text-xs" variant="secondary" disabled={busyId === query.id} onClick={() => void runQuery(query)}><Play size={13} />预览</Button><Button aria-label="删除查询" className="h-8 px-2" variant="ghost" disabled={busyId === query.id} onClick={() => void removeQuery(query)}><Trash2 size={14} /></Button></div></div><pre className="mt-3 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{query.statement}</pre>{preview?.queryId === query.id ? <ResultPreview result={preview.result} /> : null}</Card>)}</div>
    {!queries.length && !creating ? <div className="grid min-h-56 place-items-center text-sm text-slate-500">当前页面还没有数据查询</div> : null}
  </div>;
}

function ResultPreview({ result }: { result: DataQueryResult }) { const columns = Object.keys(result.rows[0] ?? {}); return <div className="mt-3 overflow-auto rounded border border-slate-200"><div className="bg-slate-50 px-3 py-2 text-xs text-slate-500">{result.rowCount} 行 · {result.durationMs}ms{result.truncated ? " · 已截断" : ""}</div>{columns.length ? <table className="min-w-full text-left text-xs"><thead><tr>{columns.map((column) => <th key={column} className="border-t border-slate-200 px-3 py-2">{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 10).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} className="border-t border-slate-100 px-3 py-2">{renderValue(row[column])}</td>)}</tr>)}</tbody></table> : null}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1.5 text-xs font-medium text-slate-600"><span>{label}</span>{children}</label>; }
function renderValue(value: unknown) { return value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value ?? ""); }
