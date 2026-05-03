import { Activity, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface SectionLoadingProps {
  title: string;
  message: string;
  percent?: number | null;
  detail?: string;
  className?: string;
  compact?: boolean;
}

function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 38;
  }

  return Math.min(100, Math.max(4, Math.round(value)));
}

export function SectionLoading({
  title,
  message,
  percent,
  detail,
  className,
  compact,
}: SectionLoadingProps) {
  const visiblePercent = clampPercent(percent);

  return (
    <div
      className={cn(
        "repo-loading-grid relative flex min-h-[28rem] overflow-hidden rounded-lg border border-cyan-200/60 bg-background p-5 dark:border-cyan-900/60",
        compact ? "min-h-0 p-4" : "items-center justify-center",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.16),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px repo-loading-sweep bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />

      <div className={cn("relative w-full", compact ? "space-y-3" : "max-w-md space-y-5 text-center")}>
        <div className={cn("flex items-center", compact ? "gap-3" : "justify-center gap-3")}>
          <div className="repo-loading-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-cyan-300/50 bg-cyan-50 text-cyan-700 shadow-[0_0_26px_rgba(34,211,238,0.32)] dark:border-cyan-700/70 dark:bg-cyan-950 dark:text-cyan-200">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div className={cn("min-w-0", !compact && "text-left")}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
              <Activity className="h-3.5 w-3.5" />
              Live loading
            </div>
            <h2 className="mt-1 truncate text-base font-semibold">{title}</h2>
          </div>
        </div>

        <div className={cn("space-y-2", compact && "pl-14")}>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">{message}</span>
            <span className="shrink-0 font-medium text-foreground">{visiblePercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-cyan-300/30 bg-muted shadow-inner dark:border-cyan-300/20">
            <div
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-300 transition-all duration-700 ease-out"
              style={{ width: `${visiblePercent}%` }}
            >
              <div className="absolute inset-0 repo-loading-sweep bg-gradient-to-r from-transparent via-white/75 to-transparent" />
            </div>
          </div>
          {detail && (
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}
