import { Module } from "@nestjs/common";
import { DesignAgentService } from "./design-agent.service";
import { LowCodeController } from "./low-code.controller";
import { OssAssetsService } from "./oss-assets.service";
import { LowCodeDocumentService } from "./low-code-document.service";

@Module({ controllers: [LowCodeController], providers: [DesignAgentService, OssAssetsService, LowCodeDocumentService] })
export class LowCodeModule {}
