import { ExternalLink, ShieldAlert, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectKindLabel } from "@/lib/security";
import type { RepoProjectKind, SecurityScan } from "@/types";

interface PortalPreviewProps {
  portalUrl?: string;
  previewPath?: string;
  previewPaths?: string[];
  riskLevel?: SecurityScan["riskLevel"];
  command?: string;
  projectKind?: RepoProjectKind;
  runtimeEventCount?: number;
  isStopping?: boolean;
  onStop?: () => void;
}

function normalizePreviewPath(path: string) {
  const trimmed = path.trim();

  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function appendPortalPath(portalUrl: string, path: string) {
  const url = new URL(portalUrl);
  url.pathname = normalizePreviewPath(path);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function PortalPreview({ portalUrl, previewPath, previewPaths, riskLevel, command, projectKind, runtimeEventCount = 0, isStopping, onStop }: PortalPreviewProps) {
  const [path, setPath] = useState(previewPath ?? "/");
  const iframeUrl = portalUrl ? appendPortalPath(portalUrl, path) : undefined;
  const isHighRisk = riskLevel === "critical" || riskLevel === "high";
  const suggestions = useMemo(() => {
    const detected = previewPaths ?? [];
    const defaults =
      detected.length > 0
        ? [previewPath, ...detected]
        : [previewPath ?? "/"];
    return [...new Set(defaults.filter((item): item is string => Boolean(item)).map(normalizePreviewPath))].slice(0, 8);
  }, [previewPath, previewPaths]);
  const hasApiSuggestions = suggestions.some((suggestion) => suggestion !== "/");

  useEffect(() => {
    setPath(previewPath ?? "/");
  }, [portalUrl, previewPath]);

  if (!portalUrl) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
        Run the project to open a live BrowserPod portal.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="space-y-3 border-b border-border p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                Sandboxed by BrowserPod
              </Badge>
              {projectKind && <Badge variant="secondary">{projectKindLabel(projectKind)}</Badge>}
              {command && <Badge variant="outline">{command}</Badge>}
              {runtimeEventCount > 0 && <Badge variant="warning">{runtimeEventCount} runtime alert(s)</Badge>}
              {isHighRisk && <Badge variant="danger">High-risk repo</Badge>}
            </div>
            <span className="block truncate text-muted-foreground">{iframeUrl}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onStop && (
              <Button variant="outline" size="sm" onClick={onStop} disabled={isStopping}>
                <Square className="h-4 w-4" />
                Stop sandbox
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href={iframeUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open
              </a>
            </Button>
          </div>
        </div>
        <p className="rounded-md border border-cyan-200 bg-cyan-50 p-2 text-xs leading-5 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100">
          Running inside BrowserPod sandbox. This project cannot access your real filesystem, shell, SSH keys, cloud credentials, or local environment.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            aria-label="Preview path"
            className="h-9 font-mono text-xs"
            placeholder="/api/health"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => setPath(normalizePreviewPath(path))}>
            Load path
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant={normalizePreviewPath(path) === suggestion ? "secondary" : "outline"}
              size="sm"
              onClick={() => setPath(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        {hasApiSuggestions && (
          <p className="text-xs text-muted-foreground">
            API servers often do not render a homepage at <span className="font-mono">/</span>. Try a detected route like{" "}
            <span className="font-mono">{suggestions.find((suggestion) => suggestion !== "/")}</span>.
          </p>
        )}
        {isHighRisk && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Static analysis found high-risk behavior. Keep interaction inside the BrowserPod preview and stop the sandbox if it hangs or behaves unexpectedly.
          </p>
        )}
      </div>
      <iframe title="BrowserPod live preview" src={iframeUrl} className="h-full min-h-[32rem] w-full bg-white" />
    </div>
  );
}
