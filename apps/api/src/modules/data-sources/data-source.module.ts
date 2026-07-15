import { Module } from "@nestjs/common";
import { DataQueryController, DataSourceController } from "./data-source.controller";
import { DataSourceRepository } from "./data-source.repository";
import { DataSourceSecretService } from "./data-source-secret.service";
import { DataSourceService } from "./data-source.service";
import { PostgresDataSourceService } from "./postgres-data-source.service";

@Module({
  controllers: [DataSourceController, DataQueryController],
  providers: [DataSourceRepository, DataSourceSecretService, DataSourceService, PostgresDataSourceService]
})
export class DataSourceModule {}

