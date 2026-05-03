import QRCode from "qrcode";
import { Copy, ExternalLink, QrCode, ShieldAlert, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { projectKindLabel } from "@/lib/security";
import { cn } from "@/lib/utils";
import type { RepoProjectKind, SecurityScan, TerminalLine } from "@/types";

interface RunInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalUrl?: string;
  previewPath?: string;
  previewPaths?: string[];
  riskLevel?: SecurityScan["riskLevel"];
  command?: string;
  projectKind?: RepoProjectKind;
  runtimeEventCount?: number;
  isStopping?: boolean;
  onStop?: () => void;
  terminalLines: TerminalLine[];
  terminalRef?: RefObject<HTMLDivElement | null>;
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

export function RunInspectionDialog({
  open,
  onOpenChange,
  portalUrl,
  previewPath,
  previewPaths,
  riskLevel,
  command,
  projectKind,
  runtimeEventCount = 0,
  isStopping,
  onStop,
  terminalLines,
}: RunInspectionDialogProps) {
  const [path, setPath] = useState(previewPath ?? "/");
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const iframeUrl = portalUrl ? appendPortalPath(portalUrl, path) : undefined;
  const isHighRisk = riskLevel === "critical" || riskLevel === "high";
  const suggestions = useMemo(() => {
    const detected = previewPaths ?? [];
    const defaults = detected.length > 0 ? [previewPath, ...detected] : [previewPath ?? "/"];
    return [...new Set(defaults.filter((item): item is string => Boolean(item)).map(normalizePreviewPath))].slice(0, 6);
  }, [previewPath, previewPaths]);

  useEffect(() => {
    setPath(previewPath ?? "/");
  }, [portalUrl, previewPath]);

  useEffect(() => {
    if (!isQrVisible || !iframeUrl) {
      setQrDataUrl(undefined);
      return;
    }

    let isMounted = true;

    void QRCode.toDataURL(iframeUrl, { margin: 1, width: 220 }).then((dataUrl) => {
      if (isMounted) {
        setQrDataUrl(dataUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [iframeUrl, isQrVisible]);

  function copyPreviewUrl() {
    if (!iframeUrl) {
      return;
    }

    void navigator.clipboard?.writeText(iframeUrl);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[86rem] overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              Run inspector
            </DialogTitle>
            <DialogDescription className="mt-1">
              {portalUrl ? "Inspect the BrowserPod preview and sandbox console together." : "Watch sandbox output while the command runs."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-5rem)] min-h-[32rem] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
          <section className="min-h-0 overflow-hidden border-b border-border lg:border-b-0 lg:border-r" aria-label="BrowserPod preview">
            {iframeUrl ? (
              <div className="flex h-full min-h-[22rem] flex-col bg-background">
                <div className="space-y-3 border-b border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Sandboxed by BrowserPod</Badge>
                    {projectKind && <Badge variant="secondary">{projectKindLabel(projectKind)}</Badge>}
                    {command && <Badge variant="outline">{command}</Badge>}
                    {runtimeEventCount > 0 && <Badge variant="warning">{runtimeEventCount} runtime alert(s)</Badge>}
                    {isHighRisk && <Badge variant="danger">High-risk repo</Badge>}
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
                  <div className="flex flex-wrap gap-2">
                    {onStop && (
                      <Button type="button" variant="outline" size="sm" onClick={onStop} disabled={isStopping}>
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={copyPreviewUrl}>
                      <Copy className="h-4 w-4" />
                      Copy link
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsQrVisible((visible) => !visible)}>
                      <QrCode className="h-4 w-4" />
                      {isQrVisible ? "Hide QR code" : "Show QR code"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href={iframeUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open preview
                      </a>
                    </Button>
                  </div>
                  {isQrVisible && (
                    <div className="inline-flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-3 text-xs text-slate-700">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="QR code for BrowserPod preview" className="h-36 w-36" />
                      ) : (
                        <div className="flex h-36 w-36 items-center justify-center text-muted-foreground">Generating QR...</div>
                      )}
                      <span>Scan to open this BrowserPod preview.</span>
                    </div>
                  )}
                </div>
                <iframe title="BrowserPod live preview" src={iframeUrl} className="min-h-[22rem] flex-1 bg-white" />
              </div>
            ) : (
              <div className="flex h-full min-h-[22rem] items-center justify-center bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">Console-only command</p>
                  <p className="mt-2 max-w-sm">No BrowserPod portal has opened yet. Watch the command output while the sandbox runs.</p>
                </div>
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-col" aria-label="Sandbox console">
            <div className="border-b border-border p-3">
              <h3 className="text-sm font-semibold">Console</h3>
              <p className="mt-1 text-xs text-muted-foreground">Live BrowserPod output for this run.</p>
            </div>
            <div className="min-h-[18rem] flex-1 overflow-auto bg-black p-3 font-mono text-xs text-zinc-100">
              {terminalLines.length > 0 ? terminalLines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "whitespace-pre-wrap",
                    line.stream === "stderr" && "text-red-300",
                    line.stream === "system" && "text-cyan-200",
                  )}
                >
                  {line.text}
                </div>
              )) : (
                <div className="text-zinc-400">Waiting for sandbox output...</div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}