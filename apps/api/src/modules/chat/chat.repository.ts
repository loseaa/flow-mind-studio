import { randomUUID } from "node:crypto";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChatConversation, ChatMessage, ChatPart, RagCitation } from "@flowmind/shared";

type QueryResult<T> = { rows: T[] };
type Queryable = { query<T = unknown>(sql: string, values?: unknown[]): Promise<QueryResult<T>> };
type PgPool = Queryable & { end(): Promise<void> };

const { Pool } = require("pg") as { Pool: new (config: { connectionString: string }) => PgPool };

type ConversationRow = {
  id: string;
  organization_id: string;
  title: string;
  model: string;
  knowledge_base_ids: string[];
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: ChatMessage["role"];
  content: string;
  parts: ChatPart[] | string | null;
  citations: RagCitation[] | string | null;
  created_at: Date;
};

@Injectable()
export class ChatRepository implements OnModuleDestroy {
  private readonly pool: PgPool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>("DATABASE_URL") ?? "postgresql://flowmind:flowmind@localhost:5432/flowmind"
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        title text NOT NULL,
        model text NOT NULL,
        knowledge_base_ids text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id text PRIMARY KEY,
        conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
        content text NOT NULL,
        parts jsonb NOT NULL DEFAULT '[]'::jsonb,
        citations jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await this.pool.query("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS parts jsonb NOT NULL DEFAULT '[]'::jsonb;");
    await this.pool.query("ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS knowledge_base_ids text[] NOT NULL DEFAULT '{}';");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_chat_conversations_active ON chat_conversations (organization_id, updated_at DESC) WHERE deleted_at IS NULL;");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, created_at ASC);");
  }

  async listConversations(organizationId: string): Promise<ChatConversation[]> {
    const result = await this.pool.query<ConversationRow>(
      `
        SELECT id, organization_id, title, model, knowledge_base_ids, created_at, updated_at
        FROM chat_conversations
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC
      `,
      [organizationId]
    );
    return result.rows.map(toConversation);
  }

  async createConversation(organizationId: string, model: string, title = "新对话", knowledgeBaseIds: string[] = []): Promise<ChatConversation> {
    const id = `conv_${randomUUID()}`;
    const result = await this.pool.query<ConversationRow>(
      `
        INSERT INTO chat_conversations (id, organization_id, title, model, knowledge_base_ids)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, organization_id, title, model, knowledge_base_ids, created_at, updated_at
      `,
      [id, organizationId, title, model, knowledgeBaseIds]
    );
    return toConversation(result.rows[0]);
  }

  async renameConversation(id: string, organizationId: string, title: string): Promise<ChatConversation | null> {
    const result = await this.pool.query<ConversationRow>(
      `
        UPDATE chat_conversations
        SET title = $3, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        RETURNING id, organization_id, title, model, knowledge_base_ids, created_at, updated_at
      `,
      [id, organizationId, title]
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
  }

  async updateKnowledgeBases(id: string, organizationId: string, knowledgeBaseIds: string[]): Promise<ChatConversation | null> {
    const result = await this.pool.query<ConversationRow>(
      `
        UPDATE chat_conversations
        SET knowledge_base_ids = $3, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        RETURNING id, organization_id, title, model, knowledge_base_ids, created_at, updated_at
      `,
      [id, organizationId, knowledgeBaseIds]
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
  }

  async deleteConversation(id: string, organizationId: string) {
    await this.pool.query(
      `
        UPDATE chat_conversations
        SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      `,
      [id, organizationId]
    );
  }

  async getConversation(id: string, organizationId: string): Promise<ChatConversation | null> {
    const result = await this.pool.query<ConversationRow>(
      `
        SELECT id, organization_id, title, model, knowledge_base_ids, created_at, updated_at
        FROM chat_conversations
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      `,
      [id, organizationId]
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT id, conversation_id, role, content, parts, citations, created_at
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );
    return result.rows.map(toMessage);
  }

  async insertMessage(input: {
    conversationId: string;
    role: ChatMessage["role"];
    content: string;
    parts?: ChatPart[];
    citations?: RagCitation[];
  }): Promise<ChatMessage> {
    const id = `msg_${randomUUID()}`;
    const result = await this.pool.query<MessageRow>(
      `
        INSERT INTO chat_messages (id, conversation_id, role, content, parts, citations)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        RETURNING id, conversation_id, role, content, parts, citations, created_at
      `,
      [id, input.conversationId, input.role, input.content, JSON.stringify(input.parts ?? []), JSON.stringify(input.citations ?? [])]
    );
    await this.pool.query("UPDATE chat_conversations SET updated_at = now() WHERE id = $1", [input.conversationId]);
    return toMessage(result.rows[0]);
  }

  async updateMessageParts(messageId: string, parts: ChatPart[]): Promise<ChatMessage | null> {
    const result = await this.pool.query<MessageRow>(
      `UPDATE chat_messages SET parts=$2::jsonb WHERE id=$1 RETURNING id,conversation_id,role,content,parts,citations,created_at`,
      [messageId, JSON.stringify(parts)]
    );
    return result.rows[0] ? toMessage(result.rows[0]) : null;
  }
}

function toConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    model: row.model,
    knowledgeBaseIds: row.knowledge_base_ids ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toMessage(row: MessageRow): ChatMessage {
  const parts = typeof row.parts === "string" ? (JSON.parse(row.parts) as ChatPart[]) : (row.parts ?? []);
  const citations = typeof row.citations === "string" ? (JSON.parse(row.citations) as RagCitation[]) : (row.citations ?? []);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    parts,
    citations,
    createdAt: row.created_at.toISOString()
  };
}
