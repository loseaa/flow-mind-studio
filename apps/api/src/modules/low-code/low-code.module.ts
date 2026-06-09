import { Module } from "@nestjs/common";
import { LowCodeController } from "./low-code.controller";
import { LowCodeAssetsService } from "./low-code-assets.service";

@Module({ controllers: [LowCodeController], providers: [LowCodeAssetsService] })
export class LowCodeModule {}
