import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseService } from "./database.service";

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);
  constructor(private readonly database: DatabaseService) {}
  async onModuleInit() { await this.migrate(); }
  async migrate() {
    const client = await this.database.connect();
    try {
      await client.query("SELECT pg_advisory_lock(743219001)");
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const directory = resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../../infra/postgres/migrations" : "infra/postgres/migrations");
      const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
      for (const file of files) {
        const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
        if (applied.rows.length) continue;
        await client.query("BEGIN");
        try {
          await client.query(await readFile(resolve(directory, file), "utf8"));
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
          await client.query("COMMIT");
          this.logger.log(`Applied migration ${file}`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(743219001)").catch(() => undefined);
      client.release();
    }
  }
}
