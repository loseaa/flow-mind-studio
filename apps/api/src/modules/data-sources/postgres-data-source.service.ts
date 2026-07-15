import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BadRequestException, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DatabaseTable, DataQueryResult } from "@flowmind/shared";
import type { DataSourceRecord } from "./data-source.types";
import { DataSourceSecretService } from "./data-source-secret.service";

type PgField = { name: string; dataTypeID?: number };
type PgResult = { rows: Array<Record<string, unknown>>; rowCount?: number | null; fields?: PgField[] };
type PgClient = { query(sql: string, values?: unknown[]): Promise<PgResult>; release(): void };
type PgPool = { connect(): Promise<PgClient>; end(): Promise<void> };
type PoolConstructor = new (config: Record<string, unknown>) => PgPool;
const { Pool } = require("pg") as { Pool: PoolConstructor };

@Injectable()
export class PostgresDataSourceService implements OnModuleDestroy {
  private readonly pools = new Map<string, { fingerprint: string; pool: PgPool }>();
  private readonly production: boolean;

  constructor(private readonly secrets: DataSourceSecretService, config: ConfigService) {
    this.production = config.get<string>("NODE_ENV") === "production";
  }

  async test(source: DataSourceRecord) {
    await this.assertAllowedHost(source.host);
    const startedAt = performance.now();
    const client = await this.poolFor(source).connect();
    try {
      await client.query("SELECT 1 AS ok");
      return { latencyMs: Math.round(performance.now() - startedAt), server: "postgresql" as const };
    } finally {
      client.release();
    }
  }

  async createDatabase(input: { host: string; port: number; maintenanceDatabase: string; database: string; username: string; password: string; sslMode: DataSourceRecord["sslMode"] }) {
    await this.assertAllowedHost(input.host);
    validateDatabaseName(input.database);
    const pool = new Pool({
      host: input.host,
      port: input.port,
      database: input.maintenanceDatabase,
      user: input.username,
      password: input.password,
      max: 1,
      connectionTimeoutMillis: 5_000,
      application_name: "flowmind-database-provisioner",
      ssl: sslConfig(input.sslMode)
    });
    let client: PgClient | undefined;
    try {
      client = await pool.connect();
      const existing = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [input.database]);
      if (existing.rows.length) throw new BadRequestException(`数据库 ${input.database} 已存在`);
      const runtimeUsername = `fm_${input.database.slice(0, 45)}_${randomBytes(4).toString("hex")}`;
      const runtimePassword = randomBytes(24).toString("base64url");
      await client.query(`CREATE ROLE ${quoteIdentifier(runtimeUsername)} LOGIN PASSWORD ${quoteLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
      try {
        await client.query(`CREATE DATABASE ${quoteIdentifier(input.database)} OWNER ${quoteIdentifier(runtimeUsername)} ENCODING 'UTF8' TEMPLATE template0`);
      } catch (error) {
        await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeUsername)}`).catch(() => undefined);
        throw error;
      }
      return { database: input.database, username: runtimeUsername, password: runtimePassword, created: true as const };
    } finally {
      client?.release();
      await pool.end();
    }
  }

  async removeProvisionedDatabase(input: { host: string; port: number; maintenanceDatabase: string; database: string; runtimeUsername: string; username: string; password: string; sslMode: DataSourceRecord["sslMode"] }) {
    validateDatabaseName(input.database);
    const pool = new Pool({ host: input.host, port: input.port, database: input.maintenanceDatabase, user: input.username, password: input.password, max: 1, connectionTimeoutMillis: 5_000, application_name: "flowmind-database-provisioner", ssl: sslConfig(input.sslMode) });
    let client: PgClient | undefined;
    try {
      client = await pool.connect();
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(input.database)} WITH (FORCE)`);
      await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(input.runtimeUsername)}`);
    } finally {
      client?.release();
      await pool.end();
    }
  }

  async introspect(source: DataSourceRecord): Promise<{ tables: DatabaseTable[]; schemaHash: string }> {
    await this.assertAllowedHost(source.host);
    const client = await this.poolFor(source).connect();
    try {
      const result = await client.query(`
        SELECT c.table_schema, c.table_name, t.table_type, c.column_name, c.data_type,
               c.is_nullable, c.column_default, c.ordinal_position
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema=c.table_schema AND t.table_name=c.table_name
        WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
        ORDER BY c.table_schema,c.table_name,c.ordinal_position
      `);
      const byTable = new Map<string, DatabaseTable>();
      for (const row of result.rows) {
        const schema = String(row.table_schema);
        const name = String(row.table_name);
        const key = `${schema}.${name}`;
        const table = byTable.get(key) ?? { schema, name, type: row.table_type === "VIEW" ? "view" : "table", columns: [] } as DatabaseTable;
        table.columns.push({
          name: String(row.column_name),
          dataType: String(row.data_type),
          nullable: row.is_nullable === "YES",
          defaultValue: row.column_default === null ? null : String(row.column_default)
        });
        byTable.set(key, table);
      }
      const tables = [...byTable.values()];
      return { tables, schemaHash: createHash("sha256").update(JSON.stringify(tables)).digest("hex") };
    } finally {
      client.release();
    }
  }

  async execute(source: DataSourceRecord, statement: string, values: unknown[], options: { timeoutMs: number; maxRows: number }): Promise<DataQueryResult> {
    await this.assertAllowedHost(source.host);
    const normalized = validateReadOnlyStatement(statement);
    const client = await this.poolFor(source).connect();
    const startedAt = performance.now();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = '${options.timeoutMs}ms'`);
      const result = await client.query(`SELECT * FROM (${normalized}) AS __flowmind_query LIMIT ${options.maxRows + 1}`, values);
      await client.query("COMMIT");
      const truncated = result.rows.length > options.maxRows;
      const rows = truncated ? result.rows.slice(0, options.maxRows) : result.rows;
      return {
        rows,
        rowCount: rows.length,
        fields: (result.fields ?? []).map((field) => ({ name: field.name, ...(field.dataTypeID === undefined ? {} : { dataTypeId: field.dataTypeID }) })),
        durationMs: Math.round(performance.now() - startedAt),
        truncated
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* connection may already be closed */ }
      throw error;
    } finally {
      client.release();
    }
  }

  invalidate(sourceId: string) {
    const current = this.pools.get(sourceId);
    if (!current) return;
    this.pools.delete(sourceId);
    void current.pool.end();
  }

  async onModuleDestroy() {
    await Promise.all([...this.pools.values()].map(({ pool }) => pool.end()));
  }

  private poolFor(source: DataSourceRecord) {
    const password = this.secrets.decrypt(source.encryptedCredentials).password;
    const fingerprint = createHash("sha256").update(JSON.stringify([source.host, source.port, source.database, source.username, source.sslMode, source.encryptedCredentials])).digest("hex");
    const current = this.pools.get(source.id);
    if (current?.fingerprint === fingerprint) return current.pool;
    if (current) void current.pool.end();
    const pool = new Pool({
      host: source.host,
      port: source.port,
      database: source.database,
      user: source.username,
      password,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "flowmind-data-source",
      ssl: sslConfig(source.sslMode)
    });
    this.pools.set(source.id, { fingerprint, pool });
    return pool;
  }

  private async assertAllowedHost(host: string) {
    if (!this.production) return;
    const normalized = host.trim().toLowerCase();
    if (normalized === "localhost" || normalized.endsWith(".localhost")) throw new BadRequestException("生产环境不允许连接本机地址");
    const addresses = isIP(normalized) ? [{ address: normalized }] : await lookup(normalized, { all: true });
    if (addresses.some(({ address }) => isPrivateAddress(address))) throw new BadRequestException("生产环境不允许连接内网或保留地址");
  }
}

function sslConfig(mode: DataSourceRecord["sslMode"]) {
  return mode === "disable" || mode === "prefer" ? false : { rejectUnauthorized: mode === "verify-full" };
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function validateReadOnlyStatement(statement: string) {
  const normalized = statement.trim().replace(/;+\s*$/, "");
  const withoutComments = normalized.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").trim();
  const inspected = withoutComments.replace(/'(?:''|[^'])*'/g, "''").replace(/\$[a-zA-Z_]*\$[\s\S]*?\$[a-zA-Z_]*\$/g, "$$");
  if (!/^(select|with)\b/i.test(inspected)) throw new BadRequestException("第一阶段仅允许 SELECT/CTE 查询");
  if (/;/.test(inspected)) throw new BadRequestException("仅允许执行一条 SQL 语句");
  if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(inspected)) throw new BadRequestException("查询不允许加行锁");
  if (/\b(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|lock)\b/i.test(inspected)) throw new BadRequestException("查询包含不允许的写入或管理语句");
  return normalized;
}

export function validateDatabaseName(name: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new BadRequestException("数据库名只能使用小写字母、数字和下划线，且必须以字母开头");
  return name;
}

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "::" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] >= 224);
}
