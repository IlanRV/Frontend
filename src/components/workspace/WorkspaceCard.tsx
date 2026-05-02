import { FolderGit2 } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { Workspace } from "@/types";

interface WorkspaceCardProps {
  workspace: Workspace;
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <Link to={`/workspace/${workspace.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full transition-colors hover:border-primary/60 hover:bg-accent/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{workspace.name}</CardTitle>
              <CardDescription className="mt-2 line-clamp-2 min-h-10">
                {workspace.description || "No description yet."}
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <FolderGit2 className="h-5 w-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{workspace.repoCount} repos</span>
          <span>{formatDate(workspace.createdAt)}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
