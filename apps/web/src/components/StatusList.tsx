import { CheckCircle2 } from "lucide-react";

export type StatusListItem = {
  id: string;
  name: string;
  status: string;
};

export function StatusList({ items }: { items: StatusListItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((task) => (
        <div key={task.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
          <CheckCircle2 className="text-mint" size={18} />
          <div>
            <div className="text-sm font-medium">{task.name}</div>
            <div className="text-xs text-slate-500">{task.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
