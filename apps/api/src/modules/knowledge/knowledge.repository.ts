import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  DocumentIndexJob,
  EvaluationCase,
  EvaluationDataset,
  EvaluationEvidence,
  EvaluationResult,
  EvaluationRun,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  RagCitation,
  RagMetrics,
  RagTrace
} from "@flowmind/shared";
import type { ParsedChunk, UploadedDocument } from "./document-processing";

type QueryResult<T> = { rows: T[] };
type Queryable = { query<T = unknown>(sql: string, values?: unknown[]): Promise<QueryResult<T>> };
type PgPool = Queryable & { end(): Promise<void> };
const { Pool } = require("pg") as { Pool: new (config: { connectionString: string }) => PgPool };

const DEFAULT_KNOWLEDGE_BASE_ID = "kb_1";

@Injectable()
export class KnowledgeRepository implements OnModuleDestroy {
  private readonly pool: PgPool;
  private vectorStorage = false;

  constructor(configService: ConfigService) {
    this.pool = new Pool({
      connectionString: configService.get<string>("DATABASE_URL") ?? "postgresql://flowmind:flowmind@localhost:5432/flowmind"
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async ensureSchema(organizationId: string) {
    let vectorExtension = false;
    try {
      await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
      vectorExtension = true;
    } catch (error) {
      if (!isUnavailableVectorExtension(error)) throw error;
    }
    const embeddingType = vectorExtension ? "vector(1536)" : "jsonb";
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        name text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        file_content bytea NOT NULL,
        status text NOT NULL CHECK (status IN ('uploaded', 'parsing', 'indexed', 'failed')),
        error_message text,
        embedding_model text,
        uploaded_at timestamptz NOT NULL DEFAULT now(),
        indexed_at timestamptz,
        deleted_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        document_id text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        content text NOT NULL,
        page_number integer,
        start_offset integer NOT NULL,
        end_offset integer NOT NULL,
        embedding ${embeddingType} NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (document_id, chunk_index)
      );
      CREATE TABLE IF NOT EXISTS rag_jobs (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        type text NOT NULL CHECK (type IN ('document.index', 'evaluation.run')),
        resource_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        progress integer NOT NULL DEFAULT 0,
        label text NOT NULL,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS rag_traces (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        conversation_id text,
        question text NOT NULL,
        knowledge_base_ids text[] NOT NULL,
        citations jsonb NOT NULL DEFAULT '[]'::jsonb,
        retrieval_latency_ms integer NOT NULL,
        answer_latency_ms integer,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS evaluation_datasets (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS evaluation_cases (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        dataset_id text NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
        question text NOT NULL,
        reference_answer text NOT NULL,
        knowledge_base_ids text[] NOT NULL,
        evidence jsonb NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evaluation_runs (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        dataset_id text NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
        status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        metrics jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS evaluation_results (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        run_id text NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
        case_id text NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
        question text NOT NULL,
        citations jsonb NOT NULL DEFAULT '[]'::jsonb,
        answer text NOT NULL,
        retrieved_expected_rank integer,
        groundedness double precision,
        answer_correctness double precision
      );
    `);
    const embeddingColumn = await this.pool.query<{ udt_name: string }>(
      `SELECT udt_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'knowledge_chunks' AND column_name = 'embedding'`
    );
    const embeddingTypeName = embeddingColumn.rows[0]?.udt_name;
    if (vectorExtension && embeddingTypeName && embeddingTypeName !== "vector") {
      await this.pool.query(
        "ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536) USING embedding::text::vector(1536);"
      );
      this.vectorStorage = true;
    } else {
      this.vectorStorage = embeddingTypeName === "vector";
    }
    await this.pool.query("ALTER TABLE evaluation_cases ADD COLUMN IF NOT EXISTS organization_id text;");
    await this.pool.query("UPDATE evaluation_cases c SET organization_id = d.organization_id FROM evaluation_datasets d WHERE c.dataset_id = d.id AND c.organization_id IS NULL;");
    await this.pool.query("ALTER TABLE evaluation_cases ALTER COLUMN organization_id SET NOT NULL;");
    await this.pool.query("ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS organization_id text;");
    await this.pool.query("UPDATE evaluation_results r SET organization_id = u.organization_id FROM evaluation_runs u WHERE r.run_id = u.id AND r.organization_id IS NULL;");
    await this.pool.query("ALTER TABLE evaluation_results ALTER COLUMN organization_id SET NOT NULL;");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_documents_base ON knowledge_documents (organization_id, knowledge_base_id, uploaded_at DESC) WHERE deleted_at IS NULL;");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_chunks_scope ON knowledge_chunks (organization_id, knowledge_base_id, document_id);");
    if (this.vectorStorage) {
      await this.pool.query("CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);");
    }
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_jobs_resource ON rag_jobs (organization_id, resource_id, created_at DESC);");
    await this.pool.query(
      `INSERT INTO knowledge_bases (id, organization_id, name, description)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_KNOWLEDGE_BASE_ID, organizationId, "产品文档", "默认知识库"]
    );
  }

  async listBases(organizationId: string): Promise<KnowledgeBase[]> {
    const result = await this.pool.query<BaseRow>(
      `SELECT b.id, b.organization_id, b.name, b.description, b.created_at, b.updated_at,
              count(d.id)::int AS document_count
       FROM knowledge_bases b
       LEFT JOIN knowledge_documents d ON d.knowledge_base_id = b.id AND d.deleted_at IS NULL
       WHERE b.organization_id = $1
       GROUP BY b.id ORDER BY b.updated_at DESC`,
      [organizationId]
    );
    return result.rows.map(toBase);
  }

  async createBase(organizationId: string, input: { name: string; description?: string }): Promise<KnowledgeBase> {
    const id = `kb_${randomUUID()}`;
    const result = await this.pool.query<BaseRow>(
      `INSERT INTO knowledge_bases (id, organization_id, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, organization_id, name, description, created_at, updated_at, 0::int AS document_count`,
      [id, organizationId, input.name, input.description ?? ""]
    );
    return toBase(result.rows[0]);
  }

  async updateBase(id: string, organizationId: string, input: { name?: string; description?: string }): Promise<KnowledgeBase | null> {
    const result = await this.pool.query<BaseRow>(
      `UPDATE knowledge_bases SET name = COALESCE($3, name), description = COALESCE($4, description), updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, organization_id, name, description, created_at, updated_at,
         (SELECT count(*)::int FROM knowledge_documents WHERE knowledge_base_id = $1 AND deleted_at IS NULL) AS document_count`,
      [id, organizationId, input.name ?? null, input.description ?? null]
    );
    return result.rows[0] ? toBase(result.rows[0]) : null;
  }

  async deleteBase(id: string, organizationId: string) {
    await this.pool.query("DELETE FROM knowledge_bases WHERE id = $1 AND organization_id = $2 AND id <> $3", [id, organizationId, DEFAULT_KNOWLEDGE_BASE_ID]);
  }

  async listDocuments(knowledgeBaseId: string, organizationId: string): Promise<KnowledgeDocument[]> {
    const result = await this.pool.query<DocumentRow>(
      `${DOCUMENT_SELECT}
       WHERE d.organization_id = $1 AND d.knowledge_base_id = $2 AND d.deleted_at IS NULL
       GROUP BY d.id ORDER BY d.uploaded_at DESC`,
      [organizationId, knowledgeBaseId]
    );
    return result.rows.map(toDocument);
  }

  async createDocument(knowledgeBaseId: string, organizationId: string, file: UploadedDocument): Promise<KnowledgeDocument> {
    const id = `doc_${randomUUID()}`;
    const result = await this.pool.query<DocumentRow>(
      `INSERT INTO knowledge_documents (id, organization_id, knowledge_base_id, name, mime_type, size_bytes, file_content, status)
       SELECT $1, $2, id, $4, $5, $6, $7, 'uploaded'
       FROM knowledge_bases WHERE id = $3 AND organization_id = $2
       RETURNING id, organization_id, knowledge_base_id, name, mime_type, size_bytes, status, error_message, embedding_model,
         uploaded_at, indexed_at, 0::int AS chunk_count`,
      [id, organizationId, knowledgeBaseId, file.originalname, file.mimetype, file.size, file.buffer]
    );
    if (!result.rows[0]) throw new Error("知识库不存在。");
    return toDocument(result.rows[0]);
  }

  async getDocumentForIndexing(id: string, organizationId: string): Promise<DocumentFileRow | null> {
    const result = await this.pool.query<DocumentFileRow>(
      `SELECT id, organization_id, knowledge_base_id, name, mime_type, size_bytes, file_content, status, error_message, embedding_model, uploaded_at, indexed_at
       FROM knowledge_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    );
    return result.rows[0] ?? null;
  }

  async markDocumentProcessing(id: string, organizationId: string) {
    await this.pool.query("UPDATE knowledge_documents SET status = 'parsing', error_message = NULL WHERE id = $1 AND organization_id = $2", [id, organizationId]);
  }

  async replaceChunks(document: DocumentFileRow, chunks: ParsedChunk[], embeddings: number[][], embeddingModel: string) {
    await this.pool.query("DELETE FROM knowledge_chunks WHERE document_id = $1 AND organization_id = $2", [document.id, document.organization_id]);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const embeddingExpression = this.vectorStorage ? "$10::vector" : "$10::jsonb";
      await this.pool.query(
        `INSERT INTO knowledge_chunks
          (id, organization_id, knowledge_base_id, document_id, chunk_index, content, page_number, start_offset, end_offset, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${embeddingExpression})`,
        [
          `chunk_${randomUUID()}`,
          document.organization_id,
          document.knowledge_base_id,
          document.id,
          chunk.chunkIndex,
          chunk.content,
          chunk.pageNumber,
          chunk.startOffset,
          chunk.endOffset,
          this.vectorStorage ? vectorLiteral(embeddings[index]) : JSON.stringify(embeddings[index])
        ]
      );
    }
    await this.pool.query(
      "UPDATE knowledge_documents SET status = 'indexed', indexed_at = now(), embedding_model = $3, error_message = NULL WHERE id = $1 AND organization_id = $2",
      [document.id, document.organization_id, embeddingModel]
    );
  }

  async failDocument(id: string, organizationId: string, message: string) {
    await this.pool.query("UPDATE knowledge_documents SET status = 'failed', error_message = $3 WHERE id = $1 AND organization_id = $2", [id, organizationId, message]);
  }

  async listChunks(documentId: string, organizationId: string): Promise<KnowledgeChunk[]> {
    const result = await this.pool.query<ChunkRow>(
      `SELECT c.id, c.organization_id, c.knowledge_base_id, c.document_id, d.name AS document_name, c.chunk_index,
              c.content, c.page_number, c.start_offset, c.end_offset
       FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
       WHERE c.document_id = $1 AND c.organization_id = $2 ORDER BY c.chunk_index`,
      [documentId, organizationId]
    );
    return result.rows.map(toChunk);
  }

  async deleteDocument(id: string, organizationId: string) {
    await this.pool.query("UPDATE knowledge_documents SET deleted_at = now() WHERE id = $1 AND organization_id = $2", [id, organizationId]);
  }

  async searchChunks(organizationId: string, knowledgeBaseIds: string[], embedding: number[], limit: number): Promise<RagCitation[]> {
    if (knowledgeBaseIds.length === 0) return [];
    if (!this.vectorStorage) {
      const result = await this.pool.query<JsonCitationRow>(
        `SELECT c.id AS chunk_id, d.id AS document_id, d.name AS document_name, c.content, c.embedding
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE c.organization_id = $1 AND c.knowledge_base_id = ANY($2::text[]) AND d.deleted_at IS NULL AND d.status = 'indexed'`,
        [organizationId, knowledgeBaseIds]
      );
      return result.rows
        .map((row) => ({
          chunkId: row.chunk_id,
          documentId: row.document_id,
          documentName: row.document_name,
          quote: row.content,
          score: Number(cosineSimilarity(jsonValue<number[]>(row.embedding), embedding).toFixed(4))
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    }
    const result = await this.pool.query<CitationRow>(
      `SELECT c.id AS chunk_id, d.id AS document_id, d.name AS document_name, c.content,
              1 - (c.embedding <=> $3::vector) AS score
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE c.organization_id = $1 AND c.knowledge_base_id = ANY($2::text[]) AND d.deleted_at IS NULL AND d.status = 'indexed'
       ORDER BY c.embedding <=> $3::vector LIMIT $4`,
      [organizationId, knowledgeBaseIds, vectorLiteral(embedding), limit]
    );
    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentName: row.document_name,
      quote: row.content,
      score: Number(Number(row.score).toFixed(4))
    }));
  }

  async createJob(organizationId: string, type: DocumentIndexJob["type"], resourceId: string, label: string): Promise<DocumentIndexJob> {
    const id = `job_${randomUUID()}`;
    const result = await this.pool.query<JobRow>(
      `INSERT INTO rag_jobs (id, organization_id, type, resource_id, status, progress, label)
       VALUES ($1, $2, $3, $4, 'queued', 0, $5) RETURNING *`,
      [id, organizationId, type, resourceId, label]
    );
    return toJob(result.rows[0]);
  }

  async updateJob(id: string, input: { status?: DocumentIndexJob["status"]; progress?: number; label?: string; errorMessage?: string | null }) {
    await this.pool.query(
      `UPDATE rag_jobs SET status = COALESCE($2, status), progress = COALESCE($3, progress),
       label = COALESCE($4, label), error_message = $5, updated_at = now() WHERE id = $1`,
      [id, input.status ?? null, input.progress ?? null, input.label ?? null, input.errorMessage ?? null]
    );
  }

  async getJob(id: string, organizationId: string): Promise<DocumentIndexJob | null> {
    const result = await this.pool.query<JobRow>("SELECT * FROM rag_jobs WHERE id = $1 AND organization_id = $2", [id, organizationId]);
    return result.rows[0] ? toJob(result.rows[0]) : null;
  }

  async insertTrace(input: Omit<RagTrace, "id" | "createdAt">): Promise<RagTrace> {
    const id = `trace_${randomUUID()}`;
    const result = await this.pool.query<TraceRow>(
      `INSERT INTO rag_traces (id, organization_id, conversation_id, question, knowledge_base_ids, citations, retrieval_latency_ms, answer_latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) RETURNING *`,
      [id, input.organizationId, input.conversationId, input.question, input.knowledgeBaseIds, JSON.stringify(input.citations), input.retrievalLatencyMs, input.answerLatencyMs]
    );
    return toTrace(result.rows[0]);
  }

  async updateTraceLatency(id: string, answerLatencyMs: number) {
    await this.pool.query("UPDATE rag_traces SET answer_latency_ms = $2 WHERE id = $1", [id, answerLatencyMs]);
  }

  async validateEvidence(organizationId: string, evidence: EvaluationEvidence[]) {
    for (const item of evidence) {
      const result = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM knowledge_chunks c
          JOIN knowledge_documents d ON d.id = c.document_id
          WHERE d.id = $1 AND d.organization_id = $2 AND d.status = 'indexed' AND c.content LIKE '%' || $3 || '%'
        ) AS exists`,
        [item.documentId, organizationId, item.expectedQuote]
      );
      if (!result.rows[0]?.exists) throw new BadRequestException(`证据摘录未在已索引文档 ${item.documentId} 中找到。`);
    }
  }

  async createDataset(organizationId: string, name: string, cases: Array<Omit<EvaluationCase, "id" | "datasetId">>): Promise<EvaluationDataset> {
    const datasetId = `evalset_${randomUUID()}`;
    const result = await this.pool.query<DatasetRow>(
      "INSERT INTO evaluation_datasets (id, organization_id, name) VALUES ($1, $2, $3) RETURNING id, organization_id, name, created_at",
      [datasetId, organizationId, name]
    );
    for (const item of cases) {
      await this.pool.query(
        `INSERT INTO evaluation_cases (id, organization_id, dataset_id, question, reference_answer, knowledge_base_ids, evidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [`case_${randomUUID()}`, organizationId, datasetId, item.question, item.referenceAnswer, item.knowledgeBaseIds, JSON.stringify(item.evidence)]
      );
    }
    return { ...toDataset(result.rows[0]), caseCount: cases.length };
  }

  async listDatasets(organizationId: string): Promise<EvaluationDataset[]> {
    const result = await this.pool.query<DatasetRow & { case_count: number }>(
      `SELECT d.id, d.organization_id, d.name, d.created_at, count(c.id)::int AS case_count
       FROM evaluation_datasets d LEFT JOIN evaluation_cases c ON c.dataset_id = d.id AND c.organization_id = d.organization_id
       WHERE d.organization_id = $1 GROUP BY d.id ORDER BY d.created_at DESC`,
      [organizationId]
    );
    return result.rows.map((row) => ({ ...toDataset(row), caseCount: row.case_count }));
  }

  async findEvidenceDocument(organizationId: string, expectedQuote: string): Promise<EvaluationEvidence | null> {
    const result = await this.pool.query<{ document_id: string }>(
      `SELECT d.id AS document_id
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE d.organization_id = $1
         AND d.status = 'indexed'
         AND d.deleted_at IS NULL
         AND c.content LIKE '%' || $2 || '%'
       ORDER BY d.uploaded_at DESC, c.chunk_index ASC
       LIMIT 1`,
      [organizationId, expectedQuote]
    );
    return result.rows[0] ? { documentId: result.rows[0].document_id, expectedQuote } : null;
  }

  async listCases(datasetId: string, organizationId: string): Promise<EvaluationCase[]> {
    const result = await this.pool.query<EvaluationCaseRow>(
      `SELECT c.* FROM evaluation_cases c JOIN evaluation_datasets d ON d.id = c.dataset_id
       WHERE c.dataset_id = $1 AND c.organization_id = $2 AND d.organization_id = $2`,
      [datasetId, organizationId]
    );
    return result.rows.map(toEvaluationCase);
  }

  async createRun(datasetId: string, organizationId: string): Promise<EvaluationRun> {
    const id = `run_${randomUUID()}`;
    const result = await this.pool.query<RunRow>(
      `INSERT INTO evaluation_runs (id, organization_id, dataset_id, status) VALUES ($1, $2, $3, 'queued') RETURNING *`,
      [id, organizationId, datasetId]
    );
    return toRun(result.rows[0], []);
  }

  async updateRunStatus(id: string, organizationId: string, status: EvaluationRun["status"], metrics: RagMetrics | null = null) {
    await this.pool.query(
      `UPDATE evaluation_runs SET status = $3, metrics = $4::jsonb,
       completed_at = CASE WHEN $3 IN ('completed', 'failed') THEN now() ELSE completed_at END
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId, status, metrics ? JSON.stringify(metrics) : null]
    );
  }

  async insertResult(organizationId: string, runId: string, caseId: string, input: Omit<EvaluationResult, "id" | "runId" | "caseId">) {
    await this.pool.query(
      `INSERT INTO evaluation_results
        (id, organization_id, run_id, case_id, question, citations, answer, retrieved_expected_rank, groundedness, answer_correctness)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
      [`result_${randomUUID()}`, organizationId, runId, caseId, input.question, JSON.stringify(input.citations), input.answer, input.retrievedExpectedRank, input.groundedness, input.answerCorrectness]
    );
  }

  async getRun(id: string, organizationId: string): Promise<EvaluationRun | null> {
    const runResult = await this.pool.query<RunRow>("SELECT * FROM evaluation_runs WHERE id = $1 AND organization_id = $2", [id, organizationId]);
    if (!runResult.rows[0]) return null;
    const results = await this.pool.query<EvaluationResultRow>("SELECT * FROM evaluation_results WHERE run_id = $1 AND organization_id = $2", [id, organizationId]);
    return toRun(runResult.rows[0], results.rows.map(toEvaluationResult));
  }

  async listRuns(organizationId: string): Promise<EvaluationRun[]> {
    const result = await this.pool.query<RunRow>(
      "SELECT * FROM evaluation_runs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 10",
      [organizationId]
    );
    return result.rows.map((row) => toRun(row, []));
  }

  async getMetrics(organizationId: string): Promise<RagMetrics> {
    const documents = await this.pool.query<{ indexed: number; failed: number; total: number; average_latency: number; p95_latency: number }>(
      `SELECT count(*) FILTER (WHERE status = 'indexed')::int AS indexed,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              count(*)::int AS total,
              COALESCE(avg(EXTRACT(EPOCH FROM (indexed_at - uploaded_at)) * 1000) FILTER (WHERE indexed_at IS NOT NULL), 0)::float AS average_latency,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (indexed_at - uploaded_at)) * 1000) FILTER (WHERE indexed_at IS NOT NULL), 0)::float AS p95_latency
       FROM knowledge_documents WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const run = await this.pool.query<{ metrics: RagMetrics | string | null }>(
      "SELECT metrics FROM evaluation_runs WHERE organization_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
      [organizationId]
    );
    const trace = await this.pool.query<{ p95_retrieval: number | null; p95_answer: number | null }>(
      `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY retrieval_latency_ms)::float AS p95_retrieval,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY answer_latency_ms)::float AS p95_answer
       FROM rag_traces WHERE organization_id = $1`,
      [organizationId]
    );
    const doc = documents.rows[0];
    const evaluation = typeof run.rows[0]?.metrics === "string" ? JSON.parse(run.rows[0].metrics) as RagMetrics : run.rows[0]?.metrics;
    return {
      indexedDocuments: doc.indexed,
      failedDocuments: doc.failed,
      indexSuccessRate: doc.total ? round(doc.indexed / doc.total) : 0,
      averageIndexLatencyMs: Math.round(doc.average_latency),
      p95IndexLatencyMs: Math.round(doc.p95_latency),
      recallAt5: evaluation?.recallAt5 ?? null,
      mrrAt5: evaluation?.mrrAt5 ?? null,
      citationCoverage: evaluation?.citationCoverage ?? null,
      citationCorrectness: evaluation?.citationCorrectness ?? null,
      groundedness: evaluation?.groundedness ?? null,
      answerCorrectness: evaluation?.answerCorrectness ?? null,
      p95RetrievalLatencyMs: trace.rows[0]?.p95_retrieval == null ? null : Math.round(trace.rows[0].p95_retrieval),
      p95AnswerLatencyMs: trace.rows[0]?.p95_answer == null ? null : Math.round(trace.rows[0].p95_answer)
    };
  }
}

const DOCUMENT_SELECT = `SELECT d.id, d.organization_id, d.knowledge_base_id, d.name, d.mime_type, d.size_bytes, d.status,
  d.error_message, d.embedding_model, d.uploaded_at, d.indexed_at, count(c.id)::int AS chunk_count
  FROM knowledge_documents d LEFT JOIN knowledge_chunks c ON c.document_id = d.id`;

type BaseRow = { id: string; organization_id: string; name: string; description: string; document_count: number; created_at: Date; updated_at: Date };
type DocumentRow = { id: string; organization_id: string; knowledge_base_id: string; name: string; mime_type: string; size_bytes: number; status: KnowledgeDocument["status"]; error_message: string | null; embedding_model: string | null; uploaded_at: Date; indexed_at: Date | null; chunk_count: number };
export type DocumentFileRow = Omit<DocumentRow, "chunk_count"> & { file_content: Buffer };
type ChunkRow = { id: string; organization_id: string; knowledge_base_id: string; document_id: string; document_name: string; chunk_index: number; content: string; page_number: number | null; start_offset: number; end_offset: number };
type CitationRow = { chunk_id: string; document_id: string; document_name: string; content: string; score: number | string };
type JsonCitationRow = Omit<CitationRow, "score"> & { embedding: number[] | string };
type JobRow = { id: string; organization_id: string; type: DocumentIndexJob["type"]; resource_id: string; status: DocumentIndexJob["status"]; progress: number; label: string; error_message: string | null; created_at: Date; updated_at: Date };
type TraceRow = { id: string; organization_id: string; conversation_id: string | null; question: string; knowledge_base_ids: string[]; citations: RagCitation[] | string; retrieval_latency_ms: number; answer_latency_ms: number | null; created_at: Date };
type DatasetRow = { id: string; organization_id: string; name: string; created_at: Date };
type EvaluationCaseRow = { id: string; organization_id: string; dataset_id: string; question: string; reference_answer: string; knowledge_base_ids: string[]; evidence: EvaluationEvidence[] | string };
type RunRow = { id: string; organization_id: string; dataset_id: string; status: EvaluationRun["status"]; metrics: RagMetrics | string | null; created_at: Date; completed_at: Date | null };
type EvaluationResultRow = { id: string; organization_id: string; run_id: string; case_id: string; question: string; citations: RagCitation[] | string; answer: string; retrieved_expected_rank: number | null; groundedness: number | null; answer_correctness: number | null };

function toBase(row: BaseRow): KnowledgeBase {
  return { id: row.id, organizationId: row.organization_id, name: row.name, description: row.description, documentCount: row.document_count, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
function toDocument(row: DocumentRow): KnowledgeDocument {
  return { id: row.id, organizationId: row.organization_id, knowledgeBaseId: row.knowledge_base_id, name: row.name, mimeType: row.mime_type, sizeBytes: row.size_bytes, status: row.status, chunkCount: row.chunk_count, errorMessage: row.error_message, embeddingModel: row.embedding_model, uploadedAt: row.uploaded_at.toISOString(), indexedAt: row.indexed_at?.toISOString() ?? null };
}
function toChunk(row: ChunkRow): KnowledgeChunk {
  return { id: row.id, organizationId: row.organization_id, knowledgeBaseId: row.knowledge_base_id, documentId: row.document_id, documentName: row.document_name, chunkIndex: row.chunk_index, content: row.content, pageNumber: row.page_number, startOffset: row.start_offset, endOffset: row.end_offset };
}
function toJob(row: JobRow): DocumentIndexJob {
  return { id: row.id, organizationId: row.organization_id, type: row.type, resourceId: row.resource_id, status: row.status, progress: row.progress, label: row.label, errorMessage: row.error_message, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
function toTrace(row: TraceRow): RagTrace {
  return { id: row.id, organizationId: row.organization_id, conversationId: row.conversation_id, question: row.question, knowledgeBaseIds: row.knowledge_base_ids, citations: jsonValue(row.citations), retrievalLatencyMs: row.retrieval_latency_ms, answerLatencyMs: row.answer_latency_ms, createdAt: row.created_at.toISOString() };
}
function toDataset(row: DatasetRow): Omit<EvaluationDataset, "caseCount"> {
  return { id: row.id, organizationId: row.organization_id, name: row.name, createdAt: row.created_at.toISOString() };
}
function toEvaluationCase(row: EvaluationCaseRow): EvaluationCase {
  return { id: row.id, datasetId: row.dataset_id, question: row.question, referenceAnswer: row.reference_answer, knowledgeBaseIds: row.knowledge_base_ids, evidence: jsonValue(row.evidence) };
}
function toEvaluationResult(row: EvaluationResultRow): EvaluationResult {
  return { id: row.id, runId: row.run_id, caseId: row.case_id, question: row.question, citations: jsonValue(row.citations), answer: row.answer, retrievedExpectedRank: row.retrieved_expected_rank, groundedness: row.groundedness, answerCorrectness: row.answer_correctness };
}
function toRun(row: RunRow, results: EvaluationResult[]): EvaluationRun {
  return { id: row.id, organizationId: row.organization_id, datasetId: row.dataset_id, status: row.status, metrics: row.metrics ? jsonValue(row.metrics) : null, createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null, results };
}
function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}
function vectorLiteral(value: number[]) {
  return `[${value.join(",")}]`;
}
function cosineSimilarity(left: number[], right: number[]) {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
function isUnavailableVectorExtension(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "0A000"
    && "message" in error
    && String(error.message).includes("vector");
}
function round(value: number) {
  return Number(value.toFixed(4));
}
