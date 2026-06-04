import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { EvaluationService, RagTaskService } from "./rag.service";
import type { UploadedDocument } from "./document-processing";

@Controller("rag")
export class RagController {
  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly tasks: RagTaskService
  ) {}

  @Post("evaluation-datasets/import")
  @UseInterceptors(FileInterceptor("file"))
  importDataset(@Body() body: { name?: string }, @UploadedFile() file?: UploadedDocument) {
    return this.evaluationService.importDataset(body.name, file);
  }

  @Get("evaluation-datasets")
  datasets() {
    return this.evaluationService.listDatasets();
  }

  @Post("evaluation-datasets/golden")
  goldenDatasets() {
    return this.evaluationService.createGoldenDatasets();
  }

  @Post("evaluation-datasets/:id/runs")
  startRun(@Param("id") id: string) {
    return this.evaluationService.startRun(id, this.tasks);
  }

  @Get("evaluation-runs/:id")
  run(@Param("id") id: string) {
    return this.evaluationService.getRun(id);
  }

  @Get("evaluation-runs")
  runs() {
    return this.evaluationService.listRuns();
  }

  @Get("metrics")
  metrics() {
    return this.evaluationService.getMetrics();
  }
}
