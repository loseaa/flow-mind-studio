import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { McpService } from "./mcp.service";

@Controller("mcp")
export class McpController {
  constructor(private readonly service: McpService) {}
  @Get("servers") servers() { return this.service.listServers(); }
  @Post("servers") create(@Body() body: Parameters<McpService["create"]>[0]) { return this.service.create(body); }
  @Get("servers/:id") server(@Param("id") id: string) { return this.service.getServer(id); }
  @Patch("servers/:id") update(@Param("id") id: string, @Body() body: Parameters<McpService["update"]>[1]) { return this.service.update(id, body); }
  @Delete("servers/:id") remove(@Param("id") id: string) { return this.service.remove(id); }
  @Post("servers/:id/test") test(@Param("id") id: string) { return this.service.test(id); }
  @Post("servers/:id/sync") sync(@Param("id") id: string) { return this.service.sync(id); }
  @Get("servers/:id/tools") tools(@Param("id") id: string) { return this.service.listTools(id); }
  @Patch("tools/:id") updateTool(@Param("id") id: string, @Body() body: Parameters<McpService["updateTool"]>[1]) { return this.service.updateTool(id, body); }
  @Get("invocations") invocations() { return this.service.listInvocations(); }
  @Get("invocations/:id") invocation(@Param("id") id: string) { return this.service.invocation(id); }
}
