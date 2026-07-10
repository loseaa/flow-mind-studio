import { Module } from "@nestjs/common";
import { DesignAgentService } from "./design-agent.service";
import { LowCodeController } from "./low-code.controller";
import { OssAssetsService } from "./oss-assets.service";

@Module({ controllers: [LowCodeController], providers: [DesignAgentService, OssAssetsService] })
export class LowCodeModule {}
