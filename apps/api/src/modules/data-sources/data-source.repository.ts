import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { DataQuery, DataSource } from "@flowmind/shared";
import { DatabaseService } from "../../database/database.service";
import type { DataQueryRecord, DataSourceRecord } from "./data-source.types";

const SOURCE_COLUMNS = `id, organization_id AS "organizationId", name, type, host, port, database_name AS "database", username, ssl_mode AS "sslMode", encrypted_credentials AS "encryptedCredentials", enabled, status, last_checked_at AS "lastCheckedAt", last_error_code AS "lastErrorCode", last_error_message AS "lastErrorMessage", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`;
const QUERY_COLUMNS = `id, organization_id AS "organizationId", page_id AS "pageId", data_source_id AS "dataSourceId", query_key AS "key", name, statement, parameters, output_schema AS "outputSchema", trigger_type AS "trigger", timeout_ms AS "timeoutMs", max_rows AS "maxRows", revision, enabled, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class DataSourceRepository {
  constructor(private readonly db: DatabaseService) {}

  async listSources(organizationId: string) {
    return (await this.db.query<DataSourceRecord>(`SELECT ${SOURCE_COLUMNS} FROM data_sources WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, [organizationId])).rows;
  }

  async getSource(id: string, organizationId: string) {
    return (await this.db.query<DataSourceRecord>(`SELECT ${SOURCE_COLUMNS} FROM data_sources WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [id, organizationId])).rows[0] ?? null;
  }

  async createSource(input: Omit<DataSourceRecord, keyof DataSource | "id" | "createdBy"> & { organizationId: string; name: string; type: "postgresql"; host: string; port: number; database: string; username: string; sslMode: DataSource["sslMode"]; encryptedCredentials: string | null; createdBy: string }) {
    const id = `ds_${randomUUID()}`;
    const result = await this.db.query<DataSourceRecord>(`INSERT INTO data_sources (id,organization_id,name,type,host,port,database_name,username,ssl_mode,encrypted_credentials,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${SOURCE_COLUMNS}`,
      [id, input.organizationId, input.name, input.type, input.host, input.port, input.database, input.username, input.sslMode, input.encryptedCredentials, input.createdBy]);
    return result.rows[0];
  }

  async updateSource(id: string, organizationId: string, patch: Partial<Pick<DataSourceRecord, "name" | "host" | "port" | "database" | "username" | "sslMode" | "encryptedCredentials" | "enabled">>) {
    const current = await this.getSource(id, organizationId);
    if (!current) return null;
    const result = await this.db.query<DataSourceRecord>(`UPDATE data_sources SET name=$3,host=$4,port=$5,database_name=$6,username=$7,ssl_mode=$8,encrypted_credentials=$9,enabled=$10,status='unknown',updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING ${SOURCE_COLUMNS}`,
      [id, organizationId, patch.name ?? current.name, patch.host ?? current.host, patch.port ?? current.port, patch.database ?? current.database, patch.username ?? current.username, patch.sslMode ?? current.sslMode, patch.encryptedCredentials === undefined ? current.encryptedCredentials : patch.encryptedCredentials, patch.enabled ?? current.enabled]);
    return result.rows[0] ?? null;
  }

  async deleteSource(id: string, organizationId: string) {
    const references = await this.db.query<{ count: string }>("SELECT count(*)::text AS count FROM data_queries WHERE data_source_id=$1 AND organization_id=$2 AND deleted_at IS NULL", [id, organizationId]);
    if (Number(references.rows[0]?.count ?? 0) > 0) return false;
    await this.db.query("UPDATE data_sources SET deleted_at=now(),enabled=false,updated_at=now() WHERE id=$1 AND organization_id=$2", [id, organizationId]);
    return true;
  }

  async setHealth(id: string, organizationId: string, ok: boolean, error?: { code: string; message: string }) {
    await this.db.query("UPDATE data_sources SET status=$3,last_checked_at=now(),last_error_code=$4,last_error_message=$5,updated_at=now() WHERE id=$1 AND organization_id=$2", [id, organizationId, ok ? "online" : "error", error?.code ?? null, error?.message.slice(0, 1000) ?? null]);
  }

  async saveSchemaSnapshot(dataSourceId: string, schemaHash: string, schemaDocument: unknown) {
    await this.db.query("INSERT INTO data_source_schema_snapshots (data_source_id,schema_hash,schema_document) VALUES ($1,$2,$3)", [dataSourceId, schemaHash, JSON.stringify(schemaDocument)]);
  }

  async listQueries(organizationId: string, pageId?: string) {
    const result = pageId
      ? await this.db.query<DataQueryRecord>(`SELECT ${QUERY_COLUMNS} FROM data_queries WHERE organization_id=$1 AND page_id=$2 AND deleted_at IS NULL ORDER BY created_at`, [organizationId, pageId])
      : await this.db.query<DataQueryRecord>(`SELECT ${QUERY_COLUMNS} FROM data_queries WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [organizationId]);
    return result.rows;
  }

  async getQuery(id: string, organizationId: string) {
    return (await this.db.query<DataQueryRecord>(`SELECT ${QUERY_COLUMNS} FROM data_queries WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [id, organizationId])).rows[0] ?? null;
  }

  async createQuery(input: Omit<DataQuery, "id" | "organizationId" | "revision" | "outputSchema" | "createdAt" | "updatedAt"> & { organizationId: string; createdBy: string }) {
    const id = `query_${randomUUID()}`;
    const result = await this.db.query<DataQueryRecord>(`INSERT INTO data_queries (id,organization_id,page_id,data_source_id,query_key,name,statement,parameters,trigger_type,timeout_ms,max_rows,enabled,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${QUERY_COLUMNS}`,
      [id, input.organizationId, input.pageId, input.dataSourceId, input.key, input.name, input.statement, JSON.stringify(input.parameters), input.trigger, input.timeoutMs, input.maxRows, input.enabled, input.createdBy]);
    return result.rows[0];
  }

  async updateQuerySchema(id: string, organizationId: string, outputSchema: Record<string, unknown>) {
    await this.db.query("UPDATE data_queries SET output_schema=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [id, organizationId, JSON.stringify(outputSchema)]);
  }

  async deleteQuery(id: string, organizationId: string) {
    await this.db.query("UPDATE data_queries SET deleted_at=now(),enabled=false,updated_at=now() WHERE id=$1 AND organization_id=$2", [id, organizationId]);
  }

  async logExecution(input: { organizationId: string; queryId: string; status: "succeeded" | "failed"; durationMs: number; rowCount?: number; errorCode?: string; errorMessage?: string; userId: string }) {
    await this.db.query("INSERT INTO data_query_execution_logs (organization_id,query_id,status,duration_ms,row_count,error_code,error_message,executed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [input.organizationId, input.queryId, input.status, Math.round(input.durationMs), input.rowCount ?? null, input.errorCode ?? null, input.errorMessage?.slice(0, 1000) ?? null, input.userId]);
  }
}

