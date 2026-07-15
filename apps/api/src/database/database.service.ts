import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type QueryResult<T> = { rows: T[]; rowCount?: number };
export type DatabaseClient = { query<T = unknown>(sql: string, values?: unknown[]): Promise<QueryResult<T>>; release(): void };
type PgPool = { query<T = unknown>(sql: string, values?: unknown[]): Promise<QueryResult<T>>; connect(): Promise<DatabaseClient>; end(): Promise<void> };
const { Pool } = require("pg") as { Pool: new (config: { connectionString: string }) => PgPool };

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: PgPool;
  constructor(config: ConfigService) {
    this.pool = new Pool({ connectionString: config.get<string>("DATABASE_URL") ?? "postgresql://flowmind:flowmind@localhost:5432/flowmind" });
  }
  query<T = unknown>(sql: string, values?: unknown[]) { return this.pool.query<T>(sql, values); }
  connect() { return this.pool.connect(); }
  async onModuleDestroy() { await this.pool.end(); }
}
