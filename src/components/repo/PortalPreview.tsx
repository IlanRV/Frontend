import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PortalPreviewProps {
  portalUrl?: string;
}

export function PortalPreview({ portalUrl }: PortalPreviewProps) {
  if (!portalUrl) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
        Run the project to open a live BrowserPod portal.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex h-11 items-center justify-between border-b border-border px-3 text-sm">
        <span className="truncate text-muted-foreground">{portalUrl}</span>
        <Button variant="ghost" size="sm" asChild>
          <a href={portalUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open
          </a>
        </Button>
      </div>
      <iframe title="BrowserPod live preview" src={portalUrl} className="h-full min-h-[32rem] w-full bg-white" />
    </div>
  );
}
