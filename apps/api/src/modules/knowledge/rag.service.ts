import { randomUUID } from "node:crypto";
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import { z } from "zod";
import type {
  DocumentIndexJob,
  EvaluationCase,
  EvaluationDataset,
  EvaluationResult,
  EvaluationRun,
  KnowledgeDocument,
  RagCitation,
  RagMetrics,
  RagTrace,
  RetrievalCandidate,
  RetrievalDebug
} from "@flowmind/shared";
import { chunkDocumentText, extractDocumentText, type UploadedDocument, validateDocumentUpload } from "./document-processing";
import { EmbeddingClient } from "./embedding.client";
import { KnowledgeRepository } from "./knowledge.repository";

export const ORGANIZATION_ID = "org_1";
export const NO_EVIDENCE_ANSWER = "未从所选知识库找到可支撑此问题的资料。请调整问题或补充相关文档后重试。";
const DEFAULT_TOP_K = 5;
const DEFAULT_CANDIDATE_K = 30;
const DEFAULT_MIN_SCORE = 0.2;
const DEFAULT_RRF_K = 60;
export type RetrievalMode = "vector" | "hybrid";

@Injectable()
export class KnowledgeService implements OnModuleInit {
  constructor(
    private readonly repository: KnowledgeRepository,
    @Inject(forwardRef(() => RagTaskService)) private readonly tasks: Pick<RagTaskService, "enqueueDocumentIndex">,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    await this.repository.ensureSchema(ORGANIZATION_ID);
  }

  listBases() {
    return this.repository.listBases(ORGANIZATION_ID);
  }

  createBase(input: { name?: string; description?: string }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("知识库名称不能为空。");
    return this.repository.createBase(ORGANIZATION_ID, { name, description: input.description?.trim() });
  }

  async updateBase(id: string, input: { name?: string; description?: string }) {
    const updated = await this.repository.updateBase(id, ORGANIZATION_ID, {
      name: input.name?.trim() || undefined,
      description: input.description?.trim()
    });
    if (!updated) throw new NotFoundException("知识库不存在。");
    return updated;
  }

  async deleteBase(id: string) {
    await this.repository.deleteBase(id, ORGANIZATION_ID);
    return { ok: true };
  }

  listDocuments(knowledgeBaseId: string) {
    return this.repository.listDocuments(knowledgeBaseId, ORGANIZATION_ID);
  }

  async uploadDocument(knowledgeBaseId: string, file: UploadedDocument | undefined) {
    validateDocumentUpload(file, Number(this.configService.get<string>("MAX_DOCUMENT_BYTES") ?? 5 * 1024 * 1024));
    const document = await this.repository.createDocument(knowledgeBaseId, ORGANIZATION_ID, file!);
    const [version] = await this.repository.listVersions(document.id, ORGANIZATION_ID);
    const job = await this.tasks.enqueueDocumentIndex(version.id);
    return { document, job };
  }

  listChunks(documentId: string) {
    return this.repository.listChunks(documentId, ORGANIZATION_ID);
  }

  async reindex(documentId: string) {
    const version = await this.repository.createDocumentVersion(documentId, ORGANIZATION_ID);
    return this.tasks.enqueueDocumentIndex(version.id);
  }

  listVersions(documentId: string) {
    return this.repository.listVersions(documentId, ORGANIZATION_ID);
  }

  async uploadVersion(documentId: string, file: UploadedDocument | undefined) {
    validateDocumentUpload(file, Number(this.configService.get<string>("MAX_DOCUMENT_BYTES") ?? 5 * 1024 * 1024));
    const version = await this.repository.createDocumentVersion(documentId, ORGANIZATION_ID, file!);
    const job = await this.tasks.enqueueDocumentIndex(version.id);
    return { version, job };
  }

  rollbackVersion(documentId: string, versionId: string) {
    return this.repository.rollbackVersion(documentId, versionId, ORGANIZATION_ID);
  }

  async indexVersion(documentId: string, versionId: string) {
    const version = await this.repository.getVersionForIndexing(versionId, ORGANIZATION_ID);
    if (!version || version.document_id !== documentId) throw new NotFoundException("文档版本不存在。");
    if (version.status === "active") throw new BadRequestException("当前生效版本无需重复激活。");
    return this.tasks.enqueueDocumentIndex(versionId);
  }

  async deleteDocument(documentId: string) {
    await this.repository.deleteDocument(documentId, ORGANIZATION_ID);
    return { ok: true };
  }
}

@Injectable()
export class IndexingService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddingClient: EmbeddingClient
  ) {}

  async process(versionId: string, jobId: string) {
    const claimed = await this.repository.claimJob(jobId, ORGANIZATION_ID);
    if (!claimed) return;
    const version = await this.repository.getVersionForIndexing(versionId, ORGANIZATION_ID);
    if (!version) throw new Error("待索引文档版本不存在。");
    try {
      await this.repository.updateJob(jobId, { progress: 10, label: "解析文件" });
      await this.repository.markVersionIndexing(versionId, ORGANIZATION_ID);
      const extracted = await extractDocumentText({ buffer: version.file_content, mimetype: version.mime_type });
      const chunks = chunkDocumentText(extracted.text, undefined, undefined, extracted.pageRanges);
      if (chunks.length === 0) throw new Error("文档没有可索引的文本内容。");

      await this.repository.updateJob(jobId, { progress: 45, label: "切分内容" });
      const embeddings: number[][] = [];
      for (let index = 0; index < chunks.length; index += 32) {
        embeddings.push(...(await this.embeddingClient.embed(chunks.slice(index, index + 32).map((chunk) => chunk.content))));
      }
      await this.repository.updateJob(jobId, { progress: 78, label: "生成向量" });
      await this.repository.activateVersion(version, chunks, embeddings, this.embeddingClient.model);
      await this.repository.updateJob(jobId, { status: "completed", progress: 100, label: "索引完成" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "索引失败。";
      await this.repository.failVersion(versionId, ORGANIZATION_ID, message);
      throw error;
    }
  }
}

export type RetrievalResult = {
  citations: RagCitation[];
  retrievalLatencyMs: number;
  trace: RagTrace | null;
};

@Injectable()
export class RetrievalService {
  private readonly minScore: number;
  private readonly profile: RetrievalDebug["profile"];

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddingClient: EmbeddingClient,
    configService: ConfigService
  ) {
    this.minScore = Number(configService.get<string>("RAG_MIN_SCORE") ?? DEFAULT_MIN_SCORE);
    this.profile = {
      vectorTopK: Number(configService.get<string>("RAG_VECTOR_TOP_K") ?? DEFAULT_CANDIDATE_K),
      keywordTopK: Number(configService.get<string>("RAG_KEYWORD_TOP_K") ?? DEFAULT_CANDIDATE_K),
      finalTopK: Number(configService.get<string>("RAG_FINAL_TOP_K") ?? DEFAULT_TOP_K),
      minScore: this.minScore,
      rrfK: Number(configService.get<string>("RAG_RRF_K") ?? DEFAULT_RRF_K)
    };
  }

  async retrieve(question: string, knowledgeBaseIds: string[], conversationId: string | null, mode: RetrievalMode = "hybrid"): Promise<RetrievalResult> {
    if (knowledgeBaseIds.length === 0) return { citations: [], retrievalLatencyMs: 0, trace: null };
    const startedAt = Date.now();
    const debug = await this.runRetrieval(question, knowledgeBaseIds, mode, startedAt);
    const citations = debug.finalCandidates.map(toCitation);
    const retrievalLatencyMs = Date.now() - startedAt;
    const trace = await this.repository.insertTrace({
      organizationId: ORGANIZATION_ID,
      conversationId,
      question,
      knowledgeBaseIds,
      citations,
      retrievalLatencyMs,
      answerLatencyMs: null,
      retrievalMode: mode,
      retrievalDebug: debug
    });
    return { citations, retrievalLatencyMs, trace };
  }

  async debug(question: string, knowledgeBaseIds: string[], mode: RetrievalMode = "hybrid"): Promise<RetrievalDebug> {
    if (!question.trim()) throw new BadRequestException("调试问题不能为空。");
    if (knowledgeBaseIds.length === 0) throw new BadRequestException("请选择至少一个知识库。");
    const startedAt = Date.now();
    return this.runRetrieval(question.trim(), knowledgeBaseIds, mode, startedAt);
  }

  private async runRetrieval(question: string, knowledgeBaseIds: string[], mode: RetrievalMode, startedAt: number): Promise<RetrievalDebug> {
    const [embedding] = await this.embeddingClient.embed([question]);
    const [rawVector, rawKeyword] = await Promise.all([
      this.repository.searchVectorChunks(ORGANIZATION_ID, knowledgeBaseIds, embedding, this.profile.vectorTopK),
      mode === "hybrid"
        ? this.repository.searchKeywordChunks(ORGANIZATION_ID, knowledgeBaseIds, question, this.profile.keywordTopK)
        : Promise.resolve([])
    ]);
    const vector = rawVector.filter((candidate) => candidate.score >= this.minScore);
    const finalCandidates = fuseRetrievalCandidates(vector, rawKeyword, this.profile.rrfK, this.profile.finalTopK);
    return {
      question,
      mode,
      profile: this.profile,
      vectorCandidates: vector.map((candidate, index) => candidateForLane(candidate, "vector", index + 1)),
      keywordCandidates: rawKeyword.map((candidate, index) => candidateForLane(candidate, "keyword", index + 1)),
      finalCandidates,
      latencyMs: Date.now() - startedAt
    };
  }

  updateAnswerLatency(traceId: string | undefined, latencyMs: number) {
    return traceId ? this.repository.updateTraceLatency(traceId, latencyMs) : Promise.resolve();
  }
}

type QueuePayload =
  | { type: "document.index"; organizationId: string; resourceId: string; jobId: string }
  | { type: "evaluation.run"; organizationId: string; resourceId: string; jobId: string };

@Injectable()
export class RagTaskService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<QueuePayload> | null = null;
  private worker: Worker<QueuePayload> | null = null;
  private inline = false;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly staleJobMs: number;

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly indexingService: IndexingService,
    @Inject(forwardRef(() => EvaluationService)) private readonly evaluationService: Pick<EvaluationService, "processRun">,
    private readonly configService: ConfigService
  ) {
    this.staleJobMs = Number(configService.get<string>("RAG_JOB_STALE_MS") ?? 300_000);
  }

  async onModuleInit() {
    if ((this.configService.get<string>("RAG_QUEUE_MODE") ?? "bullmq") === "inline") {
      this.inline = true;
      return;
    }
    const connection = redisConnection(this.configService.get<string>("REDIS_URL") ?? "redis://localhost:6379");
    this.queue = new Queue<QueuePayload>("flowmind-rag", { connection });
    this.worker = new Worker<QueuePayload>(
      "flowmind-rag",
      async (job) => {
        if (job.data.type === "document.index") return this.indexingService.process(job.data.resourceId, job.data.jobId);
        return this.evaluationService.processRun(job.data.resourceId, job.data.jobId);
      },
      { connection }
    );
    this.worker.on("failed", (job, error) => {
      if (!job) return;
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < attempts) {
        void this.repository.updateJob(job.data.jobId, { status: "queued", label: `等待重试 ${job.attemptsMade}/${attempts}`, errorMessage: error.message });
      } else {
        void this.repository.updateJob(job.data.jobId, { status: "failed", progress: 100, label: "任务失败", errorMessage: error.message });
      }
    });
    await this.recoverInterruptedJobs();
    this.recoveryTimer = setInterval(() => { void this.recoverInterruptedJobs(); }, Math.max(30_000, this.staleJobMs));
  }

  async onModuleDestroy() {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueDocumentIndex(versionId: string) {
    const job = await this.repository.createJob(ORGANIZATION_ID, "document.index", versionId, "等待索引");
    if (this.inline) {
      void this.indexingService.process(versionId, job.id).catch(() => undefined);
      return job;
    }
    await this.queueOrThrow().add(
      "document.index",
      { type: "document.index", organizationId: ORGANIZATION_ID, resourceId: versionId, jobId: job.id },
      { jobId: job.id, attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 }
    );
    return job;
  }

  async enqueueEvaluation(run: EvaluationRun) {
    const job = await this.repository.createJob(ORGANIZATION_ID, "evaluation.run", run.id, "等待评测");
    if (this.inline) {
      void this.evaluationService.processRun(run.id, job.id).catch(() => undefined);
      return job;
    }
    await this.queueOrThrow().add("evaluation.run", { type: "evaluation.run", organizationId: ORGANIZATION_ID, resourceId: run.id, jobId: job.id });
    return job;
  }

  getJob(jobId: string) {
    return this.repository.getJob(jobId, ORGANIZATION_ID);
  }

  private queueOrThrow() {
    if (!this.queue) throw new Error("任务队列尚未初始化。");
    return this.queue;
  }

  private async recoverInterruptedJobs() {
    if (!this.queue) return;
    let recovered;
    try {
      recovered = await this.repository.recoverStaleDocumentJobs(ORGANIZATION_ID, this.staleJobMs);
    } catch (error) {
      if (isSchemaInitializationRace(error)) return;
      throw error;
    }
    for (const job of recovered) {
      await this.queue.add(
        "document.index.recovered",
        { type: "document.index", organizationId: ORGANIZATION_ID, resourceId: job.resource_id, jobId: job.id },
        { jobId: `${job.id}:recovered:${Date.now()}`, attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 200 }
      );
    }
  }
}

@Injectable()
export class EvaluationService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly retrievalService: RetrievalService,
    @Inject(forwardRef(() => JudgeClient)) private readonly judgeClient: Pick<JudgeClient, "answer" | "score">
  ) {}

  async importDataset(name: string | undefined, file: UploadedDocument | undefined): Promise<EvaluationDataset> {
    if (!file) throw new BadRequestException("请选择 JSON 或 CSV 评测文件。");
    if (!["application/json", "text/csv", "application/vnd.ms-excel"].includes(file.mimetype)) {
      throw new BadRequestException("评测集仅支持 JSON 或 CSV 文件。");
    }
    let cases: Array<Omit<EvaluationCase, "id" | "datasetId">>;
    try {
      cases = parseEvaluationCases(file.buffer.toString("utf8"), file.mimetype);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("评测集格式不正确，请检查 JSON/CSV 字段及证据结构。");
    }
    for (const item of cases) await this.repository.validateEvidence(ORGANIZATION_ID, item.evidence);
    return this.repository.createDataset(ORGANIZATION_ID, name?.trim() || file.originalname, cases);
  }

  listDatasets() {
    return this.repository.listDatasets(ORGANIZATION_ID);
  }

  async createGoldenDatasets(): Promise<EvaluationDataset[]> {
    const existing = await this.repository.listDatasets(ORGANIZATION_ID);
    const created: EvaluationDataset[] = [];
    for (const definition of GOLDEN_DATASET_DEFINITIONS) {
      const current = existing.find((dataset) => dataset.name === definition.name);
      if (current) {
        created.push(current);
        continue;
      }
      const cases = [];
      for (const testCase of definition.cases) {
        const evidence = [];
        for (const expectedQuote of testCase.expectedQuotes) {
          const resolved = await this.repository.findEvidenceDocument(ORGANIZATION_ID, expectedQuote);
          if (!resolved) {
            throw new BadRequestException(`黄金测试集依赖的证据摘录不存在，请先索引产品文档：${expectedQuote}`);
          }
          evidence.push(resolved);
        }
        cases.push({
          question: testCase.question,
          referenceAnswer: testCase.referenceAnswer,
          knowledgeBaseIds: testCase.knowledgeBaseIds,
          evidence
        });
      }
      created.push(await this.repository.createDataset(ORGANIZATION_ID, definition.name, cases));
    }
    return created;
  }

  async startRun(datasetId: string, tasks: RagTaskService, retrievalMode: RetrievalMode = "hybrid") {
    const cases = await this.repository.listCases(datasetId, ORGANIZATION_ID);
    if (cases.length === 0) throw new NotFoundException("评测集不存在或没有可执行样本。");
    const run = await this.repository.createRun(datasetId, ORGANIZATION_ID, retrievalMode);
    const job = await tasks.enqueueEvaluation(run);
    return { run, job };
  }

  getRun(runId: string) {
    return this.repository.getRun(runId, ORGANIZATION_ID);
  }

  listRuns() {
    return this.repository.listRuns(ORGANIZATION_ID);
  }

  getMetrics() {
    return this.repository.getMetrics(ORGANIZATION_ID);
  }

  async processRun(runId: string, jobId: string) {
    const run = await this.repository.getRun(runId, ORGANIZATION_ID);
    if (!run) throw new Error("评测运行不存在。");
    const cases = await this.repository.listCases(run.datasetId, ORGANIZATION_ID);
    const results: EvaluationResult[] = [];
    await this.repository.updateRunStatus(runId, ORGANIZATION_ID, "running");
    await this.repository.updateJob(jobId, { status: "running", progress: 5, label: "执行评测" });
    try {
      for (let index = 0; index < cases.length; index += 1) {
        const testCase = cases[index];
        const retrieved = await this.retrievalService.retrieve(testCase.question, testCase.knowledgeBaseIds, null, run.retrievalMode);
        const answer = retrieved.citations.length === 0
          ? NO_EVIDENCE_ANSWER
          : await this.judgeClient.answer(testCase.question, retrieved.citations);
        const scores = await this.judgeClient.score(testCase, answer, retrieved.citations);
        const retrievedExpectedRank = findEvidenceRank(testCase, retrieved.citations);
        const result: EvaluationResult = {
          id: `result_${randomUUID()}`,
          runId,
          caseId: testCase.id,
          question: testCase.question,
          citations: retrieved.citations,
          answer,
          retrievedExpectedRank,
          groundedness: scores.groundedness,
          answerCorrectness: scores.answerCorrectness
        };
        results.push(result);
        await this.repository.insertResult(ORGANIZATION_ID, runId, testCase.id, result);
        await this.repository.updateJob(jobId, {
          progress: Math.round(((index + 1) / cases.length) * 90),
          label: `评测 ${index + 1}/${cases.length}`
        });
      }
      const current = await this.repository.getMetrics(ORGANIZATION_ID);
      const metrics = calculateEvaluationMetrics(current, results);
      await this.repository.updateRunStatus(runId, ORGANIZATION_ID, "completed", metrics);
      await this.repository.updateJob(jobId, { status: "completed", progress: 100, label: "评测完成" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "评测失败。";
      await this.repository.updateRunStatus(runId, ORGANIZATION_ID, "failed");
      await this.repository.updateJob(jobId, { status: "failed", progress: 100, label: "评测失败", errorMessage: message });
      throw error;
    }
  }
}

export const GOLDEN_DATASET_DEFINITIONS = [
  {
    name: "黄金集-套餐价格",
    cases: [
      {
        question: "专业版每席位每月多少钱，最低采购量是多少？",
        referenceAnswer: "专业版价格为每席位每月 99 元，按年签约，最低采购量为 20 个席位。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["- 价格：每席位每月 99 元，按年签约。", "- 最低采购量：20 个席位。"]
      },
      {
        question: "企业版包含哪些服务承诺？",
        referenceAnswer: "企业版包含专属上线顾问与季度质量复盘，并支持工作日 4 小时首次响应的高级支持服务。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["- 包含专属上线顾问与季度质量复盘。", "- 支持工作日 4 小时首次响应的高级支持服务。"]
      },
      {
        question: "新客户试用政策是什么？",
        referenceAnswer: "新客户可申请 14 天试用，最多 30 个账号；试用环境不承诺生产级 SLA，试用到期后文档保留 7 天供导出，之后自动删除。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: [
          "试用政策：新客户可申请 14 天试用，最多 30 个账号。",
          "试用环境不承诺生产级 SLA。",
          "试用到期后，文档保留 7 天供导出，之后自动删除。"
        ]
      }
    ]
  },
  {
    name: "黄金集-知识库与安全",
    cases: [
      {
        question: "聊天会话绑定多个知识库后，修改选择会影响历史回答吗？",
        referenceAnswer: "不会。每个聊天会话可同时绑定多个知识库，知识库选择变更只影响后续新问题，不会改写历史回答。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["每个聊天会话可同时绑定多个知识库，知识库选择的变更只影响后续新问题，不会改写历史回答。"]
      },
      {
        question: "上传文档后系统如何建立检索能力？",
        referenceAnswer: "上传文档后，系统会进行解析、分块和向量索引；默认每块最多 800 个字符，前后相邻分块保留 120 个字符重叠，聊天检索默认获取最相关的前 5 个片段。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: [
          "上传文档后系统进行解析、分块和向量索引。默认分块策略为每块最多 800 个字符，前后相邻分块保留 120 个字符重叠。",
          "聊天检索默认获取最相关的前 5 个片段。"
        ]
      },
      {
        question: "系统如何处理跨组织数据隔离和删除后的文档？",
        referenceAnswer: "生产环境数据默认保存在客户所属组织的隔离空间，跨组织不可检索；文档删除后会立即从新检索结果中移除，并在 30 天内从备份轮换中清理。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: [
          "生产环境数据默认保存于客户所属组织的隔离空间，跨组织不可检索。",
          "文档删除后会立即从新的检索结果中移除，并在 30 天内从备份轮换中清理。"
        ]
      }
    ]
  },
  {
    name: "黄金集-SLA与格式支持",
    cases: [
      {
        question: "企业版生产环境服务可用性目标是多少？",
        referenceAnswer: "企业版生产环境服务可用性目标为每自然月 99.9%。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["企业版生产环境服务可用性目标为每自然月 99.9%。"]
      },
      {
        question: "当前版本是否支持 DOCX 上传？",
        referenceAnswer: "首版不支持 DOCX，支持的上传格式仅为 PDF、Markdown 和 TXT。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["首版不支持 DOCX。支持的上传格式仅为 PDF、Markdown 和 TXT。"]
      },
      {
        question: "小于 5 MB 的 Markdown 文档通常多久完成索引？",
        referenceAnswer: "小于 5 MB 的纯文本或 Markdown 文档通常会在 1 分钟内完成索引。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["小于 5 MB 的纯文本或 Markdown 文档通常会在 1 分钟内完成索引。"]
      }
    ]
  },
  {
    name: "黄金集-语义改写",
    cases: [
      {
        question: "我们只买 19 个专业版账号行不行？",
        referenceAnswer: "不行。专业版最低采购量是 20 个席位，19 个席位低于最低采购量。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["- 最低采购量：20 个席位。"]
      },
      {
        question: "我在聊天里换了知识库，之前 AI 已经给出的内容会跟着变吗？",
        referenceAnswer: "不会。知识库选择变更只影响后续新问题，不会改写历史回答。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["每个聊天会话可同时绑定多个知识库，知识库选择的变更只影响后续新问题，不会改写历史回答。"]
      },
      {
        question: "服务一个月最多可以宕机多久？我只想知道合同承诺的可用性指标。",
        referenceAnswer: "合同承诺的企业版生产环境服务可用性目标为每自然月 99.9%；具体可用分钟数取决于该自然月的总分钟数。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["企业版生产环境服务可用性目标为每自然月 99.9%。"]
      }
    ]
  },
  {
    name: "黄金集-多证据推理",
    cases: [
      {
        question: "按最低采购量买专业版并签一年，基础席位费合计多少？",
        referenceAnswer: "按每席位每月 99 元、最低 20 席位、12 个月计算，基础席位费合计 23,760 元。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["- 价格：每席位每月 99 元，按年签约。", "- 最低采购量：20 个席位。"]
      },
      {
        question: "新客试用账号上限比专业版最低采购席位多几个？",
        referenceAnswer: "试用最多 30 个账号，专业版最低采购 20 个席位，因此多 10 个。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["试用政策：新客户可申请 14 天试用，最多 30 个账号。", "- 最低采购量：20 个席位。"]
      },
      {
        question: "4 MB 的 Markdown 文件是否支持上传，通常多久能建好索引？",
        referenceAnswer: "支持。Markdown 属于支持的上传格式；4 MB 小于 5 MB，通常会在 1 分钟内完成索引。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: [
          "首版不支持 DOCX。支持的上传格式仅为 PDF、Markdown 和 TXT。",
          "小于 5 MB 的纯文本或 Markdown 文档通常会在 1 分钟内完成索引。"
        ]
      }
    ]
  },
  {
    name: "黄金集-边界与否定",
    cases: [
      {
        question: "新客户能不能给 31 个账号开 14 天试用？",
        referenceAnswer: "不能按标准试用政策开通。试用期可以是 14 天，但账号上限为 30 个，31 个超出上限 1 个。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["试用政策：新客户可申请 14 天试用，最多 30 个账号。"]
      },
      {
        question: "一个 2 MB 的 DOCX 很小，是否因此可以上传并在一分钟内索引？",
        referenceAnswer: "不可以。文件小于 5 MB 不会改变格式限制：首版不支持 DOCX，因此不能据此承诺一分钟内完成索引。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: [
          "首版不支持 DOCX。支持的上传格式仅为 PDF、Markdown 和 TXT。",
          "小于 5 MB 的纯文本或 Markdown 文档通常会在 1 分钟内完成索引。"
        ]
      },
      {
        question: "企业版 4 小时响应是不是意味着故障必须在 4 小时内修复？",
        referenceAnswer: "不是。文档承诺的是工作日 4 小时内首次响应，并没有承诺 4 小时内修复。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["- 支持工作日 4 小时首次响应的高级支持服务。"]
      }
    ]
  },
  {
    name: "黄金集-时间与保留策略",
    cases: [
      {
        question: "删除一份生产文档后，它还会继续被搜到 30 天吗？",
        referenceAnswer: "不会。文档会立即从新的检索结果中移除；30 天指的是从备份轮换中清理的期限。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["文档删除后会立即从新的检索结果中移除，并在 30 天内从备份轮换中清理。"]
      },
      {
        question: "试用结束后第 8 天还能导出原来的文档吗？",
        referenceAnswer: "按标准策略不能。试用到期后文档只保留 7 天供导出，之后会自动删除。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["试用到期后，文档保留 7 天供导出，之后自动删除。"]
      },
      {
        question: "试用环境也享有每月 99.9% 的生产 SLA 吗？",
        referenceAnswer: "不享有。99.9% 是企业版生产环境的可用性目标，试用环境不承诺生产级 SLA。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["试用环境不承诺生产级 SLA。", "企业版生产环境服务可用性目标为每自然月 99.9%。"]
      }
    ]
  },
  {
    name: "黄金集-相似概念抗干扰",
    cases: [
      {
        question: "30 这个数字在数据删除政策里代表什么？",
        referenceAnswer: "在数据删除政策里，30 指文档删除后会在 30 天内从备份轮换中清理，不是试用账号数量。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["文档删除后会立即从新的检索结果中移除，并在 30 天内从备份轮换中清理。"]
      },
      {
        question: "高级支持里的 4 小时和文档索引耗时分别指什么？",
        referenceAnswer: "4 小时指企业版高级支持在工作日的首次响应时间；小于 5 MB 的纯文本或 Markdown 文档通常在 1 分钟内完成索引。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: [
          "- 支持工作日 4 小时首次响应的高级支持服务。",
          "小于 5 MB 的纯文本或 Markdown 文档通常会在 1 分钟内完成索引。"
        ]
      },
      {
        question: "20 和 30 在账号政策中分别是什么门槛？",
        referenceAnswer: "20 是专业版的最低采购席位数，30 是新客户试用的账号上限。",
        knowledgeBaseIds: ["kb_1"],
        expectedQuotes: ["- 最低采购量：20 个席位。", "试用政策：新客户可申请 14 天试用，最多 30 个账号。"]
      }
    ]
  }
];

@Injectable()
export class JudgeClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(configService: ConfigService) {
    this.baseUrl = (configService.get<string>("LLM_BASE_URL") ?? configService.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.apiKey = configService.get<string>("LLM_API_KEY") ?? configService.get<string>("OPENAI_API_KEY") ?? "";
    this.model = configService.get<string>("LLM_MODEL") ?? configService.get<string>("OPENAI_MODEL") ?? "gpt-4.1-mini";
  }

  answer(question: string, citations: RagCitation[]) {
    return this.complete([
      { role: "system", content: "仅依据提供的知识片段回答问题，并保持简洁。证据不足时明确说明。" },
      { role: "user", content: `${formatContext(citations)}\n\n问题：${question}` }
    ]);
  }

  async score(testCase: EvaluationCase, answer: string, citations: RagCitation[]) {
    const raw = await this.complete([
      { role: "system", content: "你是 RAG 质量评审。仅输出 JSON：{\"groundedness\":0到1,\"answerCorrectness\":0到1}。" },
      {
        role: "user",
        content: `问题：${testCase.question}\n参考答案：${testCase.referenceAnswer}\n回答：${answer}\n引用：${citations.map((citation) => citation.quote).join("\n")}`
      }
    ]);
    try {
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "") as { groundedness?: number; answerCorrectness?: number };
      return { groundedness: clampScore(parsed.groundedness), answerCorrectness: clampScore(parsed.answerCorrectness) };
    } catch {
      return { groundedness: null, answerCorrectness: null };
    }
  }

  private async complete(messages: Array<{ role: string; content: string }>) {
    if (!this.apiKey) throw new Error("LLM_API_KEY 未配置，无法运行评测任务。");
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, temperature: 0, messages })
    });
    if (!response.ok) throw new Error(`Evaluation LLM request failed with ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content?.trim() ?? "";
  }
}

const datasetCaseSchema = z.object({
  question: z.string().min(1),
  referenceAnswer: z.string().min(1),
  knowledgeBaseIds: z.array(z.string()).min(1),
  evidence: z.array(z.object({ documentId: z.string(), expectedQuote: z.string().min(1) })).min(1)
});

export function parseEvaluationCases(content: string, mimeType: string): Array<Omit<EvaluationCase, "id" | "datasetId">> {
  if (mimeType === "application/json") {
    const payload = JSON.parse(content) as unknown;
    return z.array(datasetCaseSchema).parse(Array.isArray(payload) ? payload : (payload as { cases?: unknown }).cases);
  }
  const rows = parseCsv(content);
  if (rows.length < 2) throw new BadRequestException("CSV 评测集必须包含表头和至少一条样本。");
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    return datasetCaseSchema.parse({
      question: item.question,
      referenceAnswer: item.referenceAnswer,
      knowledgeBaseIds: item.knowledgeBaseIds.split("|").filter(Boolean),
      evidence: JSON.parse(item.evidence)
    });
  });
}

export function calculateEvaluationMetrics(base: RagMetrics, results: EvaluationResult[]): RagMetrics {
  const hits = results.filter((result) => result.retrievedExpectedRank !== null);
  const cited = results.filter((result) => result.citations.length > 0);
  const groundedness = results.flatMap((result) => result.groundedness == null ? [] : [result.groundedness]);
  const correctness = results.flatMap((result) => result.answerCorrectness == null ? [] : [result.answerCorrectness]);
  return {
    ...base,
    recallAt5: results.length ? round(hits.length / results.length) : null,
    mrrAt5: results.length ? round(results.reduce((sum, result) => sum + (result.retrievedExpectedRank ? 1 / result.retrievedExpectedRank : 0), 0) / results.length) : null,
    citationCoverage: results.length ? round(cited.length / results.length) : null,
    citationCorrectness: cited.length ? round(hits.length / cited.length) : null,
    groundedness: groundedness.length ? round(average(groundedness)) : null,
    answerCorrectness: correctness.length ? round(average(correctness)) : null
  };
}

export function findEvidenceRank(testCase: EvaluationCase, citations: RagCitation[]) {
  const index = citations.findIndex((citation) =>
    testCase.evidence.some((item) =>
      item.documentId === citation.documentId
      && normalizeText(citation.quote).includes(normalizeText(item.expectedQuote))
    )
  );
  return index === -1 ? null : index + 1;
}
export function fuseRetrievalCandidates(
  vectorCandidates: Array<RagCitation & { documentVersion: number }>,
  keywordCandidates: Array<RagCitation & { documentVersion: number }>,
  rrfK = DEFAULT_RRF_K,
  limit = DEFAULT_TOP_K
): RetrievalCandidate[] {
  const candidates = new Map<string, {
    candidate: RagCitation & { documentVersion: number };
    vectorRank: number | null;
    keywordRank: number | null;
    vectorScore: number | null;
    keywordScore: number | null;
  }>();
  vectorCandidates.forEach((candidate, index) => {
    candidates.set(candidate.chunkId, { candidate, vectorRank: index + 1, keywordRank: null, vectorScore: candidate.score, keywordScore: null });
  });
  keywordCandidates.forEach((candidate, index) => {
    const current = candidates.get(candidate.chunkId);
    candidates.set(candidate.chunkId, current
      ? { ...current, keywordRank: index + 1, keywordScore: candidate.score }
      : { candidate, vectorRank: null, keywordRank: index + 1, vectorScore: null, keywordScore: candidate.score });
  });
  const lanes = keywordCandidates.length > 0 ? 2 : 1;
  const maximum = lanes / (rrfK + 1);
  return [...candidates.values()]
    .map((item) => {
      const raw = (item.vectorRank ? 1 / (rrfK + item.vectorRank) : 0) + (item.keywordRank ? 1 / (rrfK + item.keywordRank) : 0);
      const fusedScore = maximum ? Number((raw / maximum).toFixed(4)) : 0;
      return {
        ...toCitation(item.candidate),
        score: fusedScore,
        vectorRank: item.vectorRank,
        keywordRank: item.keywordRank,
        vectorScore: item.vectorScore,
        keywordScore: item.keywordScore,
        fusedScore,
        documentVersion: item.candidate.documentVersion
      };
    })
    .sort((left, right) => right.fusedScore - left.fusedScore || (left.vectorRank ?? 9999) - (right.vectorRank ?? 9999))
    .slice(0, limit);
}
function candidateForLane(candidate: RagCitation & { documentVersion: number }, lane: "vector" | "keyword", rank: number): RetrievalCandidate {
  return {
    ...toCitation(candidate),
    vectorRank: lane === "vector" ? rank : null,
    keywordRank: lane === "keyword" ? rank : null,
    vectorScore: lane === "vector" ? candidate.score : null,
    keywordScore: lane === "keyword" ? candidate.score : null,
    fusedScore: candidate.score,
    documentVersion: candidate.documentVersion
  };
}
function toCitation(candidate: RagCitation): RagCitation {
  return { chunkId: candidate.chunkId, documentId: candidate.documentId, documentName: candidate.documentName, quote: candidate.quote, score: candidate.score };
}
function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
function formatContext(citations: RagCitation[]) {
  return citations.map((citation, index) => `[${index + 1}] ${citation.documentName}\n${citation.quote}`).join("\n\n");
}
function clampScore(value: unknown): number | null {
  return typeof value === "number" ? Math.min(1, Math.max(0, value)) : null;
}
function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function round(value: number) {
  return Number(value.toFixed(4));
}
function redisConnection(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1) || 0) : 0,
    maxRetriesPerRequest: null
  };
}
function isSchemaInitializationRace(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "42703" || error.code === "42P01");
}
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "\"") {
      if (quoted && content[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}
