import { Play, Square, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAutoPreviewCommand,
  getManualCommands,
  isAnalysisOnly,
  isManualOnly,
  projectKindLabel,
  runtimeRunLabel,
  supportLevelLabel,
} from "@/lib/security";
import type { RunnabilityResult, RuntimeCommandSuggestion, SandboxCommandRun, TerminalLine } from "@/types";

interface RuntimeProfileCardProps {
  runnability?: RunnabilityResult | null;
  isBusy?: boolean;
  commandRuns?: Record<string, SandboxCommandRun>;
  terminalLines?: TerminalLine[];
  onRunAuto?: (command: string) => void;
  onRunManualCommand?: (command: RuntimeCommandSuggestion) => void;
  onStopManualCommand?: (command: RuntimeCommandSuggestion) => void;
}

function commandDescription(command: RuntimeCommandSuggestion) {
  return command.description ?? command.reason ?? "Suggested sandbox command";
}

function commandLabel(command: RuntimeCommandSuggestion) {
  return command.label?.trim() || command.command;
}

function commandRunButtonText(label: string) {
  return label.toLowerCase().startsWith("run ") ? `${label} in BrowserPod` : `Run ${label} in BrowserPod`;
}

function manualOnlyMessage(runnability: RunnabilityResult | null | undefined) {
  switch (runnability?.runtimeProfile?.projectKind) {
    case "api-server":
      return "This API server has sandbox commands, but DevHub will not assume a safe preview route. Run one manually inside BrowserPod when you want to inspect it.";
    case "library":
      return "This repo looks like a library package, so DevHub will not auto-start a preview. Use manual sandbox commands for tests or examples only.";
    case "cli":
      return "This repo looks like a CLI, so DevHub will not auto-open a browser preview. Run a suggested command only inside BrowserPod.";
    case "test-only":
      return "This repo is mostly tests or fixtures, so DevHub will not auto-start a preview.";
    case "unknown":
      return "No reliable preview command could be inferred. Use manual sandbox commands only if you want to inspect startup behavior.";
    default:
      return "This repo has useful sandbox commands, but DevHub will not auto-open a preview. Run a suggested command only when you want to inspect it in BrowserPod.";
  }
}

function analysisOnlyMessage(runnability: RunnabilityResult | null | undefined) {
  switch (runnability?.runtimeProfile?.projectKind) {
    case "library":
      return "This repo is a library package. DevHub will analyze the code, but it will not start a BrowserPod preview automatically.";
    case "cli":
      return "This repo is a command-line tool. DevHub will analyze it without launching an automatic browser preview.";
    case "test-only":
      return "This repo is mostly tests or fixtures. DevHub keeps it analysis-only unless you inspect commands manually elsewhere.";
    case "unknown":
      return "No reliable preview command could be inferred. DevHub will keep this repo analysis-only.";
    default:
      return "This repo is analysis-only. It may be a library, CLI, test fixture, or unsupported project type, so DevHub will not start it automatically.";
  }
}

function commandOutput(run: SandboxCommandRun | undefined, terminalLines: TerminalLine[] | undefined) {
  if (!run) {
    return [];
  }

  const startedAt = Date.parse(run.outputStartedAt ?? run.startedAt);
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : undefined;

  return (terminalLines ?? [])
    .filter((line) => {
      const createdAt = Date.parse(line.createdAt);

      if (Number.isFinite(startedAt) && createdAt < startedAt) {
        return false;
      }

      if (finishedAt && createdAt > finishedAt) {
        return false;
      }

      return line.stream === "stdout" || line.stream === "stderr" || line.stream === "system";
    })
    .slice(-8);
}

function isRunningStatus(run: SandboxCommandRun | undefined) {
  return run?.status === "starting" || run?.status === "running" || run?.status === "stopping";
}

export function RuntimeProfileCard({ runnability, isBusy, commandRuns, terminalLines, onRunAuto, onRunManualCommand, onStopManualCommand }: RuntimeProfileCardProps) {
  const [areDetailsOpen, setAreDetailsOpen] = useState(false);
  const profile = runnability?.runtimeProfile;
  const autoCommand = getAutoPreviewCommand(runnability);
  const manualCommands = getManualCommands(runnability);
  const hasRuntimeProfileFields = Boolean(profile || runnability?.autoCommand || manualCommands.length > 0);

  if (!hasRuntimeProfileFields) {
    return null;
  }

  return (
    <Card className="mb-4 shadow-none">
      <CardHeader className="gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
              Runtime profile
            </CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              DevHub only runs commands inside BrowserPod. Backend profile data decides whether a repo gets an automatic preview or manual guidance.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Badge variant="outline">{projectKindLabel(profile?.projectKind)}</Badge>
            <Badge variant={profile?.supportLevel === "auto-preview" ? "success" : profile?.supportLevel === "manual-only" ? "warning" : "secondary"}>
              {supportLevelLabel(profile?.supportLevel)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 text-sm">
        {autoCommand && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Auto preview command</p>
                <p className="mt-1 font-mono text-xs">{autoCommand}</p>
              </div>
              {onRunAuto && (
                <Button type="button" variant="success" size="sm" disabled={isBusy} onClick={() => onRunAuto(autoCommand)}>
                  <Play className="h-4 w-4" />
                  {runtimeRunLabel(runnability)}
                </Button>
              )}
            </div>
            <p className="leading-6 text-emerald-900/80 dark:text-emerald-100/80">
              This project is expected to open a BrowserPod portal automatically.
            </p>
          </div>
        )}

        {isManualOnly(runnability) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {manualOnlyMessage(runnability)}
          </div>
        )}

        {isAnalysisOnly(runnability) && (
          <div className="rounded-md border border-border bg-muted/40 p-3 leading-6 text-muted-foreground">
            {analysisOnlyMessage(runnability)}
          </div>
        )}

        {manualCommands.length > 0 && (
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold">Manual sandbox commands</h3>
              <p className="mt-1 text-muted-foreground">These are suggestions, not trusted commands. They run only inside BrowserPod.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {manualCommands.map((command) => {
                const run = commandRuns?.[command.command];
                const output = commandOutput(run, terminalLines);
                const label = commandLabel(command);
                const isCommandRunning = isRunningStatus(run);

                return (
                  <div key={command.command} className="rounded-md border border-border bg-background p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{command.source ?? "unknown"}</Badge>
                      <Badge variant={command.confidence === "high" ? "success" : command.confidence === "medium" ? "warning" : "secondary"}>
                        {command.confidence ?? "low"} confidence
                      </Badge>
                      {command.previewExpected && <Badge variant="info">preview</Badge>}
                    </div>
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="mt-1 break-words font-mono text-xs text-foreground">{command.command}</p>
                    <p className="mt-2 leading-6 text-muted-foreground">{commandDescription(command)}</p>
                    {command.evidence && (
                      <p className="mt-2 break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">
                        {command.evidence}
                      </p>
                    )}
                    {run && (
                      <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={run.status === "failed" ? "danger" : run.status === "completed" ? "success" : "info"}>
                            Status: {run.status}
                          </Badge>
                          {run.message && <span className="text-muted-foreground">{run.message}</span>}
                        </div>
                        <div className="max-h-36 overflow-auto rounded bg-black p-2 font-mono text-xs text-zinc-100" aria-label={`${label} BrowserPod output`}>
                          {output.length > 0 ? output.map((line) => (
                            <div key={line.id} className={line.stream === "stderr" ? "text-red-300" : line.stream === "system" ? "text-cyan-200" : undefined}>
                              {line.text}
                            </div>
                          )) : (
                            <div className="text-zinc-400">Waiting for sandbox output. Full output also appears in Console.</div>
                          )}
                        </div>
                      </div>
                    )}
                    {onRunManualCommand && !isAnalysisOnly(runnability) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy || isCommandRunning}
                          onClick={() => onRunManualCommand(command)}
                        >
                          <Play className="h-4 w-4" />
                          {commandRunButtonText(label)}
                        </Button>
                        {onStopManualCommand && isCommandRunning && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={run?.status === "stopping"}
                            onClick={() => onStopManualCommand(command)}
                          >
                            <Square className="h-4 w-4" />
                            Stop {label}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(profile?.reasoning || (profile?.evidence && profile.evidence.length > 0)) && (
          <div className="rounded-md border border-border bg-muted/30">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={areDetailsOpen}
              onClick={() => setAreDetailsOpen((open) => !open)}
            >
              Runtime details
            </button>
            {areDetailsOpen && (
              <div className="space-y-3 border-t border-border p-3">
                {profile.reasoning && (
                  <div className="leading-6 text-muted-foreground">
                    <span className="font-semibold text-foreground">Reasoning: </span>{profile.reasoning}
                  </div>
                )}

                {profile.evidence && profile.evidence.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold">Runtime evidence</h3>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {profile.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
