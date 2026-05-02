import { FolderGit2, Trash2 } from "lucide-react";
import { KeyboardEvent, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { Workspace } from "@/types";

interface WorkspaceCardProps {
  workspace: Workspace;
  onDelete: () => void;
}

export function WorkspaceCard({ workspace, onDelete }: WorkspaceCardProps) {
  const navigate = useNavigate();

  function openWorkspace() {
    navigate(`/workspace/${workspace.id}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWorkspace();
    }
  }

  function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onDelete();
  }

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={openWorkspace}
      onKeyDown={handleKeyDown}
      className="h-full cursor-pointer transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{workspace.name}</CardTitle>
            <CardDescription className="mt-2 line-clamp-2 min-h-10">
              {workspace.description || "No description yet."}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-300"
              onClick={handleDelete}
              title="Delete workspace"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <FolderGit2 className="h-5 w-5" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{workspace.repoCount} repos</span>
        <span>{formatDate(workspace.createdAt)}</span>
      </CardContent>
    </Card>
  );
}
