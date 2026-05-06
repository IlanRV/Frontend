import { Loader2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { WorkspaceCard } from "@/components/workspace/WorkspaceCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaces } from "@/hooks/useWorkspace";

export function DashboardPage() {
  const { workspaces, isLoading, error, refresh } = useWorkspaces();
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowSlowHint(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowSlowHint(true), 3000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Workspaces</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Browse multi-repo codebases, run projects in BrowserPod, and chat with AI about the source.
          </p>
        </div>
      </div>

      {error && (
        <Alert className="mt-6 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertTitle>Could not load workspaces</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="mt-8">
          {showSlowHint && (
            <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>Waking up the server — this can take up to 30 seconds on the first visit…</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && workspaces.length === 0 && (
        <div className="mt-8 flex min-h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
          <div>
            <h2 className="text-lg font-semibold">No workspaces yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No workspaces have been created.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !error && workspaces.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
            />
          ))}
        </div>
      )}
    </main>
  );
}
