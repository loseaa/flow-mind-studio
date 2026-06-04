import {
  Boxes,
  Database,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Radio,
  Settings,
  type LucideIcon
} from "lucide-react";

export type AppRouteKey = "dashboard" | "chat" | "knowledge" | "mcp" | "lowcode" | "models" | "settings";

export type AppNavigationItem = {
  key: AppRouteKey;
  path: string;
  label: string;
  icon: LucideIcon;
};

export const appNavigation: AppNavigationItem[] = [
  { key: "dashboard", path: "/app/dashboard", label: "总览", icon: LayoutDashboard },
  { key: "chat", path: "/app/chat", label: "AI 对话", icon: MessageSquareText },
  { key: "knowledge", path: "/app/knowledge", label: "知识库", icon: FileText },
  { key: "mcp", path: "/app/mcp", label: "MCP", icon: Radio },
  { key: "lowcode", path: "/app/lowcode", label: "低代码应用", icon: Boxes },
  { key: "models", path: "/app/models", label: "数据模型", icon: Database },
  { key: "settings", path: "/app/settings", label: "组织设置", icon: Settings }
];
