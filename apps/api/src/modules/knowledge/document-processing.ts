import { BadRequestException } from "@nestjs/common";

export const SUPPORTED_DOCUMENT_MIME_TYPES = ["application/pdf", "text/markdown", "text/plain"] as const;
export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 120;

export type UploadedDocument = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type ParsedChunk = {
  content: string;
  chunkIndex: number;
  pageNumber: number | null;
  startOffset: number;
  endOffset: number;
};

type PageRange = {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
};

export type ExtractedDocument = {
  text: string;
  pageRanges: PageRange[];
};

export function validateDocumentUpload(file: UploadedDocument | undefined, maxBytes: number) {
  if (!file) throw new BadRequestException("请选择需要上传的文档。");
  if (!SUPPORTED_DOCUMENT_MIME_TYPES.includes(file.mimetype as (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number])) {
    throw new BadRequestException("仅支持 PDF、Markdown 和 TXT 文档。");
  }
  if (file.size > maxBytes) throw new BadRequestException(`文档不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB。`);
}

export async function extractDocumentText(file: Pick<UploadedDocument, "buffer" | "mimetype">): Promise<ExtractedDocument> {
  if (file.mimetype === "text/plain" || file.mimetype === "text/markdown") {
    return { text: file.buffer.toString("utf8").trim(), pageRanges: [] };
  }

  type PdfPage = { getTextContent(): Promise<{ items: Array<{ str?: string }> }> };
  const parsePdf = require("pdf-parse") as (
    buffer: Buffer,
    options?: { pagerender?: (page: PdfPage) => Promise<string> }
  ) => Promise<{ text?: string }>;
  const pages: string[] = [];
  const result = await parsePdf(file.buffer, {
    pagerender: async (page) => {
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str ?? "").join(" ").trim();
      pages.push(text);
      return text;
    }
  });
  const text = (pages.length > 0 ? pages.join("\n\n") : result.text ?? "").trim();
  let cursor = 0;
  const pageRanges = pages.map((page, index) => {
    const range = { pageNumber: index + 1, startOffset: cursor, endOffset: cursor + page.length };
    cursor = range.endOffset + 2;
    return range;
  });
  return { text, pageRanges };
}

export function chunkDocumentText(input: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP, pageRanges: PageRange[] = []): ParsedChunk[] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  const chunks: ParsedChunk[] = [];
  let startOffset = 0;
  while (startOffset < normalized.length) {
    let endOffset = Math.min(startOffset + size, normalized.length);
    if (endOffset < normalized.length) {
      const candidate = normalized.slice(startOffset, endOffset);
      const breakIndex = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf("\n"), candidate.lastIndexOf("。"));
      if (breakIndex > Math.floor(size * 0.6)) endOffset = startOffset + breakIndex + 1;
    }
    const content = normalized.slice(startOffset, endOffset).trim();
    if (content) {
      chunks.push({
        content,
        chunkIndex: chunks.length,
        pageNumber: pageRanges.find((page) => startOffset < page.endOffset && endOffset > page.startOffset)?.pageNumber ?? null,
        startOffset,
        endOffset
      });
    }
    if (endOffset === normalized.length) break;
    startOffset = Math.max(endOffset - overlap, startOffset + 1);
  }
  return chunks;
}
