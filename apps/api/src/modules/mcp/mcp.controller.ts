import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { mockStore } from "../../common/mock-store";

@Controller("mcp")
export class McpController {
  @Get("servers")
  servers() {
    return mockStore.mcpServers.map((server) => ({
      ...server,
      tools: mockStore.mcpTools.filter((tool) => tool.serverId === server.id)
    }));
  }

  @Get("invocations")
  invocations() {
    return mockStore.mcpInvocations;
  }

  @Post("invocations")
  invoke(@Body() body: { toolId: string; inputPreview: string }) {
    const tool = mockStore.mcpTools.find((item) => item.id === body.toolId);
    const invocation = {
      id: `inv_${mockStore.mcpInvocations.length + 1}`,
      organizationId: "org_1",
      toolId: body.toolId,
      requestedBy: "user_1",
      status: tool?.requiresConfirmation ? ("pending_confirmation" as const) : ("succeeded" as const),
      inputPreview: body.inputPreview,
      outputPreview: tool?.requiresConfirmation ? undefined : "工具已执行。",
      createdAt: new Date().toISOString()
    };
    mockStore.mcpInvocations.unshift(invocation);
    return invocation;
  }

  @Post("invocations/:id/confirm")
  confirm(@Param("id") id: string) {
    const invocation = mockStore.mcpInvocations.find((item) => item.id === id);
    if (!invocation) return { error: "INVOCATION_NOT_FOUND" };
    invocation.status = "succeeded";
    invocation.outputPreview = "用户确认后工具执行成功。";
    return invocation;
  }
}
