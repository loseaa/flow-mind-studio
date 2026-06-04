import type { ReactNode } from "react";

export function ToolbarIconButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button className="grid h-9 w-9 place-items-center rounded-md text-[#5b6472] hover:bg-[#eef2f5]" title={label} aria-label={label}>
      {children}
    </button>
  );
}
