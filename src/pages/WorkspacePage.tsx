import { ArrowLeft, Loader2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { RepoCard } from "@/components/repo/RepoCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { stopRegisteredPod } from "@/hooks/usePod";
import { useWorkspace } from "@/hooks/useWorkspace";
import { api } from "@/lib/api";
import type { Repo } from "@/types";

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stoppingRepoId, setStoppingRepoId] = useState<string | undefined>();
  const { workspace, repos, isLoading, error, refresh, updateRepo } = useWorkspace(id);
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowSlowHint(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowSlowHint(true), 3000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  async function stopRepo(repo: Repo) {
    if (stoppingRepoId) {
      return;
    }

    setStoppingRepoId(repo.id);

    try {
      let localStopFailed = false;

      await stopRegisteredPod(repo.id).catch(() => {
        localStopFailed = true;
      });

      const stoppedRepo = await api.repos.stop(repo.id);
      updateRepo(stoppedRepo);

      if (localStopFailed) {
        toast.warning("Cleared the running repo record, but the local sandbox may already be gone");
      } else {
        toast.success("Sandbox stopped");
      }
    } catch (stopError) {
      toast.error(stopError instanceof Error ? stopError.message : "Unable to stop sandbox");
    } finally {
      setStoppingRepoId(undefined);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-semibold tracking-normal">{workspace?.name ?? "Workspace"}</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {workspace?.description || "No description yet."}
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertTitle>Could not load workspace</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!error && (
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
          <section className="min-h-[36rem] rounded-lg border border-border bg-background">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <h2 className="text-sm font-semibold">Repositories</h2>
              <span className="text-xs text-muted-foreground">{repos.length} total</span>
            </div>
            <div className="space-y-3 p-3">
              {isLoading && (
                <>
                  {showSlowHint && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <span>Waking up the server — this can take up to 30 seconds on the first visit…</span>
                    </div>
                  )}
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-32" />
                  ))}
                </>
              )}

              {!isLoading && repos.length === 0 && (
                <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
                  <div>
                    <h3 className="text-sm font-semibold">No repos yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">No repositories have been added to this workspace.</p>
                  </div>
                </div>
              )}

              {!isLoading &&
                repos.map((repo) => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    onOpen={() => navigate(`/workspace/${id}/repo/${repo.id}`)}
                    onRun={() => navigate(`/workspace/${id}/repo/${repo.id}?run=true`)}
                    onStop={() => void stopRepo(repo)}
                    isStopping={stoppingRepoId === repo.id}
                  />
                ))}
            </div>
          </section>

          {workspace ? (
            <ChatPanel
              scope={{ type: "workspace", id: workspace.id }}
              title="Workspace AI"
              className="min-h-[36rem]"
            />
          ) : (
            <Skeleton className="min-h-[36rem]" />
          )}
        </div>
      )}
    </main>
  );
}
