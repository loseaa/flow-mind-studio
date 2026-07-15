import { Activity, AlertCircle, BarChart3, CheckCircle2, Clock3, Database, FileSearch, FileText, GitBranch, History, ListChecks, Play, Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DocumentIndexJob, EvaluationDataset, EvaluationRun, KnowledgeBase, KnowledgeChunk, KnowledgeDocument, KnowledgeDocumentVersion, RagMetrics, RetrievalDebug } from "@flowmind/shared";
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
  const [versions, setVersions] = useState<KnowledgeDocumentVersion[]>([]);
  const [versionDocumentId, setVersionDocumentId] = useState<string | null>(null);
  const [debugQuestion, setDebugQuestion] = useState("");
  const [debugMode, setDebugMode] = useState<"vector" | "hybrid">("hybrid");
  const [debugResult, setDebugResult] = useState<RetrievalDebug | null>(null);
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [latestRun, setLatestRun] = useState<EvaluationRun | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [workspace, setWorkspace] = useState<"documents" | "retrieval" | "evaluation" | "tasks">("documents");
  const [showEvaluationDetails, setShowEvaluationDetails] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const evaluationRef = useRef<HTMLInputElement>(null);
  const versionUploadRef = useRef<HTMLInputElement>(null);
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
    setVersions([]);
    setVersionDocumentId(null);
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
    setSelectedDatasetId((current) => nextDatasets.some((dataset) => dataset.id === current) ? current : nextDatasets[0]?.id ?? "");
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
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: item.activeVersionId ? "indexed" : "parsing", errorMessage: null } : item));
  }

  async function deleteDocument(documentId: string) {
    await apiDelete(`/knowledge/documents/${documentId}`);
    setDocuments((current) => current.filter((document) => document.id !== documentId));
    void loadOverview();
  }

  function watchJob(job: DocumentIndexJob, documentBaseId?: string) {
    setWorkspace("tasks");
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 6));
    subscriptions.current.push(
      streamJob(job.id, (update) => {
        setJobs((current) => [update, ...current.filter((item) => item.id !== update.id)].slice(0, 6));
        if (update.status === "completed" || update.status === "failed") {
          if (documentBaseId && selectedBaseRef.current === documentBaseId) void loadDocuments(documentBaseId);
          if (versionDocumentId) void viewVersions(versionDocumentId);
          void loadOverview();
        }
      })
    );
  }

  async function viewChunks(documentId: string) {
    setChunks(await apiGet<KnowledgeChunk[]>(`/knowledge/documents/${documentId}/chunks`, []));
  }

  async function viewVersions(documentId: string) {
    setVersionDocumentId(documentId);
    setVersions(await apiGet<KnowledgeDocumentVersion[]>(`/knowledge/documents/${documentId}/versions`, []));
  }

  async function uploadVersion(file: File | undefined) {
    if (!file || !versionDocumentId) return;
    try {
      const response = await apiUpload<{ version: KnowledgeDocumentVersion; job: DocumentIndexJob }>(`/knowledge/documents/${versionDocumentId}/versions`, file);
      setVersions((current) => [response.version, ...current]);
      watchJob(response.job, selectedBaseId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传新版本失败。");
    } finally {
      if (versionUploadRef.current) versionUploadRef.current.value = "";
    }
  }

  async function rollbackVersion(versionId: string) {
    if (!versionDocumentId) return;
    const document = await apiCreate<KnowledgeDocument>(`/knowledge/documents/${versionDocumentId}/versions/${versionId}/rollback`);
    setDocuments((current) => current.map((item) => item.id === document.id ? document : item));
    await viewVersions(versionDocumentId);
  }

  async function indexVersion(versionId: string) {
    if (!versionDocumentId) return;
    const job = await apiCreate<DocumentIndexJob>(`/knowledge/documents/${versionDocumentId}/versions/${versionId}/index`);
    watchJob(job, selectedBaseId);
  }

  async function debugRetrieval() {
    try {
      const result = await apiCreate<RetrievalDebug>("/rag/retrieval/debug", {
        question: debugQuestion,
        knowledgeBaseIds: [selectedBaseId],
        mode: debugMode
      });
      setDebugResult(result);
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "检索调试失败。");
    }
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

  async function runDataset(datasetId: string, retrievalMode: "vector" | "hybrid" = "hybrid") {
    const result = await apiCreate<{ job: DocumentIndexJob }>(`/rag/evaluation-datasets/${datasetId}/runs`, { retrievalMode });
    watchJob(result.job);
  }

  return (
    <PageShell>
      <PageTitle
        description="管理知识库文档、后台索引任务和 RAG 基准评测，聊天回答会引用已命中的片段。"
        action={workspace === "documents" ? (
          <Button onClick={() => uploadRef.current?.click()} className="h-10 bg-[#1e293b]">
            <Upload size={16} />上传文档
          </Button>
        ) : workspace === "evaluation" ? (
          <Button onClick={() => evaluationRef.current?.click()} className="h-10 bg-[#1e293b]">
            <Upload size={16} />导入评测集
          </Button>
        ) : undefined}
      >
        知识库
      </PageTitle>
      <input ref={uploadRef} hidden type="file" accept=".pdf,.md,.txt" onChange={(event) => void uploadDocument(event.target.files?.[0])} />
      <input ref={evaluationRef} hidden type="file" accept=".json,.csv" onChange={(event) => void importDataset(event.target.files?.[0])} />
      <input ref={versionUploadRef} hidden type="file" accept=".pdf,.md,.txt" onChange={(event) => void uploadVersion(event.target.files?.[0])} />
      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <section className="mt-7 grid gap-3.5 md:grid-cols-4">
        {metricCards(metrics).map((item) => <StatCard key={item.label} {...item} />)}
      </section>
      <WorkspaceNavigation active={workspace} jobs={jobs} onChange={setWorkspace} />
      <section className="mt-5">
        {workspace === "documents" ? (
          <div className="space-y-4">
          <Card className="rounded-xl p-4">
            <ModuleHeader icon={<Database size={17} />} title="知识库空间" description="选择一个业务知识域，或创建新的知识库来隔离不同团队和场景的文档。" />
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(260px,1fr)_200px_auto]">
              <select
                aria-label="当前知识库"
                value={selectedBaseId}
                onChange={(event) => setSelectedBaseId(event.target.value)}
                className="h-10 min-w-0 rounded-lg border border-[#d9e1e8] bg-white px-3 text-sm"
              >
                {bases.map((base) => <option key={base.id} value={base.id}>{base.name} ({base.documentCount})</option>)}
              </select>
              <Input value={baseName} onChange={(event) => setBaseName(event.target.value)} placeholder="输入新知识库名称" />
              <Button variant="secondary" onClick={() => void createBase()}><Plus size={15} />创建知识库</Button>
            </div>
          </Card>
          <DocumentTable
            documents={documents}
            onChunks={viewChunks}
            onVersions={(id) => { void viewVersions(id); }}
            onReindex={reindex}
            onDelete={deleteDocument}
          />
          {versions.length > 0 && versionDocumentId ? (
            <VersionPanel
              versions={versions}
              onUpload={() => versionUploadRef.current?.click()}
              onRollback={(versionId) => void rollbackVersion(versionId)}
              onIndex={(versionId) => void indexVersion(versionId)}
            />
          ) : null}
          {chunks.length > 0 ? <ChunkPreview chunks={chunks} /> : null}
          </div>
        ) : null}
        {workspace === "retrieval" ? (
          <RetrievalDebugPanel
            knowledgeBaseName={bases.find((base) => base.id === selectedBaseId)?.name ?? "当前知识库"}
            question={debugQuestion}
            mode={debugMode}
            result={debugResult}
            onQuestion={setDebugQuestion}
            onMode={setDebugMode}
            onRun={() => void debugRetrieval()}
          />
        ) : null}
        {workspace === "evaluation" ? (
          <EvaluationWorkspace
            datasets={datasets}
            runs={runs}
            latestRun={latestRun}
            metrics={metrics}
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={setSelectedDatasetId}
            onImport={() => evaluationRef.current?.click()}
            onCreateGolden={() => void createGoldenDatasets()}
            onRun={runDataset}
            onShowDetails={() => setShowEvaluationDetails((current) => !current)}
            detailsVisible={showEvaluationDetails}
          />
        ) : null}
        {workspace === "tasks" ? <TaskWorkspace jobs={jobs} /> : null}
      </section>
    </PageShell>
  );
}

function WorkspaceNavigation({ active, jobs, onChange }: {
  active: "documents" | "retrieval" | "evaluation" | "tasks";
  jobs: DocumentIndexJob[];
  onChange: (workspace: "documents" | "retrieval" | "evaluation" | "tasks") => void;
}) {
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const items = [
    { id: "documents" as const, icon: <FileText size={17} />, title: "文档管理", detail: "知识库、文档与版本" },
    { id: "retrieval" as const, icon: <Search size={17} />, title: "检索实验", detail: "召回证据与排名调试" },
    { id: "evaluation" as const, icon: <BarChart3 size={17} />, title: "质量评测", detail: "数据集、指标与回归" },
    { id: "tasks" as const, icon: <Activity size={17} />, title: "任务队列", detail: activeJobs ? `${activeJobs} 个任务进行中` : "本次会话的执行状态" }
  ];
  return (
    <div className="mt-5 grid gap-2 rounded-xl border border-[#d9e1e8] bg-[#eef2f5] p-1.5 md:grid-cols-4">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition ${active === item.id ? "bg-white text-[#111827] shadow-sm ring-1 ring-black/5" : "text-[#697386] hover:bg-white/60 hover:text-[#344054]"}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active === item.id ? "bg-[#e7f5f2] text-[#0f766e]" : "bg-white/60"}`}>{item.icon}</span>
          <span className="min-w-0"><span className="block text-sm font-bold">{item.title}</span><span className="mt-0.5 block truncate text-xs text-[#8a94a3]">{item.detail}</span></span>
          {item.id === "tasks" && activeJobs > 0 ? <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1 text-[11px] font-bold text-amber-700">{activeJobs}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ModuleHeader({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e7f5f2] text-[#0f766e]">{icon}</span>
        <div><h3 className="text-base font-bold text-[#111827]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#8a94a3]">{description}</p></div>
      </div>
      {action}
    </div>
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
  onVersions,
  onReindex,
  onDelete
}: {
  documents: KnowledgeDocument[];
  onChunks: (id: string) => Promise<void>;
  onVersions: (id: string) => void;
  onReindex: (document: KnowledgeDocument) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden rounded-lg">
      <div className="border-b border-[#e7edf2] px-5 py-4">
        <ModuleHeader icon={<FileText size={17} />} title="文档与索引" description="管理当前知识库的资料。先确认状态为“已索引”，再进入分块、版本或检索调试。" />
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[800px] grid-cols-[1fr_100px_70px_240px] border-b border-[#d9e1e8] bg-[#f8fafb] px-5 py-3 text-xs font-bold text-[#5b6472]">
          <span>文档</span><span>状态</span><span>分块</span><span>操作</span>
        </div>
        {documents.length === 0 ? <div className="px-5 py-9 text-center text-sm text-[#8a94a3]">当前知识库还没有文档。</div> : null}
        {documents.map((document) => (
          <div key={document.id} className="grid min-w-[800px] grid-cols-[1fr_100px_70px_240px] items-center border-b border-[#eef2f5] px-5 py-4 text-sm last:border-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#eef2f5] text-[#5b6472]"><FileText size={17} /></span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{document.name}</div>
              <div className="mt-1 text-xs text-[#5b6472]">{Math.round(document.sizeBytes / 1024)} KB · 当前 V{document.activeVersion ?? "--"} / 最新 V{document.latestVersion}{document.errorMessage ? ` · ${document.errorMessage}` : ""}</div>
            </div>
          </div>
          <DocumentStatusBadge status={document.status} />
          <span className="font-mono text-xs text-[#5b6472]">{document.chunkCount}</span>
          <div className="flex gap-1.5">
            <ActionButton title="查看分块" label="分块" onClick={() => void onChunks(document.id)}><FileSearch size={13} /></ActionButton>
            <ActionButton title="版本历史" label="版本" onClick={() => onVersions(document.id)}><History size={13} /></ActionButton>
            <ActionButton title="重新索引" label="索引" onClick={() => void onReindex(document)}><RefreshCw size={13} /></ActionButton>
            <ActionButton title="删除文档" label="删除" danger onClick={() => void onDelete(document.id)}><Trash2 size={13} /></ActionButton>
          </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VersionPanel({
  versions,
  onUpload,
  onRollback,
  onIndex
}: {
  versions: KnowledgeDocumentVersion[];
  onUpload: () => void;
  onRollback: (versionId: string) => void;
  onIndex: (versionId: string) => void;
}) {
  return (
    <Card className="rounded-lg p-5">
      <ModuleHeader
        icon={<GitBranch size={17} />}
        title="版本历史"
        description="查看同一文档的历史版本。新版本索引完成后才会替换当前版本，也可以随时回滚。"
        action={<Button variant="secondary" onClick={onUpload}><Upload size={14} />上传新版本</Button>}
      />
      <div className="mt-4 space-y-2">
        {versions.map((version) => (
          <div key={version.id} className="flex items-center justify-between rounded-lg border border-[#eef2f5] px-3 py-3 text-sm">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                V{version.version}
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${version.status === "active" ? "bg-emerald-50 text-emerald-700" : version.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  {versionStatusLabel(version.status)}
                </span>
              </div>
              <div className="mt-1 text-xs text-[#8a94a3]">
                {version.chunkCount} 块 · {version.embeddingModel ?? "尚未生成向量"} · {new Date(version.createdAt).toLocaleString("zh-CN")}
                {version.errorMessage ? ` · ${version.errorMessage}` : ""}
              </div>
            </div>
            {version.status === "archived" ? (
              <Button variant="secondary" onClick={() => onRollback(version.id)}><RotateCcw size={13} />回滚</Button>
            ) : version.status === "uploaded" || version.status === "failed" ? (
              <Button variant="secondary" onClick={() => onIndex(version.id)}><RefreshCw size={13} />索引</Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RetrievalDebugPanel({
  knowledgeBaseName,
  question,
  mode,
  result,
  onQuestion,
  onMode,
  onRun
}: {
  knowledgeBaseName: string;
  question: string;
  mode: "vector" | "hybrid";
  result: RetrievalDebug | null;
  onQuestion: (value: string) => void;
  onMode: (value: "vector" | "hybrid") => void;
  onRun: () => void;
}) {
  return (
    <Card className="rounded-lg p-5">
      <ModuleHeader
        icon={<Search size={17} />}
        title="检索调试台"
        description="输入真实业务问题，检查系统召回了哪些文档、证据排名和融合得分。它用于定位“为什么答不对”。"
        action={<span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#5b6472]">检索范围：{knowledgeBaseName}</span>}
      />
      <div className="mt-4 flex gap-2">
        <Input value={question} onChange={(event) => onQuestion(event.target.value)} placeholder="输入问题，查看完整召回过程" />
        <select value={mode} onChange={(event) => onMode(event.target.value as "vector" | "hybrid")} className="rounded-lg border border-[#d9e1e8] bg-white px-3 text-sm">
          <option value="hybrid">混合检索</option>
          <option value="vector">纯向量</option>
        </select>
        <Button onClick={onRun} disabled={!question.trim()}>运行</Button>
      </div>
      {result ? (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-[#5b6472]">
            <span>{result.latencyMs}ms</span>
            <span>向量候选 {result.vectorCandidates.length}</span>
            <span>关键词候选 {result.keywordCandidates.length}</span>
            <span>最终 {result.finalCandidates.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#8a94a3]"><tr><th className="pb-2">排名</th><th className="pb-2">文档</th><th className="pb-2">V/K</th><th className="pb-2">融合分</th><th className="pb-2">证据</th></tr></thead>
              <tbody>
                {result.finalCandidates.map((candidate, index) => (
                  <tr key={candidate.chunkId} className="border-t border-[#eef2f5] align-top">
                    <td className="py-2 font-mono">{index + 1}</td>
                    <td className="py-2 pr-3 font-semibold">{candidate.documentName} · V{candidate.documentVersion ?? "--"}</td>
                    <td className="py-2 pr-3 font-mono">{candidate.vectorRank ?? "-"}/{candidate.keywordRank ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono">{candidate.fusedScore.toFixed(4)}</td>
                    <td className="max-w-[420px] py-2 text-[#5b6472]"><span className="line-clamp-3">{candidate.quote}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ChunkPreview({ chunks }: { chunks: KnowledgeChunk[] }) {
  return (
    <Card className="rounded-lg p-5">
      <ModuleHeader
        icon={<FileSearch size={17} />}
        title="分块预览"
        description="查看文档解析后实际进入索引的全部文本片段，用来发现截断、乱码或分块粒度问题。"
        action={<span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#5b6472]">共 {chunks.length} 块</span>}
      />
      <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-2">
        {chunks.map((chunk) => (
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
  const active = jobs.filter((job) => job.status === "queued" || job.status === "running");
  const history = jobs.filter((job) => job.status === "completed" || job.status === "failed");
  return (
    <div>
      <SectionLabel icon={<Activity size={14} />} title="当前任务" detail={`${active.length} 个进行中`} />
      <div className="mt-3 space-y-2">
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d9e1e8] bg-[#f8fafb] px-4 py-8 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={22} />
            <p className="mt-2 text-sm font-semibold text-[#344054]">没有待处理任务</p>
            <p className="mt-1 text-xs text-[#8a94a3]">上传、索引和评测任务会显示在这里。</p>
          </div>
        ) : active.map((job) => <JobItem key={job.id} job={job} />)}
      </div>
      {history.length > 0 ? (
        <div className="mt-6">
          <SectionLabel icon={<Clock3 size={14} />} title="最近完成" detail={`${history.length} 条`} />
          <div className="mt-3 space-y-2">{history.slice(0, 4).map((job) => <JobItem key={job.id} job={job} compact />)}</div>
        </div>
      ) : null}
    </div>
  );
}

function TaskWorkspace({ jobs }: { jobs: DocumentIndexJob[] }) {
  const active = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  return (
    <div className="space-y-4">
      <Card className="rounded-xl p-5">
        <ModuleHeader
          icon={<Activity size={17} />}
          title="任务队列"
          description="跟踪当前页面触发的文档解析、向量索引和质量评测；失败任务会在这里显示具体原因。"
          action={<span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{active ? `${active} 个进行中` : "当前无运行任务"}</span>}
        />
      </Card>
      <Card className="rounded-xl p-5"><TaskQueue jobs={jobs} /></Card>
    </div>
  );
}

function JobItem({ job, compact = false }: { job: DocumentIndexJob; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-[#e7edf2] bg-white p-3">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <div className="truncate font-semibold text-[#344054]">{job.label}</div>
          <div className="mt-1 text-xs text-[#8a94a3]">{job.type === "document.index" ? "文档索引" : "RAG 评测"} · {job.progress}%</div>
        </div>
        {job.status === "failed" ? <AlertCircle size={16} className="shrink-0 text-red-600" /> : job.status === "completed" ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : <RefreshCw size={15} className="shrink-0 animate-spin text-[#0f766e]" />}
      </div>
      {!compact ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eef2f5]"><div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${job.progress}%` }} /></div> : null}
      {job.errorMessage ? <p className="mt-2 line-clamp-2 text-xs text-red-600">{job.errorMessage}</p> : null}
    </div>
  );
}

function EvaluationWorkspace({
  datasets,
  runs,
  latestRun,
  metrics,
  selectedDatasetId,
  onSelectDataset,
  onImport,
  onCreateGolden,
  onRun,
  onShowDetails,
  detailsVisible
}: {
  datasets: EvaluationDataset[];
  runs: EvaluationRun[];
  latestRun: EvaluationRun | null;
  metrics: RagMetrics;
  selectedDatasetId: string;
  onSelectDataset: (datasetId: string) => void;
  onImport: () => void;
  onCreateGolden: () => void;
  onRun: (datasetId: string, retrievalMode: "vector" | "hybrid") => Promise<void>;
  onShowDetails: () => void;
  detailsVisible: boolean;
}) {
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? datasets[0];
  return (
    <div className="space-y-4">
      <Card className="rounded-xl p-5">
        <ModuleHeader
          icon={<BarChart3 size={17} />}
          title="质量评测"
          description="选择固定问题集，分别运行纯向量或混合检索，比较 Recall、MRR、忠实度和回答正确率。"
          action={<div className="flex gap-2"><Button variant="secondary" onClick={onImport}>导入数据集</Button><Button variant="secondary" onClick={onCreateGolden}><Sparkles size={14} />生成黄金集</Button></div>}
        />
      </Card>
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-xl p-5">
          <SectionLabel icon={<Play size={15} />} title="发起一次评测" detail={`${datasets.length} 个可用数据集`} />
          <p className="mt-2 text-xs leading-5 text-[#8a94a3]">纯向量是基线；混合检索会加入关键词召回。建议同一数据集分别运行两次进行对比。</p>
          <div className="mt-5 rounded-xl border border-[#e7edf2] bg-[#f8fafb] p-4">
          {datasets.length > 0 ? (
            <>
              <label className="text-xs font-semibold text-[#697386]" htmlFor="evaluation-dataset">评测数据集</label>
              <select id="evaluation-dataset" value={selectedDataset?.id ?? ""} onChange={(event) => onSelectDataset(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#d9e1e8] bg-white px-3 text-sm font-medium text-[#344054]">
                {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.caseCount} 条</option>)}
              </select>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => selectedDataset && void onRun(selectedDataset.id, "vector")} className="rounded-xl border border-[#d9e1e8] bg-white p-4 text-left transition hover:border-[#94a3b8] hover:shadow-sm">
                  <span className="flex items-center gap-2 text-sm font-bold text-[#344054]"><Play size={15} />运行纯向量</span>
                  <span className="mt-1.5 block text-xs leading-5 text-[#8a94a3]">只使用语义向量召回，作为效果基线。</span>
                </button>
                <button type="button" onClick={() => selectedDataset && void onRun(selectedDataset.id, "hybrid")} className="rounded-xl border border-[#b7dcd2] bg-[#f2faf7] p-4 text-left transition hover:border-[#0f766e] hover:shadow-sm">
                  <span className="flex items-center gap-2 text-sm font-bold text-[#0f766e]"><Sparkles size={15} />运行混合检索</span>
                  <span className="mt-1.5 block text-xs leading-5 text-[#5f7f77]">融合向量与关键词召回，验证生产策略。</span>
                </button>
              </div>
            </>
          ) : <p className="text-sm text-[#8a94a3]">还没有评测数据集。</p>}
          </div>
        </Card>
        <LatestEvaluationSummary run={latestRun} metrics={metrics} onShowDetails={onShowDetails} detailsVisible={detailsVisible} />
      </div>
      <RecentRuns runs={runs} />
      {detailsVisible ? <EvaluationDetails run={latestRun} /> : null}
    </div>
  );
}

function LatestEvaluationSummary({ run, metrics, onShowDetails, detailsVisible }: { run: EvaluationRun | null; metrics: RagMetrics; onShowDetails: () => void; detailsVisible: boolean }) {
  const displayMetrics = run?.metrics ?? metrics;
  return (
    <section className="rounded-xl border border-[#cfe5df] bg-gradient-to-br from-[#f2faf7] to-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[#111827]">最近一次评测</div>
          <p className="mt-1 text-xs text-[#8a94a3]">
            {run ? `${run.retrievalMode === "vector" ? "纯向量" : "混合检索"} · ${run.completedAt ? duration(Date.parse(run.completedAt) - Date.parse(run.createdAt)) : "运行中"} · ${run.results.length} 条样本` : "还没有运行记录"}
          </p>
        </div>
        <span className="text-2xl font-bold tracking-tight text-[#0f766e]">{optionalPercent(displayMetrics.recallAt5)}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <CompactMetric label="Recall@5" value={displayMetrics.recallAt5} />
        <CompactMetric label="MRR@5" value={displayMetrics.mrrAt5} />
        <CompactMetric label="Grounded" value={displayMetrics.groundedness} />
        <CompactMetric label="正确率" value={displayMetrics.answerCorrectness} />
      </div>
      {run?.results.length ? <button type="button" onClick={onShowDetails} className="mt-4 flex w-full items-center justify-center gap-2 border-t border-[#d9ebe5] pt-3 text-xs font-semibold text-[#0f766e]"><ListChecks size={14} />{detailsVisible ? "收起样本明细" : "查看样本明细"}</button> : null}
    </section>
  );
}

function CompactMetric({ label, value }: { label: string; value: number | null }) {
  return <div><div className="text-[11px] text-[#8a94a3]">{label}</div><div className="mt-0.5 font-mono text-sm font-bold text-[#344054]">{optionalPercent(value)}</div></div>;
}

function RecentRuns({ runs }: { runs: EvaluationRun[] }) {
  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="border-b border-[#e7edf2] px-5 py-4"><SectionLabel icon={<Clock3 size={15} />} title="最近运行记录" detail={`显示最近 ${Math.min(5, runs.length)} / ${runs.length} 条`} /></div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[130px_100px_repeat(4,1fr)_90px] bg-[#f8fafb] px-5 py-3 text-xs font-semibold text-[#697386]"><span>检索策略</span><span>状态</span><span>Recall@5</span><span>MRR@5</span><span>Grounded</span><span>正确率</span><span>耗时</span></div>
        {runs.length === 0 ? <div className="px-5 py-8 text-center text-sm text-[#8a94a3]">暂无运行记录。</div> : runs.slice(0, 5).map((run) => (
          <div key={run.id} className="grid min-w-[720px] grid-cols-[130px_100px_repeat(4,1fr)_90px] border-t border-[#eef2f5] px-5 py-3 text-xs text-[#344054]">
            <span className="font-semibold">{run.retrievalMode === "vector" ? "纯向量" : "混合检索"}</span>
            <span className={run.status === "completed" ? "text-emerald-700" : run.status === "failed" ? "text-red-600" : "text-amber-700"}>{run.status}</span>
            <span>{optionalPercent(run.metrics?.recallAt5 ?? null)}</span><span>{optionalPercent(run.metrics?.mrrAt5 ?? null)}</span><span>{optionalPercent(run.metrics?.groundedness ?? null)}</span><span>{optionalPercent(run.metrics?.answerCorrectness ?? null)}</span>
            <span>{run.completedAt ? duration(Date.parse(run.completedAt) - Date.parse(run.createdAt)) : "运行中"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SectionLabel({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-[#344054]">{icon}{title}</div><span className="text-xs text-[#8a94a3]">{detail}</span></div>;
}

function EvaluationDetails({ run }: { run: EvaluationRun | null }) {
  if (!run) return null;
  return (
    <Card className="rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold"><ListChecks size={16} />评测样本明细</h3>
          <p className="mt-1 text-xs text-[#8a94a3]">{run.retrievalMode === "vector" ? "纯向量" : "混合检索"} · {run.results.length} 条样本 · {run.status}</p>
        </div>
        <span className="rounded-full bg-[#e7f5f2] px-3 py-1 text-sm font-bold text-[#0f766e]">Recall {optionalPercent(run.metrics?.recallAt5 ?? null)}</span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#e7edf2]">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_90px] bg-[#f8fafb] px-4 py-3 text-xs font-semibold text-[#697386]"><span>问题</span><span>证据排名</span><span>Grounded</span><span>正确率</span></div>
          {run.results.map((result) => (
            <div key={result.id} className="grid grid-cols-[minmax(0,1fr)_90px_90px_90px] items-center border-t border-[#eef2f5] px-4 py-3 text-xs">
              <span className="pr-4 font-medium text-[#344054]">{result.question}</span>
              <span>{result.retrievedExpectedRank ?? "未命中"}</span>
              <span>{optionalPercent(result.groundedness)}</span>
              <span>{optionalPercent(result.answerCorrectness)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActionButton({ title, label, children, danger = false, onClick }: { title: string; label: string; children: ReactNode; danger?: boolean; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className={`flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium ${danger ? "text-[#b42318] hover:bg-red-50" : "text-[#5b6472] hover:bg-[#f4f7fa] hover:text-[#111827]"}`}>{children}{label}</button>;
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
function versionStatusLabel(status: KnowledgeDocumentVersion["status"]) {
  return ({ uploaded: "待索引", indexing: "索引中", ready: "待激活", active: "当前", failed: "失败", archived: "历史" } as const)[status];
}
function mergeDatasets(...groups: EvaluationDataset[][]) {
  const map = new Map<string, EvaluationDataset>();
  groups.flat().forEach((dataset) => map.set(dataset.id, dataset));
  return Array.from(map.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
