import { Module } from "@nestjs/common";
import { LowCodeController } from "./low-code.controller";

@Module({ controllers: [LowCodeController] })
export class LowCodeModule {}
