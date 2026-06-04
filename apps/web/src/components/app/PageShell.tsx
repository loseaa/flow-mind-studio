import type { ReactNode } from "react";

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-10 py-8 ${className}`}>{children}</div>;
}

export function PageTitle({
  action,
  children,
  description
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="max-w-3xl">
        <h1 className="text-[28px] font-bold leading-tight">{children}</h1>
        <p className="mt-2 text-sm text-[#5b6472]">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
