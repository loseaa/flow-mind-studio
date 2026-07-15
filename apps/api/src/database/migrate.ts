import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DatabaseModule } from "./database.module";

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule] })
class MigrationCliModule {}

async function main() {
  // Keep migrations isolated from HTTP, queues and application lifecycle hooks.
  // Booting AppModule here can claim a BullMQ job and terminate it on app.close().
  const app = await NestFactory.createApplicationContext(MigrationCliModule, { logger: ["log", "error", "warn"] });
  await app.close();
}
void main();
