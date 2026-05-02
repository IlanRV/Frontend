import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { Navbar } from "@/components/layout/Navbar";
import { DashboardPage } from "@/pages/DashboardPage";
import { RepoPage } from "@/pages/RepoPage";
import { WorkspacePage } from "@/pages/WorkspacePage";

export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workspace/:id" element={<WorkspacePage />} />
        <Route path="/workspace/:id/repo/:repoId" element={<RepoPage />} />
      </Routes>
      <Toaster richColors closeButton position="top-right" />
    </div>
  );
}
