import { Badge } from "@flowmind/ui";

const documentStatusCopy = {
  uploaded: "已上传",
  parsing: "解析中",
  indexed: "已索引",
  failed: "失败"
};

const riskCopy = {
  low: "低风险",
  medium: "中风险",
  high: "高风险"
};

export function DocumentStatusBadge({ status }: { status: keyof typeof documentStatusCopy }) {
  const className =
    status === "indexed"
      ? "border-0 bg-[#e8f4f2] text-[#0f766e]"
      : status === "failed"
        ? "border-0 bg-[#fef2f2] text-[#c2410c]"
        : "border-0 bg-[#eef2f5] text-[#5b6472]";

  return <Badge className={className}>{documentStatusCopy[status]}</Badge>;
}

export function RiskBadge({ risk }: { risk: string }) {
  const normalized = risk === "high" || risk === "medium" || risk === "low" ? risk : "low";
  const className =
    normalized === "high"
      ? "border-0 bg-[#fef2f2] text-[#c2410c]"
      : normalized === "medium"
        ? "border-0 bg-[#fff7ed] text-[#b7791f]"
        : "border-0 bg-[#e8f4f2] text-[#0f766e]";

  return <Badge className={className}>{riskCopy[normalized]}</Badge>;
}
