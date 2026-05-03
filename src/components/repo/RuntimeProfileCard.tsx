import { Play, TerminalSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAutoPreviewCommand,
  getManualCommands,
  isAnalysisOnly,
  isManualOnly,
  projectKindLabel,
  supportLevelLabel,
} from "@/lib/security";
import type { RunnabilityResult, RuntimeCommandSuggestion } from "@/types";

interface RuntimeProfileCardProps {
  runnability?: RunnabilityResult | null;
  isBusy?: boolean;
  onRunAuto?: (command: string) => void;
  onRunManualCommand?: (command: RuntimeCommandSuggestion) => void;
}

function commandDescription(command: RuntimeCommandSuggestion) {
  return command.description ?? command.reason ?? "Suggested sandbox command";
}

export function RuntimeProfileCard({ runnability, isBusy, onRunAuto, onRunManualCommand }: RuntimeProfileCardProps) {
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
                  Run preview
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
            This repo has useful sandbox commands, but DevHub will not auto-open a preview. Run a suggested command only when you want to inspect it in BrowserPod.
          </div>
        )}

        {isAnalysisOnly(runnability) && (
          <div className="rounded-md border border-border bg-muted/40 p-3 leading-6 text-muted-foreground">
            This repo is analysis-only. It may be a library, CLI, test fixture, or unsupported project type, so DevHub will not start it automatically.
          </div>
        )}

        {manualCommands.length > 0 && (
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold">Manual sandbox commands</h3>
              <p className="mt-1 text-muted-foreground">These are suggestions, not trusted commands. They run only inside BrowserPod.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {manualCommands.map((command) => (
                <div key={command.command} className="rounded-md border border-border bg-background p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{command.source ?? "unknown"}</Badge>
                    <Badge variant={command.confidence === "high" ? "success" : command.confidence === "medium" ? "warning" : "secondary"}>
                      {command.confidence ?? "low"} confidence
                    </Badge>
                    {command.previewExpected && <Badge variant="info">preview</Badge>}
                  </div>
                  <p className="break-words font-mono text-xs text-foreground">{command.command}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{commandDescription(command)}</p>
                  {command.evidence && (
                    <p className="mt-2 break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">
                      {command.evidence}
                    </p>
                  )}
                  {onRunManualCommand && !isAnalysisOnly(runnability) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      disabled={isBusy}
                      onClick={() => onRunManualCommand(command)}
                    >
                      <Play className="h-4 w-4" />
                      Run {command.command} in BrowserPod
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {profile?.reasoning && (
          <div className="rounded-md border border-border bg-muted/30 p-3 leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">Reasoning: </span>{profile.reasoning}
          </div>
        )}

        {profile?.evidence && profile.evidence.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Runtime evidence</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {profile.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
