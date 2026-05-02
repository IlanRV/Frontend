import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PortalPreviewProps {
  portalUrl?: string;
  previewPath?: string;
  previewPaths?: string[];
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

export function PortalPreview({ portalUrl, previewPath, previewPaths }: PortalPreviewProps) {
  const [path, setPath] = useState(previewPath ?? "/");
  const iframeUrl = portalUrl ? appendPortalPath(portalUrl, path) : undefined;
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
          <span className="truncate text-muted-foreground">{iframeUrl}</span>
          <Button variant="ghost" size="sm" asChild>
            <a href={iframeUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          </Button>
        </div>
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
      </div>
      <iframe title="BrowserPod live preview" src={iframeUrl} className="h-full min-h-[32rem] w-full bg-white" />
    </div>
  );
}
