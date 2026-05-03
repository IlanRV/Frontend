import {
  AlertCircle,
  Braces,
  ChevronDown,
  ChevronRight,
  FileCode2,
  ListChecks,
  Package,
  RotateCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ExtractionResponse, FunctionDoc } from "@/types";

interface FunctionsViewerProps {
  extraction?: ExtractionResponse;
  isLoading?: boolean;
  error?: string;
  repoName?: string;
  onRetry?: () => void;
}

function countByType(functions: FunctionDoc[], type: FunctionDoc["type"]) {
  return functions.filter((item) => item.type === type).length;
}

function searchableText(functionDoc: FunctionDoc) {
  return [
    functionDoc.name,
    functionDoc.type,
    functionDoc.file,
    functionDoc.signature,
    functionDoc.description,
    ...functionDoc.params.map((param) => `${param.name} ${param.type} ${param.description}`),
    ...functionDoc.dependencies,
  ]
    .join(" ")
    .toLowerCase();
}

function functionDocKey(functionDoc: FunctionDoc) {
  return `${functionDoc.file}:${functionDoc.line}:${functionDoc.name}:${functionDoc.signature}`;
}

function FunctionCard({
  functionDoc,
  isExpanded,
  onToggle,
}: {
  functionDoc: FunctionDoc;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails =
    functionDoc.params.length > 0 ||
    functionDoc.dependencies.length > 0 ||
    functionDoc.throws.length > 0 ||
    functionDoc.returns.description.trim().length > 0;

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="border-b border-border bg-muted/25 p-0">
        <button
          type="button"
          className="w-full p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onToggle}
          aria-expanded={isExpanded}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                  <Braces className="h-4 w-4" />
                </div>
                <CardTitle className="truncate text-base leading-6">{functionDoc.name}</CardTitle>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">{functionDoc.file}</span>
                </span>
                <span>Line {functionDoc.line}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={functionDoc.type === "class" ? "info" : "secondary"} className="w-fit capitalize">
                {functionDoc.type}
              </Badge>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>
          <code className="mt-3 block overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
            {functionDoc.signature}
          </code>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{functionDoc.description}</p>
        </button>
      </CardHeader>
      {isExpanded && <CardContent className="space-y-4 p-4">
        <p className="text-sm leading-6 text-muted-foreground">{functionDoc.description}</p>

        {hasDetails && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Parameters
              </div>
              {functionDoc.params.length ? (
                <div className="space-y-2">
                  {functionDoc.params.map((param) => (
                    <div key={`${functionDoc.file}:${functionDoc.name}:${param.name}`} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{param.name}</span>
                        <Badge variant="outline">{param.type || "unknown"}</Badge>
                      </div>
                      {param.description && (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{param.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No parameters.</p>
              )}
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                Return Value
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{functionDoc.returns.type || "unknown"}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {functionDoc.returns.description || "No return description provided."}
              </p>
            </div>
          </div>
        )}

        {(functionDoc.dependencies.length > 0 || functionDoc.throws.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Dependencies</div>
              <div className="flex flex-wrap gap-2">
                {functionDoc.dependencies.length ? (
                  functionDoc.dependencies.map((dependency) => (
                    <Badge key={`${functionDoc.file}:${functionDoc.name}:dep:${dependency}`} variant="outline">
                      {dependency}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None listed.</span>
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Throws</div>
              <div className="flex flex-wrap gap-2">
                {functionDoc.throws.length ? (
                  functionDoc.throws.map((item) => (
                    <Badge key={`${functionDoc.file}:${functionDoc.name}:throw:${item}`} variant="warning">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None listed.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>}
    </Card>
  );
}

export function FunctionsViewer({ extraction, isLoading, error, repoName, onRetry }: FunctionsViewerProps) {
  const [query, setQuery] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set());
  const functions = useMemo(() => extraction?.functions ?? [], [extraction?.functions]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFunctions = useMemo(
    () =>
      normalizedQuery
        ? functions.filter((functionDoc) => searchableText(functionDoc).includes(normalizedQuery))
        : functions,
    [functions, normalizedQuery],
  );
  const dependencyCount = Object.keys(extraction?.dependencies ?? {}).length;

  function toggleFunction(functionDoc: FunctionDoc) {
    const key = functionDocKey(functionDoc);
    setExpandedCards((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-600 dark:text-red-300" />
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

  if (!extraction) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Function documentation will appear after extraction finishes.
      </div>
    );
  }

  return (
    <section className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="text-sm text-muted-foreground">Documented</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">{functions.length}</div>
            <p className="text-xs text-muted-foreground">public surfaces</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="text-sm text-muted-foreground">Functions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">{countByType(functions, "function")}</div>
            <p className="text-xs text-muted-foreground">including route handlers</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="text-sm text-muted-foreground">Classes</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">{countByType(functions, "class")}</div>
            <p className="text-xs text-muted-foreground">plus {countByType(functions, "method")} methods</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="text-sm text-muted-foreground">Dependencies</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">{dependencyCount}</div>
            <p className="text-xs text-muted-foreground">from package metadata</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{repoName ?? "Repo"} functions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {extraction.overview?.oneLiner ?? "Structured function documentation from the latest extraction."}
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search functions, files, params"
              className="pl-9"
            />
          </div>
        </div>
        {extraction.techStack && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="info">{extraction.techStack.language}</Badge>
            {extraction.techStack.framework && <Badge variant="outline">{extraction.techStack.framework}</Badge>}
            <Badge variant="outline">{extraction.techStack.runtime}</Badge>
            {extraction.techStack.buildTool && <Badge variant="outline">{extraction.techStack.buildTool}</Badge>}
          </div>
        )}
      </div>

      {functions.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No function docs were returned for this repo yet.
        </div>
      ) : filteredFunctions.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No functions match your search.
        </div>
      ) : (
        <div className={cn("grid gap-4", filteredFunctions.length > 1 && "xl:grid-cols-2")}>
          {filteredFunctions.map((functionDoc) => (
            <FunctionCard
              key={functionDocKey(functionDoc)}
              functionDoc={functionDoc}
              isExpanded={expandedCards.has(functionDocKey(functionDoc))}
              onToggle={() => toggleFunction(functionDoc)}
            />
          ))}
        </div>
      )}
    </section>
  );
}