import { Card } from "@flowmind/ui";

export function MetricCard({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      <div className="mt-2 text-sm text-mint">{delta}</div>
    </Card>
  );
}
