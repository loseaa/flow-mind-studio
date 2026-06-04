import { Controller, Get } from "@nestjs/common";
import { mockStore } from "../../common/mock-store";

@Controller("dashboard")
export class DashboardController {
  @Get()
  getDashboard() {
    return {
      metrics: [
        { label: "知识文档", value: String(mockStore.documents.length), delta: "+2 本周" },
        { label: "MCP工具", value: String(mockStore.mcpTools.length), delta: "1 个需确认" },
        { label: "低代码页面", value: String(mockStore.lowCodePages.length), delta: "草稿中" },
        { label: "Agent执行", value: "18", delta: "92% 成功率" }
      ],
      recentTasks: [
        { id: "task_1", name: "产品需求说明.md 索引完成", status: "done" },
        { id: "task_2", name: "MCP 工具调用等待确认", status: "waiting" },
        { id: "task_3", name: "客户管理页面草稿已保存", status: "draft" }
      ]
    };
  }
}
