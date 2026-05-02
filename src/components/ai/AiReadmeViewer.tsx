import { Bot, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AiReadme } from "@/types";

interface AiReadmeViewerProps {
  readme?: AiReadme;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
}

export function AiReadmeViewer({ readme, isLoading, error, onRetry }: AiReadmeViewerProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-2/5" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-4/5" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-red-600 dark:text-red-300">{error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!readme) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center text-center text-sm text-muted-foreground">
        AI README will appear after extraction finishes.
      </div>
    );
  }

  return (
    <article className="space-y-6 p-4">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{readme.title ?? "AI README"}</h2>
          {readme.runCommand && (
            <p className="text-sm text-muted-foreground">Run command: {readme.runCommand}</p>
          )}
        </div>
      </header>

      {readme.summary && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Summary</h3>
          <p className="whitespace-pre-wrap text-sm leading-6">{readme.summary}</p>
        </section>
      )}

      {readme.stack && readme.stack.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Stack</h3>
          <div className="flex flex-wrap gap-2">
            {readme.stack.map((item) => (
              <span key={item} className="rounded-md border border-border px-2 py-1 text-xs">
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      {readme.setup && readme.setup.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Setup</h3>
          <ol className="space-y-2 text-sm">
            {readme.setup.map((step, index) => (
              <li key={`${step}-${index}`} className="rounded-md border border-border bg-card px-3 py-2">
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {readme.notableFiles && readme.notableFiles.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-muted-foreground">
            Notable files
          </h3>
          <div className="space-y-2">
            {readme.notableFiles.map((file) => (
              <div key={file.path} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                <div className="font-mono text-xs text-cyan-700 dark:text-cyan-300">{file.path}</div>
                <p className="mt-1 text-muted-foreground">{file.note}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {readme.risks && readme.risks.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Risks</h3>
          <ul className="space-y-2 text-sm">
            {readme.risks.map((risk) => (
              <li key={risk} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                {risk}
              </li>
            ))}
          </ul>
        </section>
      )}

      {readme.raw && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Raw notes</h3>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6">
            {readme.raw}
          </pre>
        </section>
      )}
    </article>
  );
}
