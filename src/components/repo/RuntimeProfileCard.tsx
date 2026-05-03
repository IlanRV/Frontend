import { ChevronDown, ChevronUp, Play, Square, TerminalSquare } from "lucide-react";
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
  isRunning?: boolean;
  hasInspector?: boolean;
  activeCommand?: string;
  commandRuns?: Record<string, SandboxCommandRun>;
  terminalLines?: TerminalLine[];
  onOpenInspector?: () => void;
  onStopRun?: () => void;
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

function commandHint(command: RuntimeCommandSuggestion) {
  return [command.source, command.reason, command.evidence, command.description].filter(Boolean).join(" ").toLowerCase();
}

function commandBadgeLabel(command: RuntimeCommandSuggestion) {
  if (command.source) {
    return command.source;
  }

  const hint = commandHint(command);

  if (/workspace|package\.json|package script|root package|npm workspace/.test(hint)) {
    return "Workspace script";
  }

  if (/readme|documentation|docs/.test(hint)) {
    return "README instruction";
  }

  return "Suggested command";
}

function runtimeEvidenceSummary(runnability: RunnabilityResult | null | undefined) {
  return runnability?.runtimeProfile?.evidence?.slice(0, 2).join(" · ");
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

function alternateRunSummary(count: number) {
  if (count === 0) {
    return "No alternate runs";
  }

  return `${count} alternate run${count === 1 ? "" : "s"}`;
}

interface RunPathOption {
  key: string;
  label: string;
  command: string;
  isManual: boolean;
  manualCommand?: RuntimeCommandSuggestion;
}

function commandSourceLabel(command: RuntimeCommandSuggestion) {
  switch (command.source) {
    case "ai":
      return "AI suggestion";
    case "readme":
      return "Documentation";
    case "package-script":
      return "Package script";
    case "static-analysis":
      return "Static analysis";
    case "package-manager":
      return "Package manager";
    default:
      return commandBadgeLabel(command);
  }
}

export function RuntimeProfileCard({
  runnability,
  isBusy,
  isRunning,
  hasInspector,
  activeCommand,
  commandRuns,
  terminalLines,
  onOpenInspector,
  onStopRun,
  onRunAuto,
  onRunManualCommand,
  onStopManualCommand,
}: RuntimeProfileCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [areDetailsOpen, setAreDetailsOpen] = useState(false);
  const profile = runnability?.runtimeProfile;
  const autoCommand = getAutoPreviewCommand(runnability);
  const manualCommands = getManualCommands(runnability);
  const runPathOptions: RunPathOption[] = [
    ...(autoCommand ? [{ key: "official", label: `Official BrowserPod: ${autoCommand}`, command: autoCommand, isManual: false }] : []),
    ...manualCommands.map((command, index) => ({
      key: `manual-${index}`,
      label: `${commandSourceLabel(command)}: ${commandLabel(command)} — ${command.command}`,
      command: command.command,
      isManual: true,
      manualCommand: command,
    })),
  ];
  const [selectedRunPath, setSelectedRunPath] = useState(runPathOptions[0]?.key ?? "");
  const selectedRunOption = runPathOptions.find((option) => option.key === selectedRunPath) ?? runPathOptions[0];
  const hasManualRuns = manualCommands.length > 0;
  const hasActiveManualRun = Object.values(commandRuns ?? {}).some(isRunningStatus);
  const selectedRun = selectedRunOption?.isManual ? commandRuns?.[selectedRunOption.command] : undefined;
  const isSelectedRunning = isRunningStatus(selectedRun);
  const hasActiveRun = Boolean(isRunning || hasActiveManualRun);
  const hasRuntimeProfileFields = Boolean(profile || runnability?.autoCommand || manualCommands.length > 0);
  const evidenceSummary = runtimeEvidenceSummary(runnability);

  if (!hasRuntimeProfileFields) {
    return null;
  }

  function runSelectedPath() {
    if (!selectedRunOption) {
      return;
    }

    if (selectedRunOption.isManual && selectedRunOption.manualCommand) {
      onRunManualCommand?.(selectedRunOption.manualCommand);
      return;
    }

    onRunAuto?.(selectedRunOption.command);
  }

  return (
    <Card className="mb-4 overflow-hidden border-cyan-200/70 bg-card/95 shadow-none dark:border-cyan-900/50">
      <CardHeader className="p-0">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            className="group flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className="mt-0.5 rounded-md border border-cyan-200 bg-cyan-50 p-2 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300">
              <TerminalSquare className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-base">
                Runtime profile
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardTitle>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                BrowserPod-only execution with compact run choices. Expand to choose the official path or inspect alternate sandbox runs.
              </span>
              {hasActiveRun && activeCommand && (
                <span className="mt-2 block truncate font-mono text-xs text-foreground">{activeCommand}</span>
              )}
            </span>
          </button>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{projectKindLabel(profile?.projectKind)}</Badge>
            <Badge variant={profile?.supportLevel === "auto-preview" ? "success" : profile?.supportLevel === "manual-only" ? "warning" : "secondary"}>
              {supportLevelLabel(profile?.supportLevel)}
            </Badge>
            {autoCommand ? <Badge variant="success">Official run available</Badge> : <Badge variant="secondary">No official auto-run</Badge>}
            {hasManualRuns && <Badge variant="info">{alternateRunSummary(manualCommands.length)}</Badge>}
            {hasActiveRun && <Badge variant="info">Running</Badge>}
            {hasInspector && onOpenInspector && (
              <Button type="button" variant="outline" size="sm" onClick={onOpenInspector}>
                View run inspector
              </Button>
            )}
          </div>
        </div>
        {runPathOptions.length > 0 && !isAnalysisOnly(runnability) && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Run path
                <select
                  value={selectedRunOption?.key ?? ""}
                  onChange={(event) => setSelectedRunPath(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isBusy}
                >
                  {runPathOptions.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant={selectedRunOption?.isManual ? "outline" : "success"}
                size="sm"
                disabled={isBusy || hasActiveRun || isSelectedRunning || !selectedRunOption}
                onClick={runSelectedPath}
              >
                <Play className="h-4 w-4" />
                Run selected in BrowserPod
              </Button>
              {hasActiveRun && onStopRun && (
                <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={onStopRun}>
                  <Square className="h-4 w-4" />
                  Stop current run
                </Button>
              )}
            </div>
          </div>
        )}
      </CardHeader>
      {isOpen && <CardContent className="space-y-4 border-t border-border p-4 text-sm">
        {autoCommand && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="success">Official BrowserPod run</Badge>
                  <Badge variant="info">opens preview</Badge>
                </div>
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
              This is the best automatic preview path from the backend runtime profile.
            </p>
            {evidenceSummary && (
              <p className="mt-2 break-words rounded-md border border-emerald-200/70 bg-white/60 p-2 font-mono text-xs text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-100">
                Evidence: {evidenceSummary}
              </p>
            )}
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
              <h3 className="font-semibold">Alternate sandbox runs</h3>
              <p className="mt-1 text-muted-foreground">Documentation, package scripts, and AI-inferred options. They are suggestions, not trusted commands.</p>
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
                      <Badge variant="outline">{commandBadgeLabel(command)}</Badge>
                      <Badge variant={command.confidence === "high" ? "success" : command.confidence === "medium" ? "warning" : "secondary"}>
                        {command.confidence ?? "low"} confidence
                      </Badge>
                      <Badge variant={command.previewExpected ? "info" : "secondary"}>{command.previewExpected ? "opens preview" : "console-only"}</Badge>
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
      </CardContent>}
    </Card>
  );
}
