import { cn } from "@/lib/utils";
import type { AnalysisProgress, ExtractionResponse, Repo } from "@/types";

interface ExtractionProgressLineProps {
  repo?: Pick<Repo, "status" | "analysisProgress" | "aiReadmeStatus">;
  extraction?: Pick<ExtractionResponse, "status" | "analysisProgress" | "aiReadmeStatus">;
  className?: string;
  compact?: boolean;
}

function fallbackProgress(
  status: Repo["status"] | ExtractionResponse["status"] | undefined,
  aiReadmeStatus: string | null | undefined,
): AnalysisProgress | null {
  const updatedAt = new Date().toISOString();

  if (status === "cloning") {
    return {
      phase: "queued",
      percent: 14,
      message: "Preparing source",
      updatedAt,
    };
  }

  if (status === "analyzing") {
    return {
      phase: aiReadmeStatus === "pending" ? "readme" : "querying",
      percent: aiReadmeStatus === "pending" ? 84 : 52,
      message: aiReadmeStatus === "pending" ? "Building AI README" : "Analyzing repo",
      updatedAt,
    };
  }

  return null;
}

function visibleProgress(
  repo?: ExtractionProgressLineProps["repo"],
  extraction?: ExtractionProgressLineProps["extraction"],
) {
  const status = repo?.status ?? extraction?.status;
  const aiReadmeStatus = repo?.aiReadmeStatus ?? extraction?.aiReadmeStatus;
  const progress = repo?.analysisProgress ?? extraction?.analysisProgress ?? fallbackProgress(status, aiReadmeStatus);

  if (!progress) {
    return null;
  }

  if (progress.phase === "complete" && status !== "analyzing" && status !== "cloning") {
    return null;
  }

  return progress;
}

export function ExtractionProgressLine({ repo, extraction, className, compact }: ExtractionProgressLineProps) {
  const progress = visibleProgress(repo, extraction);

  if (!progress) {
    return null;
  }

  const isError = progress.phase === "error";

  return (
    <div
      className={cn(
        compact
          ? "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
          : "flex w-full min-w-0 items-center gap-2 sm:w-72",
        className,
      )}
    >
      <div className={cn("h-1.5 min-w-0 overflow-hidden rounded-full border border-cyan-300/30 bg-muted shadow-inner dark:border-cyan-300/20", !compact && "flex-1")}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            isError
              ? "bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.7)]"
              : "bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-lime-300 shadow-[0_0_16px_rgba(34,211,238,0.8)]",
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className={cn("shrink-0 truncate text-[11px] font-medium text-muted-foreground", compact ? "max-w-24" : "max-w-40")}>
        {progress.message} {progress.percent}%
      </span>
    </div>
  );
}