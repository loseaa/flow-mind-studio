import { Module } from "@nestjs/common";
import { LowCodeController } from "./low-code.controller";
import { OssAssetsService } from "./oss-assets.service";

@Module({ controllers: [LowCodeController], providers: [OssAssetsService] })
export class LowCodeModule {}
