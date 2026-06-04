import { Module } from "@nestjs/common";
import { DataModelsController } from "./data-models.controller";

@Module({ controllers: [DataModelsController] })
export class DataModelsModule {}
