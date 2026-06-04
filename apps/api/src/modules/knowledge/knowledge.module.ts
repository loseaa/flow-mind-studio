import { Module } from "@nestjs/common";
import { KnowledgeController } from "./knowledge.controller";
import { EmbeddingClient } from "./embedding.client";
import { KnowledgeRepository } from "./knowledge.repository";
import { EvaluationService, IndexingService, JudgeClient, KnowledgeService, RagTaskService, RetrievalService } from "./rag.service";
import { RagController } from "./rag.controller";

@Module({
  controllers: [KnowledgeController, RagController],
  providers: [KnowledgeRepository, EmbeddingClient, KnowledgeService, IndexingService, RetrievalService, EvaluationService, JudgeClient, RagTaskService],
  exports: [RetrievalService, RagTaskService]
})
export class KnowledgeModule {}
