import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RagMetrics } from "@flowmind/shared";
import { chunkDocumentText, validateDocumentUpload } from "./document-processing";
import { createLocalEmbedding, parseEmbeddingResponse } from "./embedding.client";
import { calculateEvaluationMetrics, findEvidenceRank, fuseRetrievalCandidates, GOLDEN_DATASET_DEFINITIONS, parseEvaluationCases } from "./rag.service";

describe("RAG document processing", () => {
  it("splits text with bounded overlap", () => {
    const chunks = chunkDocumentText("a".repeat(900), 800, 120);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toHaveLength(800);
    expect(chunks[1].startOffset).toBe(680);
  });

  it("maps chunks back to page ranges", () => {
    const chunks = chunkDocumentText("first page\n\nsecond page", 12, 0, [
      { pageNumber: 1, startOffset: 0, endOffset: 10 },
      { pageNumber: 2, startOffset: 12, endOffset: 23 }
    ]);
    expect(chunks.map((chunk) => chunk.pageNumber)).toEqual([1, 2]);
  });

  it("rejects unsupported or oversized files", () => {
    expect(() => validateDocumentUpload({ originalname: "a.docx", mimetype: "application/msword", size: 10, buffer: Buffer.from("") }, 20)).toThrow();
    expect(() => validateDocumentUpload({ originalname: "a.txt", mimetype: "text/plain", size: 30, buffer: Buffer.from("") }, 20)).toThrow();
  });

  it("sorts valid OpenAI embedding results and rejects invalid dimension", () => {
    const vector = new Array(1536).fill(0.1);
    expect(parseEmbeddingResponse({ data: [{ index: 1, embedding: vector }, { index: 0, embedding: vector }] }, 2)).toHaveLength(2);
    expect(() => parseEmbeddingResponse({ data: [{ index: 0, embedding: [0.1] }] }, 1)).toThrow();
  });

  it("creates deterministic local embeddings for development without an external API key", () => {
    const first = createLocalEmbedding("Markdown 文档通常在一分钟内完成索引");
    const second = createLocalEmbedding("Markdown 文档通常在一分钟内完成索引");
    const related = createLocalEmbedding("Markdown 多久完成索引？");
    const unrelated = createLocalEmbedding("企业版按年购买二十个席位");
    const similarity = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * right[index], 0);

    expect(first).toHaveLength(1536);
    expect(first).toEqual(second);
    expect(similarity(first, related)).toBeGreaterThan(similarity(first, unrelated));
  });
});

describe("RAG evaluation", () => {
  it("fuses vector and keyword candidates with reciprocal rank fusion", () => {
    const candidate = (chunkId: string, score: number) => ({
      chunkId,
      documentId: `doc_${chunkId}`,
      documentName: `${chunkId}.md`,
      quote: chunkId,
      score,
      documentVersion: 1
    });
    const fused = fuseRetrievalCandidates(
      [candidate("both", 0.8), candidate("vector", 0.7)],
      [candidate("keyword", 0.9), candidate("both", 0.6)],
      60,
      3
    );

    expect(fused.map((item) => item.chunkId)).toEqual(["both", "keyword", "vector"]);
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].keywordRank).toBe(2);
    expect(fused[0].fusedScore).toBeGreaterThan(fused[1].fusedScore);
  });

  it("keeps every built-in golden case backed by a retrievable fixture quote", () => {
    const source = readFileSync(resolve(process.cwd(), "test/fixtures/rag/flowmind-product-handbook.md"), "utf8");
    const chunks = chunkDocumentText(source);
    const datasets = GOLDEN_DATASET_DEFINITIONS;
    const questions = datasets.flatMap((dataset) => dataset.cases.map((testCase) => testCase.question));

    expect(datasets).toHaveLength(8);
    expect(questions).toHaveLength(24);
    expect(new Set(datasets.map((dataset) => dataset.name)).size).toBe(datasets.length);
    expect(new Set(questions).size).toBe(questions.length);
    for (const dataset of datasets) {
      for (const testCase of dataset.cases) {
        expect(testCase.knowledgeBaseIds).toEqual(["kb_1"]);
        for (const quote of testCase.expectedQuotes) {
          expect(source).toContain(quote);
          expect(chunks.some((chunk) => chunk.content.includes(quote))).toBe(true);
        }
      }
    }
  });

  it("parses JSON and CSV evaluation cases", () => {
    const json = JSON.stringify([{ question: "q", referenceAnswer: "a", knowledgeBaseIds: ["kb_1"], evidence: [{ documentId: "doc_1", expectedQuote: "quote" }] }]);
    expect(parseEvaluationCases(json, "application/json")).toHaveLength(1);
    const csv = 'question,referenceAnswer,knowledgeBaseIds,evidence\nq,a,kb_1,"[{""documentId"":""doc_1"",""expectedQuote"":""quote""}]"\n';
    expect(parseEvaluationCases(csv, "text/csv")).toHaveLength(1);
  });

  it("calculates retrieval and answer quality metrics", () => {
    const base: RagMetrics = {
      indexedDocuments: 1,
      failedDocuments: 0,
      indexSuccessRate: 1,
      averageIndexLatencyMs: 20,
      p95IndexLatencyMs: 20,
      recallAt5: null,
      mrrAt5: null,
      citationCoverage: null,
      citationCorrectness: null,
      groundedness: null,
      answerCorrectness: null,
      p95RetrievalLatencyMs: null,
      p95AnswerLatencyMs: null
    };
    const metrics = calculateEvaluationMetrics(base, [
      { id: "r1", runId: "run", caseId: "c1", question: "q1", citations: [{ documentId: "d", documentName: "n", chunkId: "ch", score: 0.8, quote: "q" }], answer: "a", retrievedExpectedRank: 1, groundedness: 1, answerCorrectness: 0.8 },
      { id: "r2", runId: "run", caseId: "c2", question: "q2", citations: [], answer: "a", retrievedExpectedRank: null, groundedness: 0.4, answerCorrectness: 0.2 }
    ]);
    expect(metrics.recallAt5).toBe(0.5);
    expect(metrics.mrrAt5).toBe(0.5);
    expect(metrics.groundedness).toBe(0.7);
  });

  it("only credits a retrieved citation when the expected quote is present", () => {
    const testCase = {
      id: "case",
      datasetId: "dataset",
      question: "q",
      referenceAnswer: "a",
      knowledgeBaseIds: ["kb_1"],
      evidence: [{ documentId: "doc_1", expectedQuote: "matching evidence" }]
    };
    expect(findEvidenceRank(testCase, [
      { documentId: "doc_1", documentName: "n", chunkId: "wrong", score: 0.9, quote: "different section" },
      { documentId: "doc_1", documentName: "n", chunkId: "right", score: 0.8, quote: "the matching   evidence is here" }
    ])).toBe(2);
  });
});
