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

  constructor(configService: ConfigService) {
    this.baseUrl = (configService.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.apiKey = configService.get<string>("OPENAI_API_KEY") ?? "";
    this.model = configService.get<string>("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  }

  async embed(inputs: string[]): Promise<number[][]> {
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
