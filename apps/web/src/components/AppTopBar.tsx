import { ArrowRight, Plus, Workflow } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { appNavigation } from "../navigation";

export function AppTopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#d9e1e8] bg-white/90 backdrop-blur">
      <div className="flex min-h-[72px] items-center gap-6 px-5 py-3 lg:px-7">
        <Link
          to="/"
          className="flex w-[210px] shrink-0 items-center gap-2.5 group"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-md bg-[#0f766e] text-[15px] font-bold text-white transition-transform duration-200 group-hover:scale-110">
            F
          </span>
          <span className="text-lg font-bold tracking-normal text-[#111827]">
            FlowMindStudio
          </span>
        </Link>

        <div className="hidden w-[170px] shrink-0 flex-col gap-0.5 lg:flex">
          <span className="text-[11px] text-[#8a94a3]">组织</span>
          <span className="text-[13px] font-semibold text-[#111827]">
            星河企业智能部
          </span>
        </div>

        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto custom-scrollbar-container">
          {appNavigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] transition-all duration-200 ${
                  isActive
                    ? "bg-[#e8f4f2] font-bold text-[#0f766e] scale-105"
                    : "font-medium text-[#5b6472] hover:bg-[#eef2f5] hover:text-[#111827]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <Link
            to="/app/lowcode"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d9e1e8] bg-white px-3 text-[13px] font-semibold text-[#111827] transition-all duration-200 hover:bg-[#f6f8fa] hover:shadow-sm active:scale-95"
          >
            <Workflow size={15} />
            新建工作流
          </Link>
          <Link
            to="/app/chat"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1e293b] px-3.5 text-[13px] font-bold text-white transition-all duration-200 hover:bg-[#111827] hover:shadow-md active:scale-95"
          >
            进入对话
            <ArrowRight
              size={15}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <Link
          to="/app/chat"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1e293b] text-white xl:hidden"
          aria-label="进入对话"
        >
          <Plus size={16} />
        </Link>
      </div>
    </header>
  );
}
