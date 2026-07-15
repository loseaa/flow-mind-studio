import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { DataSourceService, type CreateDataQueryInput, type CreateDataSourceInput, type ProvisionDatabaseInput } from "./data-source.service";

@Controller("data-sources")
export class DataSourceController {
  constructor(private readonly service: DataSourceService) {}

  @Get() list() { return this.service.listSources(); }
  @Post() create(@Body() body: CreateDataSourceInput) { return this.service.createSource(body); }
  @Post("databases") provision(@Body() body: ProvisionDatabaseInput) { return this.service.provisionDatabase(body); }
  @Get(":id") get(@Param("id") id: string) { return this.service.getSource(id); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: Partial<CreateDataSourceInput> & { enabled?: boolean }) { return this.service.updateSource(id, body); }
  @Delete(":id") remove(@Param("id") id: string) { return this.service.removeSource(id); }
  @Post(":id/test") test(@Param("id") id: string) { return this.service.testSource(id); }
  @Post(":id/introspect") introspect(@Param("id") id: string) { return this.service.introspect(id); }
}

@Controller("data-queries")
export class DataQueryController {
  constructor(private readonly service: DataSourceService) {}

  @Get() list(@Query("pageId") pageId?: string) { return this.service.listQueries(pageId); }
  @Post() create(@Body() body: CreateDataQueryInput) { return this.service.createQuery(body); }
  @Delete(":id") remove(@Param("id") id: string) { return this.service.removeQuery(id); }
  @Post(":id/preview") preview(@Param("id") id: string, @Body() body: { parameters?: Record<string, unknown> }) { return this.service.executeQuery(id, body?.parameters); }
  @Post(":id/execute") execute(@Param("id") id: string, @Body() body: { parameters?: Record<string, unknown> }) { return this.service.executeQuery(id, body?.parameters); }
}
