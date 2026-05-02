import { Plus, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CreateWorkspaceModal } from "@/components/workspace/CreateWorkspaceModal";
import { WorkspaceCard } from "@/components/workspace/WorkspaceCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaces, WORKSPACE_LIMIT } from "@/hooks/useWorkspace";

export function DashboardPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { workspaces, isLoading, error, refresh, createWorkspace, deleteWorkspace } = useWorkspaces();
  const canCreateWorkspace = workspaces.length < WORKSPACE_LIMIT;

  function handleOpenCreate() {
    if (!canCreateWorkspace) {
      toast.error(`Workspace limit reached. Delete a workspace before creating another.`);
      return;
    }

    setIsCreateOpen(true);
  }

  async function handleDeleteWorkspace(workspaceId: string, workspaceName: string) {
    const confirmed = window.confirm(`Delete "${workspaceName}" and all repos in it?`);

    if (!confirmed) {
      return;
    }

    try {
      await deleteWorkspace(workspaceId);
      toast.success("Workspace deleted");
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Unable to delete workspace");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Workspaces</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Browse multi-repo codebases, run projects in BrowserPod, and chat with AI about the source.
          </p>
        </div>
        <Button onClick={handleOpenCreate} disabled={isLoading || !canCreateWorkspace}>
          <Plus className="h-4 w-4" />
          Create Workspace
        </Button>
      </div>
      {!isLoading && (
        <p className="mt-3 text-sm text-muted-foreground">
          {workspaces.length}/{WORKSPACE_LIMIT} workspaces used.
        </p>
      )}

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
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      )}

      {!isLoading && !error && workspaces.length === 0 && (
        <div className="mt-8 flex min-h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
          <div>
            <h2 className="text-lg font-semibold">No workspaces yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first workspace to upload GitHub repos.
            </p>
            <Button className="mt-4" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Create Workspace
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !error && workspaces.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onDelete={() => void handleDeleteWorkspace(workspace.id, workspace.name)}
            />
          ))}
        </div>
      )}

      <CreateWorkspaceModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={createWorkspace}
        workspaceCount={workspaces.length}
        workspaceLimit={WORKSPACE_LIMIT}
      />
    </main>
  );
}
