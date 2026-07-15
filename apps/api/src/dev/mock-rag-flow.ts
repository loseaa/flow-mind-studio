import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

type Job = { id: string; status: "queued" | "running" | "completed" | "failed"; errorMessage?: string | null };
type KnowledgeBase = { id: string; name: string };
type Document = { id: string; name: string; status: string; activeVersion?: number | null; latestVersion?: number };
type Version = { id: string; version: number; status: string };
type RetrievalDebug = {
  mode: "vector" | "hybrid";
  vectorCandidates: Array<{ documentId: string }>;
  keywordCandidates: Array<{ documentId: string }>;
  finalCandidates: Array<{ documentId: string; quote: string; documentVersion: number | null }>;
};
type EvaluationRun = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  retrievalMode: "vector" | "hybrid";
  metrics: null | { recallAt5: number | null; mrrAt5: number | null; groundedness: number | null; answerCorrectness: number | null };
};

const apiBase = (process.env.RAG_MOCK_API_URL ?? "http://127.0.0.1:4000/api").replace(/\/+$/, "");
const fixtureRoot = resolve(__dirname, "../../test/fixtures/rag/mock-enterprise");
const runLabel = new Date().toISOString().replace(/[:.]/g, "-");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  return await response.json() as T;
}

async function json<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  return request<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function upload<T>(path: string, fixtureName: string, fields: Record<string, string> = {}): Promise<T> {
  const content = await readFile(resolve(fixtureRoot, fixtureName));
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/markdown" }), basename(fixtureName));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return request<T>(path, { method: "POST", body: form });
}

async function uploadJson<T>(path: string, fileName: string, value: unknown, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), fileName);
  for (const [key, fieldValue] of Object.entries(fields)) form.append(key, fieldValue);
  return request<T>(path, { method: "POST", body: form });
}

async function waitFor<T>(label: string, load: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 180_000): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await load();
    if (done(value)) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function waitForDocument(baseId: string, documentId: string, activeVersion: number) {
  const documents = await waitFor(
    `document ${documentId} V${activeVersion}`,
    () => request<Document[]>(`/knowledge/bases/${baseId}/documents`),
    (items) => items.some((item) => item.id === documentId && item.status === "indexed" && item.activeVersion === activeVersion)
  );
  const document = documents.find((item) => item.id === documentId)!;
  assert.equal(document.status, "indexed");
  return document;
}

async function debug(question: string, knowledgeBaseId: string, mode: "vector" | "hybrid" = "hybrid") {
  return json<RetrievalDebug>("/rag/retrieval/debug", "POST", { question, knowledgeBaseIds: [knowledgeBaseId], mode });
}

async function waitForRun(runId: string) {
  const run = await waitFor(
    `evaluation ${runId}`,
    () => request<EvaluationRun>(`/rag/evaluation-runs/${runId}`),
    (value) => value.status === "completed" || value.status === "failed",
    240_000
  );
  assert.equal(run.status, "completed", `evaluation failed: ${JSON.stringify(run)}`);
  return run;
}

async function main() {
  await request("/health");
  const base = await json<KnowledgeBase>("/knowledge/bases", "POST", {
    name: `Mock 企业知识库 ${runLabel}`,
    description: "自动化端到端测试：人事、IT 运维与客户政策"
  });
  console.log(`1/8 创建知识库: ${base.name} (${base.id})`);

  const fixtures = ["hr-handbook.md", "it-operations.md", "customer-policy-v1.md", "enterprise-operations-manual-large.md"];
  const documents = new Map<string, Document>();
  for (const fixture of fixtures) {
    const uploaded = await upload<{ document: Document; job: Job }>(`/knowledge/bases/${base.id}/documents`, fixture);
    const indexed = await waitForDocument(base.id, uploaded.document.id, 1);
    documents.set(fixture, indexed);
    console.log(`2/8 索引 V1: ${fixture} (${uploaded.job.id})`);
  }
  assert.equal(documents.size, 4);

  const initialChecks = await Promise.all([
    debug("一线城市出差住宿每晚最多报销多少？", base.id),
    debug("P1 事故必须多久首次响应，RTO 是多久？", base.id),
    debug("企业基础版原价是多少？", base.id)
  ]);
  for (const result of initialChecks) assert.ok(result.finalCandidates.length > 0, "V1 retrieval returned no candidates");
  console.log("3/8 三类 mock 文档检索通过");

  const customerDocument = documents.get("customer-policy-v1.md")!;
  const v1Versions = await request<Version[]>(`/knowledge/documents/${customerDocument.id}/versions`);
  const v1 = v1Versions.find((version) => version.version === 1);
  assert.equal(v1?.status, "active");

  const uploadedV2 = await upload<{ version: Version; job: Job }>(`/knowledge/documents/${customerDocument.id}/versions`, "customer-policy-v2.md");
  await waitForDocument(base.id, customerDocument.id, 2);
  const v2Versions = await request<Version[]>(`/knowledge/documents/${customerDocument.id}/versions`);
  assert.equal(v2Versions.find((version) => version.version === 2)?.status, "active");
  assert.equal(v2Versions.find((version) => version.version === 1)?.status, "archived");
  console.log(`4/8 V2 原子切换通过 (${uploadedV2.job.id})`);

  const v2Debug = await debug("企业基础版调整后的月费和退款期是多少？", base.id);
  assert.ok(v2Debug.keywordCandidates.length > 0, "hybrid retrieval did not produce keyword candidates");
  assert.ok(v2Debug.finalCandidates.some((candidate) => candidate.documentId === customerDocument.id && candidate.quote.includes("3299 元") && candidate.quote.includes("14 天")));
  assert.ok(v2Debug.finalCandidates.some((candidate) => candidate.documentVersion === 2));
  console.log("5/8 混合检索确认只读取活动 V2");

  const hrDocument = documents.get("hr-handbook.md")!;
  const itDocument = documents.get("it-operations.md")!;
  const dataset = await uploadJson<{ id: string; name: string }>(
    "/rag/evaluation-datasets/import",
    "mock-enterprise-evaluation.json",
    [
      {
        question: "一线城市住宿报销上限是多少，超标需要谁审批？",
        referenceAnswer: "每晚上限 800 元；超标需要部门负责人和财务负责人共同审批。",
        knowledgeBaseIds: [base.id],
        evidence: [{ documentId: hrDocument.id, expectedQuote: "住宿标准上限为每晚 800 元" }]
      },
      {
        question: "P1 事件的首次响应目标和 RTO 分别是多少？",
        referenceAnswer: "首次响应目标为 10 分钟，RTO 为 2 小时。",
        knowledgeBaseIds: [base.id],
        evidence: [{ documentId: itDocument.id, expectedQuote: "必须在 10 分钟内首次响应，恢复时间目标（RTO）为 2 小时" }]
      },
      {
        question: "生产数据库备份保留多久？",
        referenceAnswer: "备份文件保留 90 天。",
        knowledgeBaseIds: [base.id],
        evidence: [{ documentId: itDocument.id, expectedQuote: "备份文件保留 90 天" }]
      },
      {
        question: "2026 年 8 月后的企业基础版价格和退款期限是什么？",
        referenceAnswer: "每月 3299 元，新签约客户首次付款后 14 天内可以申请无理由退款。",
        knowledgeBaseIds: [base.id],
        evidence: [{ documentId: customerDocument.id, expectedQuote: "企业基础版价格调整为每月 3299 元" }]
      }
    ],
    { name: `Mock 全流程评测 ${runLabel}` }
  );
  console.log(`6/8 导入 4 条评测样本: ${dataset.name}`);

  const [vectorStarted, hybridStarted] = await Promise.all([
    json<{ run: EvaluationRun }>(`/rag/evaluation-datasets/${dataset.id}/runs`, "POST", { retrievalMode: "vector" }),
    json<{ run: EvaluationRun }>(`/rag/evaluation-datasets/${dataset.id}/runs`, "POST", { retrievalMode: "hybrid" })
  ]);
  const [vectorRun, hybridRun] = await Promise.all([waitForRun(vectorStarted.run.id), waitForRun(hybridStarted.run.id)]);
  assert.ok(hybridRun.metrics?.recallAt5 !== null, "hybrid evaluation produced no retrieval metrics");
  console.log(`7/8 评测完成: vector Recall=${vectorRun.metrics?.recallAt5}, hybrid Recall=${hybridRun.metrics?.recallAt5}`);

  await request(`/knowledge/documents/${customerDocument.id}/versions/${v1!.id}/rollback`, { method: "POST" });
  const rolledBackVersions = await request<Version[]>(`/knowledge/documents/${customerDocument.id}/versions`);
  assert.equal(rolledBackVersions.find((version) => version.version === 1)?.status, "active");
  const rollbackDebug = await debug("企业基础版原价和退款期限是什么？", base.id);
  assert.ok(rollbackDebug.finalCandidates.some((candidate) => candidate.documentId === customerDocument.id && candidate.quote.includes("2999 元") && candidate.quote.includes("7 天")));
  assert.ok(rollbackDebug.finalCandidates.every((candidate) => candidate.documentId !== customerDocument.id || !candidate.quote.includes("3299 元")));
  console.log("8/8 回滚 V1 并验证旧索引恢复通过");

  console.log(JSON.stringify({
    ok: true,
    knowledgeBase: base,
    documents: [...documents.values()].map((document) => ({ id: document.id, name: document.name })),
    versionedDocumentId: customerDocument.id,
    dataset,
    evaluation: {
      vector: { id: vectorRun.id, metrics: vectorRun.metrics },
      hybrid: { id: hybridRun.id, metrics: hybridRun.metrics }
    }
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
