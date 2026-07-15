import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { designDocumentSchema, type DesignDocument } from "@flowmind/shared";
import { DatabaseService } from "../../database/database.service";

const ORGANIZATION_ID = "org_1";
const USER_ID = "user_1";

type DocumentRow = {
  id: string;
  name: string;
  draftDocument: DesignDocument;
  draftRevision: number;
  publishedDocument: DesignDocument | null;
  publishedRevision: number | null;
  updatedAt: string | Date;
  publishedAt: string | Date | null;
};

const COLUMNS = `id,name,draft_document AS "draftDocument",draft_revision AS "draftRevision",published_document AS "publishedDocument",published_revision AS "publishedRevision",updated_at AS "updatedAt",published_at AS "publishedAt"`;

@Injectable()
export class LowCodeDocumentService {
  constructor(private readonly database: DatabaseService) {}

  async get(id: string) {
    const row = (await this.database.query<DocumentRow>(`SELECT ${COLUMNS} FROM lowcode_design_documents WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [id, ORGANIZATION_ID])).rows[0];
    if (!row) throw new NotFoundException("低码页面不存在");
    return normalize(row);
  }

  async saveDraft(body: unknown) {
    const document = designDocumentSchema.parse(body);
    const result = await this.database.query<DocumentRow>(`INSERT INTO lowcode_design_documents (id,organization_id,name,draft_document,created_by) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,draft_document=EXCLUDED.draft_document,draft_revision=lowcode_design_documents.draft_revision+1,updated_at=now()
      WHERE lowcode_design_documents.organization_id=$2 AND lowcode_design_documents.deleted_at IS NULL RETURNING ${COLUMNS}`,
      [document.id, ORGANIZATION_ID, document.name, JSON.stringify(document), USER_ID]);
    if (!result.rows[0]) throw new BadRequestException("页面 ID 已属于其他组织或已删除");
    return normalize(result.rows[0]);
  }

  async publish(id: string) {
    const invalid = await this.database.query<{ count: string }>(`SELECT count(*)::text AS count FROM data_queries q JOIN data_sources s ON s.id=q.data_source_id
      WHERE q.organization_id=$1 AND q.page_id=$2 AND q.deleted_at IS NULL AND q.enabled AND (s.deleted_at IS NOT NULL OR NOT s.enabled OR s.status <> 'online')`, [ORGANIZATION_ID, id]);
    if (Number(invalid.rows[0]?.count ?? 0) > 0) throw new BadRequestException("页面存在不可用的数据查询，请先测试数据源");
    const result = await this.database.query<DocumentRow>(`UPDATE lowcode_design_documents SET published_document=draft_document,published_revision=draft_revision,published_at=now(),updated_at=now()
      WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL RETURNING ${COLUMNS}`, [id, ORGANIZATION_ID]);
    if (!result.rows[0]) throw new NotFoundException("请先保存页面草稿");
    return normalize(result.rows[0]);
  }
}

function normalize(row: DocumentRow) {
  return {
    ...row,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt
  };
}

