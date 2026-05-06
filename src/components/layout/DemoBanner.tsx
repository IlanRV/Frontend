import { Info } from "lucide-react";

export function DemoBanner() {
  return (
    <footer className="border-t border-border bg-gradient-to-r from-cyan-50/80 via-sky-50/60 to-cyan-50/80 dark:from-cyan-950/40 dark:via-sky-950/30 dark:to-cyan-950/40">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Info className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
          <span className="font-semibold text-foreground">Demo mode</span> —
          You're viewing a read-only preview of DevHub. Full functionality including
          creating workspaces, adding repos, and running projects in BrowserPod is available
          in the live version. All data shown here is for demonstration purposes.
        </p>
      </div>
    </footer>
  );
}
