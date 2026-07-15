import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type EmbeddingPayload = {
  data?: Array<{ index: number; embedding: number[] }>;
};

@Injectable()
export class EmbeddingClient {
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly provider: "openai" | "local";

  constructor(configService: ConfigService) {
    this.baseUrl = (configService.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.apiKey = configService.get<string>("OPENAI_API_KEY") ?? "";
    this.provider = configService.get<string>("RAG_EMBEDDING_PROVIDER") === "local" ? "local" : "openai";
    this.model = this.provider === "local"
      ? "local-hash-1536"
      : configService.get<string>("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (this.provider === "local") return inputs.map(createLocalEmbedding);
    if (!this.apiKey) throw new Error("OPENAI_API_KEY 未配置，无法生成文档向量。");
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.model, input: inputs })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Embedding request failed with ${response.status}${body ? `: ${body}` : ""}`);
    }
    return parseEmbeddingResponse((await response.json()) as EmbeddingPayload, inputs.length);
  }
}

export function parseEmbeddingResponse(payload: EmbeddingPayload, expectedLength: number): number[][] {
  const embeddings = [...(payload.data ?? [])].sort((left, right) => left.index - right.index).map((item) => item.embedding);
  if (embeddings.length !== expectedLength || embeddings.some((embedding) => embedding.length !== 1536)) {
    throw new Error("Embedding response dimension or count does not match text-embedding-3-small.");
  }
  return embeddings;
}

export function createLocalEmbedding(input: string): number[] {
  const vector = new Array<number>(1536).fill(0);
  const normalized = input.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const latinTokens = normalized.match(/[a-z0-9.%-]+/g) ?? [];
  const hanText = (normalized.match(/[\p{Script=Han}]+/gu) ?? []).join("");
  const features = [
    ...latinTokens,
    ...Array.from(hanText),
    ...Array.from({ length: Math.max(0, hanText.length - 1) }, (_, index) => hanText.slice(index, index + 2))
  ];

  for (const feature of features) {
    const hash = fnv1a(feature);
    const index = hash % vector.length;
    vector[index] += (hash & 1) === 0 ? 1 : -1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

function fnv1a(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
