import { Bot, ExternalLink, GitBranch, Play, Square, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { ExtractionProgressLine } from "@/components/ai/ExtractionProgressLine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Repo, RepoStatus } from "@/types";

interface RepoCardProps {
  repo: Repo;
  active?: boolean;
  onOpen: () => void;
  onRun: () => void;
  onStop?: () => void;
  isStopping?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

function statusVariant(status: RepoStatus) {
  switch (status) {
    case "ready":
      return "success";
    case "running":
      return "info";
    case "error":
      return "danger";
    case "cloning":
    default:
      return "warning";
  }
}

export function RepoCard({ repo, active, onOpen, onRun, onStop, isStopping, onDelete, isDeleting }: RepoCardProps) {
  const canRun = repo.runnability?.canRun ?? repo.runnable ?? false;
  const hasAiReadme = repo.aiReadmeStatus === "ready" || Boolean(repo.aiReadme);
  const isSandboxRunning = repo.status === "running" || Boolean(repo.portalUrl);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onOpen();
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full rounded-xl border border-border/70 bg-background/80 p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary/70 bg-accent/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
            <h3 className="truncate text-sm font-semibold">{repo.name}</h3>
          </div>
          <div className="mt-2 min-w-0 space-y-2">
            <p className="truncate text-xs text-muted-foreground">{repo.githubUrl}</p>
            <ExtractionProgressLine repo={repo} compact className="max-w-full" />
          </div>
        </div>
        <Badge variant={statusVariant(repo.status)} className="shrink-0">{repo.status}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canRun && !isSandboxRunning && (
          <Button
            type="button"
            size="sm"
            variant="success"
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
            title="Open and run repo"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
        )}
        {isSandboxRunning && onStop && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isStopping}
            onClick={(event) => {
              event.stopPropagation();
              onStop();
            }}
            title="Stop sandbox"
          >
            <Square className="h-3.5 w-3.5" />
            {isStopping ? "Stopping" : "Stop"}
          </Button>
        )}
        {hasAiReadme && (
          <Badge variant="info" className="gap-1">
            <Bot className="h-3 w-3" />
            AI Readme
          </Badge>
        )}
        {repo.portalUrl && (
          <Badge variant="outline" className="gap-1">
            <ExternalLink className="h-3 w-3" />
            Live
          </Badge>
        )}
        {onDelete && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isDeleting}
            aria-label={`Delete ${repo.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? "Deleting" : "Delete"}
          </Button>
        )}
      </div>
    </article>
  );
}
