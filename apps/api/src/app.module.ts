import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DataModelsModule } from "./modules/data-models/data-models.module";
import { KnowledgeModule } from "./modules/knowledge/knowledge.module";
import { LowCodeModule } from "./modules/low-code/low-code.module";
import { McpModule } from "./modules/mcp/mcp.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { DataSourceModule } from "./modules/data-sources/data-source.module";

const dbBackedModules = process.env.FLOWMIND_SKIP_DB_MODULES === "true"
  ? []
  : [KnowledgeModule, ChatModule, TasksModule];

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: [".env", "../../.env"], isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    DashboardModule,
    McpModule,
    DataModelsModule,
    DataSourceModule,
    LowCodeModule,
    ...dbBackedModules
  ]
})
export class AppModule {}
