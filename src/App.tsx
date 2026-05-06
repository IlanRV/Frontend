import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { DemoBanner } from "@/components/layout/DemoBanner";
import { Navbar } from "@/components/layout/Navbar";
import { warmupBackend } from "@/lib/warmup";
import { DashboardPage } from "@/pages/DashboardPage";
import { LandingPage } from "@/pages/LandingPage";
import { RepoPage } from "@/pages/RepoPage";
import { WorkspacePage } from "@/pages/WorkspacePage";

export function App() {
  useEffect(() => {
    warmupBackend();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspace/:id" element={<WorkspacePage />} />
          <Route path="/workspace/:id/repo/:repoId" element={<RepoPage />} />
        </Routes>
      </div>
      <DemoBanner />
      <Toaster richColors closeButton position="top-right" />
    </div>
  );
}
