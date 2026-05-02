import { Bot, ExternalLink, GitBranch, Play } from "lucide-react";
import { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Repo, RepoStatus } from "@/types";

interface RepoCardProps {
  repo: Repo;
  active?: boolean;
  onOpen: () => void;
  onRun: () => void;
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

export function RepoCard({ repo, active, onOpen, onRun }: RepoCardProps) {
  const canRun = repo.runnability?.canRun ?? repo.runnable ?? false;
  const hasAiReadme = repo.aiReadmeStatus === "ready" || Boolean(repo.aiReadme);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary/70 bg-accent/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
            <h3 className="truncate text-sm font-semibold">{repo.name}</h3>
          </div>
          <p className="mt-2 truncate text-xs text-muted-foreground">{repo.githubUrl}</p>
        </div>
        <Badge variant={statusVariant(repo.status)}>{repo.status}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canRun && (
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
      </div>
    </article>
  );
}
