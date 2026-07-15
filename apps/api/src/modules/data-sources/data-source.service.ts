import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { DataQuery, DataQueryResult, DataSource } from "@flowmind/shared";
import { DataSourceRepository } from "./data-source.repository";
import { DataSourceSecretService } from "./data-source-secret.service";
import type { DataQueryRecord, DataSourceRecord } from "./data-source.types";
import { PostgresDataSourceService } from "./postgres-data-source.service";

const ORGANIZATION_ID = "org_1";
const USER_ID = "user_1";

export type CreateDataSourceInput = {
  name: string;
  type?: "postgresql";
  host: string;
  port?: number;
  database: string;
  username: string;
  password?: string;
  sslMode?: DataSource["sslMode"];
};

export type CreateDataQueryInput = {
  pageId: string;
  dataSourceId: string;
  key: string;
  name: string;
  statement: string;
  parameters?: DataQuery["parameters"];
  trigger?: DataQuery["trigger"];
  timeoutMs?: number;
  maxRows?: number;
  enabled?: boolean;
};

export type ProvisionDatabaseInput = CreateDataSourceInput & {
  password: string;
  maintenanceDatabase?: string;
};

@Injectable()
export class DataSourceService {
  constructor(
    private readonly repository: DataSourceRepository,
    private readonly secrets: DataSourceSecretService,
    private readonly postgres: PostgresDataSourceService
  ) {}

  async listSources() {
    return Promise.all((await this.repository.listSources(ORGANIZATION_ID)).map(publicSource));
  }

  async getSource(id: string) {
    return publicSource(await this.requireSource(id));
  }

  async createSource(input: CreateDataSourceInput) {
    validateSourceInput(input);
    const source = await this.repository.createSource({
      organizationId: ORGANIZATION_ID,
      createdBy: USER_ID,
      name: input.name.trim(),
      type: "postgresql",
      host: input.host.trim(),
      port: input.port ?? 5432,
      database: input.database.trim(),
      username: input.username.trim(),
      sslMode: input.sslMode ?? "require",
      encryptedCredentials: this.secrets.encrypt(input.password === undefined ? undefined : { password: input.password })
    });
    return publicSource(source);
  }

  async provisionDatabase(input: ProvisionDatabaseInput) {
    validateSourceInput(input);
    if (!input.password) throw new BadRequestException("新建数据库需要具备 CREATEDB 权限的账号密码");
    const port = input.port ?? 5432;
    const sslMode = input.sslMode ?? "require";
    const duplicateName = (await this.repository.listSources(ORGANIZATION_ID)).some((source) => source.name.toLowerCase() === input.name.trim().toLowerCase());
    if (duplicateName) throw new ConflictException("同名数据源已存在");
    const provisioned = await this.postgres.createDatabase({
      host: input.host.trim(),
      port,
      maintenanceDatabase: input.maintenanceDatabase?.trim() || "postgres",
      database: input.database.trim(),
      username: input.username.trim(),
      password: input.password,
      sslMode
    });
    let sourceId: string | undefined;
    try {
      const source = await this.repository.createSource({
        organizationId: ORGANIZATION_ID,
        createdBy: USER_ID,
        name: input.name.trim(),
        type: "postgresql",
        host: input.host.trim(),
        port,
        database: input.database.trim(),
        username: provisioned.username,
        sslMode,
        encryptedCredentials: this.secrets.encrypt({ password: provisioned.password })
      });
      sourceId = source.id;
      await this.testSource(source.id);
      return publicSource(await this.requireSource(source.id));
    } catch (error) {
      if (sourceId) await this.repository.deleteSource(sourceId, ORGANIZATION_ID).catch(() => undefined);
      await this.postgres.removeProvisionedDatabase({
        host: input.host.trim(), port, maintenanceDatabase: input.maintenanceDatabase?.trim() || "postgres",
        database: input.database.trim(), runtimeUsername: provisioned.username, username: input.username.trim(), password: input.password, sslMode
      }).catch(() => undefined);
      throw error;
    }
  }

  async updateSource(id: string, input: Partial<CreateDataSourceInput> & { enabled?: boolean }) {
    const current = await this.requireSource(id);
    const updated = await this.repository.updateSource(id, ORGANIZATION_ID, {
      name: input.name?.trim(),
      host: input.host?.trim(),
      port: input.port,
      database: input.database?.trim(),
      username: input.username?.trim(),
      sslMode: input.sslMode,
      enabled: input.enabled,
      encryptedCredentials: input.password === undefined ? undefined : this.secrets.encrypt({ password: input.password })
    });
    if (!updated) throw new NotFoundException("数据源不存在");
    this.postgres.invalidate(current.id);
    return publicSource(updated);
  }

  async removeSource(id: string) {
    await this.requireSource(id);
    if (!await this.repository.deleteSource(id, ORGANIZATION_ID)) throw new ConflictException("数据源仍被查询引用，不能删除");
    this.postgres.invalidate(id);
    return { ok: true };
  }

  async testSource(id: string) {
    const source = await this.requireSource(id);
    try {
      const result = await this.postgres.test(source);
      await this.repository.setHealth(id, ORGANIZATION_ID, true);
      return { ok: true, ...result };
    } catch (error) {
      await this.repository.setHealth(id, ORGANIZATION_ID, false, { code: "DATA_SOURCE_CONNECTION_FAILED", message: errorMessage(error) });
      throw new BadRequestException(safeConnectionError(error));
    }
  }

  async introspect(id: string) {
    const source = await this.requireSource(id);
    try {
      const schema = await this.postgres.introspect(source);
      await this.repository.saveSchemaSnapshot(id, schema.schemaHash, schema.tables);
      await this.repository.setHealth(id, ORGANIZATION_ID, true);
      return schema;
    } catch (error) {
      await this.repository.setHealth(id, ORGANIZATION_ID, false, { code: "DATA_SOURCE_INTROSPECTION_FAILED", message: errorMessage(error) });
      throw new BadRequestException(safeConnectionError(error));
    }
  }

  async listQueries(pageId?: string) {
    return (await this.repository.listQueries(ORGANIZATION_ID, pageId)).map(publicQuery);
  }

  async createQuery(input: CreateDataQueryInput) {
    if (!input.pageId?.trim() || !input.dataSourceId || !input.key?.trim() || !input.name?.trim() || !input.statement?.trim()) throw new BadRequestException("pageId、dataSourceId、key、name 和 statement 为必填项");
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input.key)) throw new BadRequestException("查询 Key 只能包含字母、数字和下划线，且不能以数字开头");
    await this.requireSource(input.dataSourceId);
    const parameters = input.parameters ?? [];
    validateParameters(parameters);
    const referencedPositions = [...input.statement.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    if (referencedPositions.some((position) => position < 1 || position > parameters.length)) throw new BadRequestException("SQL 参数占位符与 parameters 定义不匹配");
    const query = await this.repository.createQuery({
      organizationId: ORGANIZATION_ID,
      createdBy: USER_ID,
      pageId: input.pageId.trim(),
      dataSourceId: input.dataSourceId,
      key: input.key,
      name: input.name.trim(),
      statement: input.statement.trim(),
      parameters,
      trigger: input.trigger ?? "manual",
      timeoutMs: clamp(input.timeoutMs ?? 5000, 100, 30000),
      maxRows: clamp(input.maxRows ?? 100, 1, 1000),
      enabled: input.enabled ?? true
    });
    return publicQuery(query);
  }

  async removeQuery(id: string) {
    if (!await this.repository.getQuery(id, ORGANIZATION_ID)) throw new NotFoundException("查询不存在");
    await this.repository.deleteQuery(id, ORGANIZATION_ID);
    return { ok: true };
  }

  async executeQuery(id: string, suppliedValues: Record<string, unknown> = {}) {
    const query = await this.repository.getQuery(id, ORGANIZATION_ID);
    if (!query || !query.enabled) throw new NotFoundException("查询不存在或已停用");
    const source = await this.requireSource(query.dataSourceId);
    if (!source.enabled) throw new BadRequestException("数据源已停用");
    const values = resolveParameterValues(query, suppliedValues);
    const startedAt = performance.now();
    try {
      const result = await this.postgres.execute(source, query.statement, values, { timeoutMs: query.timeoutMs, maxRows: query.maxRows });
      const outputSchema = inferOutputSchema(result);
      await Promise.all([
        this.repository.updateQuerySchema(query.id, ORGANIZATION_ID, outputSchema),
        this.repository.logExecution({ organizationId: ORGANIZATION_ID, queryId: query.id, status: "succeeded", durationMs: result.durationMs, rowCount: result.rowCount, userId: USER_ID })
      ]);
      return result;
    } catch (error) {
      await this.repository.logExecution({ organizationId: ORGANIZATION_ID, queryId: query.id, status: "failed", durationMs: performance.now() - startedAt, errorCode: "DATA_QUERY_FAILED", errorMessage: errorMessage(error), userId: USER_ID });
      throw new BadRequestException(safeQueryError(error));
    }
  }

  private async requireSource(id: string) {
    const source = await this.repository.getSource(id, ORGANIZATION_ID);
    if (!source) throw new NotFoundException("数据源不存在");
    return source;
  }
}

function publicSource(source: DataSourceRecord): DataSource {
  const { encryptedCredentials, createdBy: _createdBy, ...value } = source;
  return { ...value, hasCredentials: Boolean(encryptedCredentials), lastCheckedAt: iso(value.lastCheckedAt), createdAt: iso(value.createdAt)!, updatedAt: iso(value.updatedAt)! };
}

function publicQuery(query: DataQueryRecord): DataQuery {
  const { createdBy: _createdBy, ...value } = query;
  return { ...value, createdAt: iso(value.createdAt)!, updatedAt: iso(value.updatedAt)! };
}

function resolveParameterValues(query: DataQueryRecord, supplied: Record<string, unknown>) {
  return [...query.parameters].sort((a, b) => a.position - b.position).map((parameter) => {
    const value = supplied[parameter.name] ?? parameter.defaultValue;
    if (value === undefined && parameter.required) throw new BadRequestException(`缺少查询参数 ${parameter.name}`);
    if (value === undefined) return null;
    if (parameter.type === "number" && typeof value !== "number") throw new BadRequestException(`参数 ${parameter.name} 必须是数字`);
    if (parameter.type === "boolean" && typeof value !== "boolean") throw new BadRequestException(`参数 ${parameter.name} 必须是布尔值`);
    if ((parameter.type === "string" || parameter.type === "date") && typeof value !== "string") throw new BadRequestException(`参数 ${parameter.name} 必须是字符串`);
    return value;
  });
}

function inferOutputSchema(result: DataQueryResult) {
  const properties: Record<string, unknown> = {};
  for (const field of result.fields) {
    const sample = result.rows.find((row) => row[field.name] !== null && row[field.name] !== undefined)?.[field.name];
    properties[field.name] = { type: sample === null || sample === undefined ? "unknown" : Array.isArray(sample) ? "array" : typeof sample };
  }
  return { type: "array", items: { type: "object", properties } };
}

function validateSourceInput(input: CreateDataSourceInput) {
  if (!input.name?.trim() || !input.host?.trim() || !input.database?.trim() || !input.username?.trim()) throw new BadRequestException("name、host、database 和 username 为必填项");
  const port = input.port ?? 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BadRequestException("端口必须在 1 到 65535 之间");
}

function validateParameters(parameters: DataQuery["parameters"]) {
  const names = new Set<string>();
  const positions = new Set<number>();
  for (const parameter of parameters) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(parameter.name) || names.has(parameter.name)) throw new BadRequestException("查询参数名称无效或重复");
    if (!Number.isInteger(parameter.position) || parameter.position < 1 || positions.has(parameter.position)) throw new BadRequestException("查询参数 position 无效或重复");
    names.add(parameter.name); positions.add(parameter.position);
  }
  const ordered = [...positions].sort((a, b) => a - b);
  if (ordered.some((position, index) => position !== index + 1)) throw new BadRequestException("查询参数 position 必须从 1 连续编号");
}

function iso(value: string | Date | null | undefined) { return value == null ? null : value instanceof Date ? value.toISOString() : value; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.round(value))); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function safeConnectionError(error: unknown) { const message = errorMessage(error); return /password authentication failed/i.test(message) ? "数据库认证失败" : /timeout|timed out/i.test(message) ? "数据库连接超时" : message.slice(0, 500); }
function safeQueryError(error: unknown) { const message = errorMessage(error); return /statement timeout|canceling statement/i.test(message) ? "查询执行超时" : message.slice(0, 500); }
