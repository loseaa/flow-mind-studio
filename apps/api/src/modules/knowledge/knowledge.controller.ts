import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { UploadedDocument } from "./document-processing";
import { KnowledgeService } from "./rag.service";

@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get("bases")
  bases() {
    return this.knowledgeService.listBases();
  }

  @Post("bases")
  createBase(@Body() body: { name?: string; description?: string }) {
    return this.knowledgeService.createBase(body);
  }

  @Patch("bases/:id")
  updateBase(@Param("id") id: string, @Body() body: { name?: string; description?: string }) {
    return this.knowledgeService.updateBase(id, body);
  }

  @Delete("bases/:id")
  deleteBase(@Param("id") id: string) {
    return this.knowledgeService.deleteBase(id);
  }

  @Get("documents")
  documents() {
    return this.knowledgeService.listDocuments("kb_1");
  }

  @Get("bases/:id/documents")
  baseDocuments(@Param("id") id: string) {
    return this.knowledgeService.listDocuments(id);
  }

  @Post("bases/:id/documents")
  @UseInterceptors(FileInterceptor("file"))
  uploadDocument(@Param("id") id: string, @UploadedFile() file?: UploadedDocument) {
    return this.knowledgeService.uploadDocument(id, file);
  }

  @Get("documents/:id/chunks")
  chunks(@Param("id") id: string) {
    return this.knowledgeService.listChunks(id);
  }

  @Post("documents/:id/reindex")
  reindex(@Param("id") id: string) {
    return this.knowledgeService.reindex(id);
  }

  @Get("documents/:id/versions")
  versions(@Param("id") id: string) {
    return this.knowledgeService.listVersions(id);
  }

  @Post("documents/:id/versions")
  @UseInterceptors(FileInterceptor("file"))
  uploadVersion(@Param("id") id: string, @UploadedFile() file?: UploadedDocument) {
    return this.knowledgeService.uploadVersion(id, file);
  }

  @Post("documents/:id/versions/:versionId/rollback")
  rollbackVersion(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.knowledgeService.rollbackVersion(id, versionId);
  }

  @Post("documents/:id/versions/:versionId/index")
  indexVersion(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.knowledgeService.indexVersion(id, versionId);
  }

  @Delete("documents/:id")
  deleteDocument(@Param("id") id: string) {
    return this.knowledgeService.deleteDocument(id);
  }
}
