import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type LlmRole = "system" | "user" | "assistant" | "tool";

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  stream: true;
  temperature: number;
  messages: LlmMessage[];
  tools?: Array<{ type: "function"; function: { name: string; description?: string; parameters: Record<string, unknown> } }>;
};

export type LlmToolCall = { id: string; name: string; arguments: string };
export type LlmStreamChunk = { content?: string; toolCalls?: LlmToolCall[]; finishReason?: string };

@Injectable()
export class LlmClient {
  readonly baseUrl: string;
  readonly model: string;
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.baseUrl = trimTrailingSlash(
      configService.get<string>("LLM_BASE_URL") ??
        configService.get<string>("DEEPSEEK_BASE_URL") ??
        configService.get<string>("OPENAI_BASE_URL") ??
        "https://api.deepseek.com"
    );
    this.model =
      configService.get<string>("LLM_MODEL") ??
      configService.get<string>("DEEPSEEK_MODEL") ??
      configService.get<string>("OPENAI_MODEL") ??
      "deepseek-v4-flash";
    this.apiKey =
      configService.get<string>("LLM_API_KEY") ??
      configService.get<string>("DEEPSEEK_API_KEY") ??
      configService.get<string>("OPENAI_API_KEY") ??
      "";
  }

  buildRequest(messages: LlmMessage[]): ChatCompletionRequest {
    return {
      model: this.model,
      stream: true,
      temperature: 0.2,
      messages
    };
  }

  async *streamChat(messages: LlmMessage[]): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify(this.buildRequest(messages))
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM request failed with ${response.status}${body ? `: ${body}` : ""}`);
    }

    if (!response.body) {
      throw new Error("LLM response did not include a stream body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const token = parseOpenAIStreamLine(line);
          if (token === null) continue;
          yield token;
        }
      }

      buffer += decoder.decode();
      if (buffer) {
        const token = parseOpenAIStreamLine(buffer);
        if (token !== null) yield token;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async *streamChatWithTools(messages: LlmMessage[], tools: ChatCompletionRequest["tools"]): AsyncGenerator<LlmStreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, { method:"POST", headers:{"Content-Type":"application/json",...(this.apiKey?{Authorization:`Bearer ${this.apiKey}`}:{})}, body:JSON.stringify({...this.buildRequest(messages),tools,tool_choice:"auto"}) });
    if(!response.ok) throw new Error(`LLM request failed with ${response.status}: ${await response.text().catch(()=>"")}`); if(!response.body) throw new Error("LLM response did not include a stream body.");
    const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer=""; const calls=new Map<number,LlmToolCall>();
    while(true){ const {done,value}=await reader.read(); if(done) break; buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split(/\r?\n/); buffer=lines.pop()??""; for(const line of lines){ const data=parseRawLine(line); if(!data) continue; const choice=data.choices?.[0]; for(const part of choice?.delta?.tool_calls??[]){ const current=calls.get(part.index)??{id:"",name:"",arguments:""}; if(part.id)current.id=part.id;if(part.function?.name)current.name+=part.function.name;if(part.function?.arguments)current.arguments+=part.function.arguments;calls.set(part.index,current); } if(choice?.delta?.content)yield{content:choice.delta.content}; if(choice?.finish_reason){ yield{toolCalls:[...calls.values()],finishReason:choice.finish_reason}; calls.clear(); } } }
  }
}

function parseRawLine(line:string):any|null { const t=line.trim(); if(!t.startsWith("data:"))return null;const d=t.slice(5).trim();if(!d||d==='[DONE]')return null;try{return JSON.parse(d)}catch{return null} }

export function parseOpenAIStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return null;

  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
    };
    return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
