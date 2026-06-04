import { Outlet } from "react-router-dom";
import { AppTopBar } from "../components/AppTopBar";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[#f6f8fa] text-[#111827]">
      <AppTopBar />
      <main className="animate-fade-in">
        <Outlet />
      </main>
    </div>
  );
}
