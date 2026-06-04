import { Card } from "@flowmind/ui";

const toneClass = {
  blue: "text-[#2563eb]",
  green: "text-[#15803d]",
  orange: "text-[#b7791f]",
  red: "text-[#c2410c]",
  slate: "text-[#5b6472]"
};

export type StatTone = keyof typeof toneClass;

export function StatCard({
  label,
  tone = "green",
  value,
  detail
}: {
  label: string;
  tone?: StatTone;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-lg p-4">
      <div className="text-[13px] text-[#5b6472]">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold">{value}</div>
      <div className={`mt-2 text-xs ${toneClass[tone]}`}>{detail}</div>
    </Card>
  );
}
