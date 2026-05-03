import { AlertTriangle, CheckCircle2, FileWarning, PackageSearch, RotateCw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeRunnabilityBlockers, severityRank } from "@/lib/security";
import type { ExtractionResponse, RunnabilityResult, SandboxSecurityEvent, SecurityFinding, SecuritySeverity } from "@/types";

interface SecurityOverviewProps {
  extraction?: ExtractionResponse;
  runnability?: RunnabilityResult | null;
  runtimeEvents?: SandboxSecurityEvent[];
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
}

function severityVariant(severity: SecuritySeverity | "unknown") {
  switch (severity) {
    case "critical":
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
    case "info":
      return "info";
    default:
      return "outline";
  }
}

function severityLabel(severity: SecuritySeverity | "unknown") {
  return severity === "unknown" ? "Unknown" : severity[0].toUpperCase() + severity.slice(1);
}

function groupedFindings(findings: SecurityFinding[]) {
  const groups = new Map<string, SecurityFinding[]>();

  for (const finding of [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))) {
    const key = `${severityLabel(finding.severity)} / ${finding.category}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }

  return [...groups.entries()];
}

export function SecurityOverview({ extraction, runnability, runtimeEvents = [], isLoading, error, onRetry }: SecurityOverviewProps) {
  const security = extraction?.security;
  const effectiveRunnability = runnability ?? extraction?.runnability;
  const blockers = normalizeRunnabilityBlockers(effectiveRunnability);
  const findingCount = security?.findings.length ?? 0;
  const dependencyRiskCount = security?.dependencyRisks.length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-600 dark:text-red-300" />
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

  if (!security) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Security scan results will appear after extraction finishes.
      </div>
    );
  }

  return (
    <section className="space-y-4 p-4">
      {blockers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900 shadow-none dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              This repository cannot be started automatically
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <p className="text-sm leading-6">
              DevHub analyzed the project files but could not find a safe automatic startup path.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {blockers.map((blocker) => (
                <div key={blocker.code} className="rounded-md border border-amber-300/70 bg-background/70 p-3 text-sm dark:border-amber-800/70">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{blocker.title}</h3>
                    <Badge variant={severityVariant(blocker.severity)}>{severityLabel(blocker.severity)}</Badge>
                  </div>
                  <p className="leading-6 text-muted-foreground">{blocker.description}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{blocker.recommendation}</p>
                  {blocker.evidence && (
                    <p className="mt-2 break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">
                      {blocker.evidence}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {runtimeEvents.length > 0 && (
        <Card className="border-cyan-200 bg-cyan-50 text-cyan-950 shadow-none dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              BrowserPod runtime alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0 lg:grid-cols-2">
            {runtimeEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-cyan-300/70 bg-background/70 p-3 text-sm dark:border-cyan-800/70">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{event.title}</h3>
                  <Badge variant={severityVariant(event.severity)}>{severityLabel(event.severity)}</Badge>
                </div>
                <p className="leading-6 text-muted-foreground">{event.description}</p>
                {event.evidence && (
                  <p className="mt-2 break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">
                    {event.evidence}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              Risk Level
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Badge variant={severityVariant(security.riskLevel)} className="text-sm">
              {severityLabel(security.riskLevel)}
            </Badge>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileWarning className="h-4 w-4" />
              Findings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">{findingCount}</div>
            <p className="text-xs text-muted-foreground">code, config, and script items</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <PackageSearch className="h-4 w-4" />
              Packages
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">{dependencyRiskCount}</div>
            <p className="text-xs text-muted-foreground">dependency risks to review</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader className="p-4">
          <CardTitle className="flex items-center gap-2 text-base">
            {findingCount || dependencyRiskCount ? (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            )}
            Security Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <p className="text-sm leading-6 text-muted-foreground">{security.summary}</p>
          {security.notes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {security.notes.map((note) => (
                <Badge key={note} variant="outline" className="max-w-full whitespace-normal text-left leading-5">
                  {note}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {security.findings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Findings</h3>
          {groupedFindings(security.findings).map(([group, findings]) => (
            <div key={group} className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{group}</h4>
              {findings.map((finding) => (
                <Card key={`${finding.file}:${finding.line}:${finding.title}:${finding.evidence}`} className="shadow-none">
                  <CardHeader className="gap-3 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <CardTitle className="text-base leading-6">{finding.title}</CardTitle>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {finding.file}{finding.line ? `:${finding.line}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
                        <Badge variant="outline">{finding.category}</Badge>
                        <Badge variant="outline">{finding.confidence} confidence</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 pt-0 text-sm leading-6">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Evidence</div>
                      <p className="mt-1 break-words rounded-md border border-border bg-muted/35 p-3 font-mono text-xs">
                        {finding.evidence}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Impact</div>
                        <p className="mt-1 text-muted-foreground">{finding.impact}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Recommendation</div>
                        <p className="mt-1 text-muted-foreground">{finding.recommendation}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      {security.dependencyRisks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Dependency Review</h3>
          <div className="grid gap-3 xl:grid-cols-2">
            {security.dependencyRisks.map((risk) => (
              <Card key={`${risk.packageName}:${risk.version}:${risk.risk}`} className="shadow-none">
                <CardHeader className="gap-2 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{risk.packageName}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">{risk.version ?? "version not provided"}</p>
                    </div>
                    <Badge variant={severityVariant(risk.severity)}>{risk.severity}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0 text-sm leading-6 text-muted-foreground">
                  <p className="font-medium text-foreground">{risk.risk}</p>
                  <p>{risk.reason}</p>
                  <p>{risk.recommendation}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}