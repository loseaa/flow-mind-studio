import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller";
import { KnowledgeModule } from "../knowledge/knowledge.module";

@Module({ imports: [KnowledgeModule], controllers: [TasksController] })
export class TasksModule {}
