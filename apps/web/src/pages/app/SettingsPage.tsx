import { Lock } from "lucide-react";
import { Card } from "@flowmind/ui";
import { PageHeader } from "../../components/PageHeader";

export function SettingsPage() {
  const roles = [
    ["Owner", "组织、成员、知识库、MCP、低代码和数据模型全部权限"],
    ["Admin", "除组织归属外的大部分管理权限"],
    ["Member", "知识库读取、AI对话、允许的MCP调用"]
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card className="p-5">
        <PageHeader title="组织设置" text="自建 JWT + RBAC，第一版固定 Owner/Admin/Member 三种角色。" />
        <div className="mt-5 space-y-3">
          {roles.map(([role, text]) => (
            <div key={role} className="rounded-lg border border-slate-200 p-4">
              <div className="font-semibold">{role}</div>
              <div className="mt-1 text-sm text-slate-500">{text}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <div className="flex items-center gap-2 font-semibold"><Lock size={18} />安全默认值</div>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li>高风险 MCP 工具调用需要用户确认。</li>
          <li>资源按 organizationId 隔离。</li>
          <li>文件上传默认限制 5MB。</li>
          <li>不包含计费、SSO、自定义角色。</li>
        </ul>
      </Card>
    </div>
  );
}
