import { AlertCircle, BarChart3, CheckCircle2, FileSearch, FileText, Play, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DocumentIndexJob, EvaluationDataset, EvaluationRun, KnowledgeBase, KnowledgeChunk, KnowledgeDocument, RagMetrics } from "@flowmind/shared";
import { Button, Card, Input } from "@flowmind/ui";
import { apiCreate, apiDelete, apiGet, apiUpload, emptyRagMetrics, fallbackKnowledgeBases, streamJob } from "../../api";
import { PageShell, PageTitle } from "../../components/app/PageShell";
import { StatCard, type StatTone } from "../../components/app/StatCard";
import { DocumentStatusBadge } from "../../components/app/StatusBadge";

export function KnowledgePage() {
  const [bases, setBases] = useState<KnowledgeBase[]>(fallbackKnowledgeBases);
  const [selectedBaseId, setSelectedBaseId] = useState("kb_1");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [metrics, setMetrics] = useState<RagMetrics>(emptyRagMetrics);
  const [jobs, setJobs] = useState<DocumentIndexJob[]>([]);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [latestRun, setLatestRun] = useState<EvaluationRun | null>(null);
  const [baseName, setBaseName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const evaluationRef = useRef<HTMLInputElement>(null);
  const subscriptions = useRef<Array<() => void>>([]);
  const selectedBaseRef = useRef(selectedBaseId);

  useEffect(() => {
    void loadOverview();
    return () => subscriptions.current.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    selectedBaseRef.current = selectedBaseId;
    void loadDocuments(selectedBaseId);
    setChunks([]);
  }, [selectedBaseId]);

  async function loadOverview() {
    const [nextBases, nextMetrics, nextDatasets, nextRuns] = await Promise.all([
      apiGet("/knowledge/bases", fallbackKnowledgeBases),
      apiGet("/rag/metrics", emptyRagMetrics),
      apiGet<EvaluationDataset[]>("/rag/evaluation-datasets", []),
      apiGet<EvaluationRun[]>("/rag/evaluation-runs", [])
    ]);
    const latestCompleted = nextRuns.find((run) => run.status === "completed") ?? nextRuns[0] ?? null;
    const nextLatestRun = latestCompleted
      ? await apiGet<EvaluationRun>(`/rag/evaluation-runs/${latestCompleted.id}`, latestCompleted)
      : null;
    setBases(nextBases);
    setMetrics(nextMetrics);
    setDatasets(nextDatasets);
    setRuns(nextRuns);
    setLatestRun(nextLatestRun);
    setSelectedBaseId((current) => nextBases.some((base) => base.id === current) ? current : nextBases[0]?.id ?? "kb_1");
  }

  async function loadDocuments(knowledgeBaseId: string) {
    setDocuments(await apiGet<KnowledgeDocument[]>(`/knowledge/bases/${knowledgeBaseId}/documents`, []));
  }

  async function createBase() {
    const name = baseName.trim();
    if (!name) return;
    const created = await apiCreate<KnowledgeBase>("/knowledge/bases", { name });
    setBases((current) => [created, ...current]);
    setSelectedBaseId(created.id);
    setBaseName("");
  }

  async function uploadDocument(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const response = await apiUpload<{ document: KnowledgeDocument; job: DocumentIndexJob }>(`/knowledge/bases/${selectedBaseId}/documents`, file);
      setDocuments((current) => [response.document, ...current]);
      watchJob(response.job, selectedBaseId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传文档失败。");
    }
  }

  async function reindex(document: KnowledgeDocument) {
    const job = await apiCreate<DocumentIndexJob>(`/knowledge/documents/${document.id}/reindex`);
    watchJob(job, document.knowledgeBaseId);
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "parsing", errorMessage: null } : item));
  }

  async function deleteDocument(documentId: string) {
    await apiDelete(`/knowledge/documents/${documentId}`);
    setDocuments((current) => current.filter((document) => document.id !== documentId));
    void loadOverview();
  }

  function watchJob(job: DocumentIndexJob, documentBaseId?: string) {
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 6));
    subscriptions.current.push(
      streamJob(job.id, (update) => {
        setJobs((current) => [update, ...current.filter((item) => item.id !== update.id)].slice(0, 6));
        if (update.status === "completed" || update.status === "failed") {
          if (documentBaseId && selectedBaseRef.current === documentBaseId) void loadDocuments(documentBaseId);
          void loadOverview();
        }
      })
    );
  }

  async function viewChunks(documentId: string) {
    setChunks(await apiGet<KnowledgeChunk[]>(`/knowledge/documents/${documentId}/chunks`, []));
  }

  async function importDataset(file: File | undefined) {
    if (!file) return;
    try {
      const dataset = await apiUpload<EvaluationDataset>("/rag/evaluation-datasets/import", file, { name: file.name });
      setDatasets((current) => [dataset, ...current]);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入评测集失败。");
    }
  }

  async function createGoldenDatasets() {
    try {
      const created = await apiCreate<EvaluationDataset[]>("/rag/evaluation-datasets/golden");
      setDatasets((current) => mergeDatasets(created, current));
      void loadOverview();
    } catch (goldenError) {
      setError(goldenError instanceof Error ? goldenError.message : "生成黄金测试集失败。");
    }
  }

  async function runDataset(datasetId: string) {
    const result = await apiCreate<{ job: DocumentIndexJob }>(`/rag/evaluation-datasets/${datasetId}/runs`);
    watchJob(result.job);
  }

  return (
    <PageShell>
      <PageTitle
        description="管理知识库文档、后台索引任务和 RAG 基准评测，聊天回答会引用已命中的片段。"
        action={
          <Button onClick={() => uploadRef.current?.click()} className="h-10 bg-[#1e293b]">
            <Upload size={16} />上传文档
          </Button>
        }
      >
        知识库
      </PageTitle>
      <input ref={uploadRef} hidden type="file" accept=".pdf,.md,.txt" onChange={(event) => void uploadDocument(event.target.files?.[0])} />
      <input ref={evaluationRef} hidden type="file" accept=".json,.csv" onChange={(event) => void importDataset(event.target.files?.[0])} />
      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <section className="mt-7 grid gap-3.5 md:grid-cols-4">
        {metricCards(metrics).map((item) => <StatCard key={item.label} {...item} />)}
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_350px]">
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 rounded-lg p-4">
            <select
              value={selectedBaseId}
              onChange={(event) => setSelectedBaseId(event.target.value)}
              className="h-10 min-w-[180px] rounded-lg border border-[#d9e1e8] bg-white px-3 text-sm"
            >
              {bases.map((base) => <option key={base.id} value={base.id}>{base.name} ({base.documentCount})</option>)}
            </select>
            <Input value={baseName} onChange={(event) => setBaseName(event.target.value)} className="max-w-[220px]" placeholder="新知识库名称" />
            <Button variant="secondary" onClick={() => void createBase()}><Plus size={15} />新建</Button>
          </Card>
          <DocumentTable documents={documents} onChunks={viewChunks} onReindex={reindex} onDelete={deleteDocument} />
          {chunks.length > 0 ? <ChunkPreview chunks={chunks} /> : null}
        </div>
        <aside className="space-y-4">
          <TaskQueue jobs={jobs} />
          <EvaluationPanel
            datasets={datasets}
            runs={runs}
            latestRun={latestRun}
            metrics={metrics}
            onImport={() => evaluationRef.current?.click()}
            onCreateGolden={() => void createGoldenDatasets()}
            onRun={runDataset}
          />
        </aside>
      </section>
    </PageShell>
  );
}

function metricCards(metrics: RagMetrics): Array<{ label: string; value: string; detail: string; tone: StatTone }> {
  return [
    { label: "已索引文档", value: String(metrics.indexedDocuments), detail: `成功率 ${percent(metrics.indexSuccessRate)}`, tone: "green" },
    { label: "索引 P95", value: duration(metrics.p95IndexLatencyMs), detail: `平均 ${duration(metrics.averageIndexLatencyMs)} · ${metrics.failedDocuments} 个失败`, tone: metrics.failedDocuments ? "red" : "blue" },
    { label: "Recall@5", value: optionalPercent(metrics.recallAt5), detail: `MRR@5 ${optionalPercent(metrics.mrrAt5)}`, tone: "green" },
    { label: "Groundedness", value: optionalPercent(metrics.groundedness), detail: `回答正确率 ${optionalPercent(metrics.answerCorrectness)}`, tone: "blue" }
  ];
}

function DocumentTable({
  documents,
  onChunks,
  onReindex,
  onDelete
}: {
  documents: KnowledgeDocument[];
  onChunks: (id: string) => Promise<void>;
  onReindex: (document: KnowledgeDocument) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden rounded-lg">
      <div className="grid grid-cols-[1fr_100px_90px_128px] border-b border-[#d9e1e8] bg-[#f8fafb] px-5 py-3 text-xs font-bold text-[#5b6472]">
        <span>文档</span><span>状态</span><span>分块</span><span>操作</span>
      </div>
      {documents.length === 0 ? <div className="px-5 py-9 text-center text-sm text-[#8a94a3]">当前知识库还没有文档。</div> : null}
      {documents.map((document) => (
        <div key={document.id} className="grid grid-cols-[1fr_100px_90px_128px] items-center border-b border-[#eef2f5] px-5 py-4 text-sm last:border-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#eef2f5] text-[#5b6472]"><FileText size={17} /></span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{document.name}</div>
              <div className="mt-1 text-xs text-[#5b6472]">{Math.round(document.sizeBytes / 1024)} KB{document.errorMessage ? ` · ${document.errorMessage}` : ""}</div>
            </div>
          </div>
          <DocumentStatusBadge status={document.status} />
          <span className="font-mono text-xs text-[#5b6472]">{document.chunkCount}</span>
          <div className="flex gap-1">
            <ActionButton title="查看分块" onClick={() => void onChunks(document.id)}><FileSearch size={14} /></ActionButton>
            <ActionButton title="重新索引" onClick={() => void onReindex(document)}><RefreshCw size={14} /></ActionButton>
            <ActionButton title="删除文档" onClick={() => void onDelete(document.id)}><Trash2 size={14} /></ActionButton>
          </div>
        </div>
      ))}
    </Card>
  );
}

function ChunkPreview({ chunks }: { chunks: KnowledgeChunk[] }) {
  return (
    <Card className="rounded-lg p-5">
      <h3 className="text-base font-bold">分块预览</h3>
      <div className="mt-4 space-y-3">
        {chunks.slice(0, 5).map((chunk) => (
          <div key={chunk.id} className="rounded-lg border border-[#eef2f5] bg-[#f8fafb] p-3 text-sm leading-6 text-[#5b6472]">
            <span className="mb-1 block font-mono text-xs text-[#0f766e]">chunk {chunk.chunkIndex + 1}</span>
            {chunk.content}
          </div>
        ))}
      </div>
    </Card>
  );
}

function TaskQueue({ jobs }: { jobs: DocumentIndexJob[] }) {
  return (
    <Card className="rounded-lg p-5">
      <h3 className="text-lg font-bold">处理任务</h3>
      <div className="mt-4 space-y-3">
        {jobs.length === 0 ? <p className="text-sm text-[#8a94a3]">暂无运行中的索引或评测任务。</p> : null}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border border-[#d9e1e8] p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{job.label}</span>
              {job.status === "failed" ? <AlertCircle size={15} className="text-[#b91c1c]" /> : job.status === "completed" ? <CheckCircle2 size={15} className="text-[#15803d]" /> : null}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[#eef2f5]">
              <div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EvaluationPanel({
  datasets,
  runs,
  latestRun,
  metrics,
  onImport,
  onCreateGolden,
  onRun
}: {
  datasets: EvaluationDataset[];
  runs: EvaluationRun[];
  latestRun: EvaluationRun | null;
  metrics: RagMetrics;
  onImport: () => void;
  onCreateGolden: () => void;
  onRun: (datasetId: string) => Promise<void>;
}) {
  return (
    <Card className="rounded-lg p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">RAG 评测</h3>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCreateGolden}><Sparkles size={14} />黄金集</Button>
          <Button variant="secondary" onClick={onImport}>导入</Button>
        </div>
      </div>
      <LatestEvaluationRun run={latestRun} metrics={metrics} />
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Score label="引用覆盖率" value={metrics.citationCoverage} />
        <Score label="引用正确率" value={metrics.citationCorrectness} />
        <Latency label="检索 P95" value={metrics.p95RetrievalLatencyMs} />
        <Latency label="问答 P95" value={metrics.p95AnswerLatencyMs} />
      </div>
      <div className="mt-4 space-y-2">
        {datasets.map((dataset) => (
          <div key={dataset.id} className="flex items-center justify-between rounded-lg border border-[#eef2f5] px-3 py-2">
            <div>
              <div className="text-sm font-semibold">{dataset.name}</div>
              <div className="text-xs text-[#8a94a3]">{dataset.caseCount} 条问题</div>
            </div>
            <ActionButton title="运行评测" onClick={() => void onRun(dataset.id)}><Play size={14} /></ActionButton>
          </div>
        ))}
      </div>
      {runs.length > 0 ? (
        <div className="mt-5 border-t border-[#eef2f5] pt-4">
          <h4 className="mb-2 text-xs font-bold text-[#5b6472]">最近运行对比</h4>
          {runs.slice(0, 3).map((run) => (
            <div key={run.id} className="mb-2 rounded-lg bg-[#f8fafb] px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="font-semibold">{run.status}</span>
                <span>{run.completedAt ? duration(Date.parse(run.completedAt) - Date.parse(run.createdAt)) : "运行中"}</span>
              </div>
              <div className="mt-1 text-[#5b6472]">
                Recall {optionalPercent(run.metrics?.recallAt5 ?? null)} · MRR {optionalPercent(run.metrics?.mrrAt5 ?? null)} · Groundedness {optionalPercent(run.metrics?.groundedness ?? null)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function LatestEvaluationRun({ run, metrics }: { run: EvaluationRun | null; metrics: RagMetrics }) {
  const displayMetrics = run?.metrics ?? metrics;
  const results = run?.results ?? [];

  return (
    <section className="mt-4 rounded-xl border border-[#d9e1e8] bg-[#f8fafb] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#111827]">
            <BarChart3 size={16} className="text-[#0f766e]" />
            最近一次评测结果
          </div>
          <p className="mt-1 text-xs text-[#8a94a3]">
            {run ? `${run.status} · ${run.completedAt ? duration(Date.parse(run.completedAt) - Date.parse(run.createdAt)) : "运行中"} · ${results.length} 条样本` : "还没有运行记录"}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#0f766e] ring-1 ring-[#d9e1e8]">
          {optionalPercent(displayMetrics.recallAt5)}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        <MetricBar label="Recall@5" value={displayMetrics.recallAt5} />
        <MetricBar label="MRR@5" value={displayMetrics.mrrAt5} />
        <MetricBar label="Groundedness" value={displayMetrics.groundedness} />
        <MetricBar label="Answer Correctness" value={displayMetrics.answerCorrectness} />
      </div>
      {results.length > 0 ? (
        <div className="mt-4 space-y-2">
          {results.slice(0, 4).map((result) => (
            <div key={result.id} className="rounded-lg bg-white p-3 text-xs ring-1 ring-[#eef2f5]">
              <div className="line-clamp-2 font-semibold text-[#111827]">{result.question}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[#5b6472]">
                <span>证据排名 {result.retrievedExpectedRank ?? "未命中"}</span>
                <span>引用 {result.citations.length}</span>
                <span>Grounded {optionalPercent(result.groundedness)}</span>
                <span>正确率 {optionalPercent(result.answerCorrectness)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-[#5b6472]">{label}</span>
        <span className="font-mono text-[#111827]">{optionalPercent(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-white">
        <div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-lg bg-[#f8fafb] p-3"><div className="text-[#8a94a3]">{label}</div><div className="mt-1 text-base font-bold">{optionalPercent(value)}</div></div>;
}
function Latency({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-lg bg-[#f8fafb] p-3"><div className="text-[#8a94a3]">{label}</div><div className="mt-1 text-base font-bold">{value == null ? "--" : duration(value)}</div></div>;
}
function ActionButton({ title, children, onClick }: { title: string; children: ReactNode; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md text-[#5b6472] hover:bg-[#f4f7fa] hover:text-[#111827]">{children}</button>;
}
function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
function optionalPercent(value: number | null) {
  return value == null ? "--" : percent(value);
}
function duration(value: number) {
  return value > 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}
function mergeDatasets(...groups: EvaluationDataset[][]) {
  const map = new Map<string, EvaluationDataset>();
  groups.flat().forEach((dataset) => map.set(dataset.id, dataset));
  return Array.from(map.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
