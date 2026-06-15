import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { DashboardPage } from "./pages/app/DashboardPage";
import { ChatPage } from "./pages/app/ChatPage";
import { DataModelsPage } from "./pages/app/DataModelsPage";
import { KnowledgePage } from "./pages/app/KnowledgePage";
import { LowCodeCustomMaterialPage } from "./pages/app/LowCodeCustomMaterialPage";
import { LowCodePage } from "./pages/app/LowCodePage";
import { McpPage } from "./pages/app/McpPage";
import { SettingsPage } from "./pages/app/SettingsPage";
import { LandingPage } from "./pages/LandingPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="mcp" element={<McpPage />} />
          <Route path="lowcode" element={<LowCodePage />} />
          <Route path="lowcode/materials/new" element={<LowCodeCustomMaterialPage />} />
          <Route path="models" element={<DataModelsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
