import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Menu,
  RotateCw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AiReadmeViewer } from "@/components/ai/AiReadmeViewer";
import { ExtractionProgressLine } from "@/components/ai/ExtractionProgressLine";
import { FunctionsViewer } from "@/components/ai/FunctionsViewer";
import { SecurityOverview } from "@/components/ai/SecurityOverview";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { FloatingRepoChat } from "@/components/chat/FloatingRepoChat";
import { FileTree } from "@/components/repo/FileTree";
import { FileViewer } from "@/components/repo/FileViewer";
import { RunButton } from "@/components/repo/RunButton";
import { RunInspectionDialog } from "@/components/repo/RunInspectionDialog";
import { RunnabilityBadge } from "@/components/repo/RunnabilityBadge";
import { RuntimeProfileCard } from "@/components/repo/RuntimeProfileCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionLoading } from "@/components/ui/section-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePod } from "@/hooks/usePod";
import { useRepo } from "@/hooks/useRepo";
import { api } from "@/lib/api";
import { loadCachedFileTree, saveCachedFileTree } from "@/lib/fileTreeCache";
import { getAutoPreviewCommand, getManualCommands, requiresSandboxConfirmation, runButtonLabel } from "@/lib/security";
import { cn } from "@/lib/utils";
import type { FileTreeNode, RegisterRunOptions, RuntimeCommandSuggestion, SandboxCommandRun } from "@/types";

function findFirstSupportedFile(node: FileTreeNode): string | undefined {
  if (node.type === "file" && node.supported) {
    return node.path;
  }

  const preferredNames = ["README.md", "package.json"];
  const preferred = node.children?.find(
    (child) => child.type === "file" && preferredNames.includes(child.name),
  );

  if (preferred?.path) {
    return preferred.path;
  }

  for (const child of node.children ?? []) {
    const found = findFirstSupportedFile(child);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function isBusyPodState(state: string) {
  return state === "booting" || state === "cloning" || state === "installing" || state === "stopping";
}

function isReadablePodState(state: string) {
  return state === "ready" || state === "running" || state === "installing" || state === "stopping";
}

function runIntentKey(repoId: string) {
  return `devhub:repo-run-intent:${repoId}`;
}

function hasStoredRunIntent(repoId: string) {
  try {
    return window.localStorage.getItem(runIntentKey(repoId)) === "true";
  } catch {
    return false;
  }
}

function setStoredRunIntent(repoId: string, isRunning: boolean) {
  try {
    if (isRunning) {
      window.localStorage.setItem(runIntentKey(repoId), "true");
    } else {
      window.localStorage.removeItem(runIntentKey(repoId));
    }
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

function repoOpeningPercent(isRepoLoading: boolean, podState: string, hasFileTree: boolean) {
  if (isRepoLoading) return 10;
  if (podState === "booting") return 24;
  if (podState === "cloning") return 44;
  if (hasFileTree) return 72;
  return 36;
}

function repoOpeningMessage(isRepoLoading: boolean, podState: string, hasFileTree: boolean) {
  if (isRepoLoading) return "Loading repo metadata";
  if (podState === "booting") return "Starting BrowserPod";
  if (podState === "cloning") return "Downloading repository files";
  if (hasFileTree) return "Preparing the first readable file";
  return "Waiting for cached source context";
}

export function RepoPage() {
  const { id: workspaceId, repoId } = useParams<{ id: string; repoId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    repo,
    extraction,
    aiReadme,
    isLoading,
    isAiLoading,
    error,
    aiError,
    refresh,
    loadExtraction,
    loadAiReadme,
    security,
    isSecurityLoading,
    securityError,
    loadSecurity,
    reportSecurityEvent,
    registerRun,
    registerStop,
  } = useRepo(repoId);
  const {
    terminalRef,
    snapshot,
    bootstrapRepo,
    bootstrapRepoFiles,
    checkRunnability,
    collectAiExtractionPayload,
    readFile,
    runProject,
    stopProject,
  } = usePod(repoId);

  const [fileTree, setFileTree] = useState<FileTreeNode | undefined>();
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState<string | undefined>();
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("code");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isRunActionPending, setIsRunActionPending] = useState(false);
  const [isRunInspectorOpen, setIsRunInspectorOpen] = useState(false);
  const [isSecurityConfirmOpen, setIsSecurityConfirmOpen] = useState(false);
  const [lastRunCommand, setLastRunCommand] = useState<string | undefined>();
  const [lastRunPreviewExpected, setLastRunPreviewExpected] = useState<boolean | undefined>();
  const [manualCommandRuns, setManualCommandRuns] = useState<Record<string, SandboxCommandRun>>({});
  const [bootAttempt, setBootAttempt] = useState(0);
  const bootedRepoRef = useRef<string | undefined>();
  const autoRunRef = useRef(false);
  const registeredPortalRef = useRef<string | undefined>();
  const pendingRunOptionsRef = useRef<RegisterRunOptions>({});
  const pendingConfirmationRef = useRef<{ command?: string; manualOverride?: boolean; previewExpected?: boolean }>({});
  const reportedSecurityEventsRef = useRef<Set<string>>(new Set());
  const aiReadmeRequestRef = useRef<string | undefined>();
  const securityRescanRequestRef = useRef<string | undefined>();
  const activeRepoRef = useRef<string | undefined>();
  const effectiveSecurity = extraction?.security ?? repo?.analysis?.security ?? null;
  const effectiveRunnability = security?.runnability ?? extraction?.runnability ?? snapshot.runnability ?? repo?.runnability ?? undefined;

  useEffect(() => {
    if (activeRepoRef.current === repoId) {
      return;
    }

    activeRepoRef.current = repoId;
    setFileTree(undefined);
    setSelectedPath(undefined);
    setFileContent("");
    setFileError(undefined);
    setBootstrapError(undefined);
    setActiveTab("code");
    setIsRunActionPending(false);
    setIsRunInspectorOpen(false);
    setLastRunCommand(undefined);
    setLastRunPreviewExpected(undefined);
    setManualCommandRuns({});
    autoRunRef.current = false;
    registeredPortalRef.current = undefined;
    pendingRunOptionsRef.current = {};
    pendingConfirmationRef.current = {};
    aiReadmeRequestRef.current = undefined;
    securityRescanRequestRef.current = undefined;
  }, [repoId]);

  useEffect(() => {
    if (!repo?.workspaceId || !workspaceId || repo.workspaceId === workspaceId) {
      return;
    }

    navigate(`/workspace/${repo.workspaceId}/repo/${repo.id}${location.search}`, { replace: true });
  }, [location.search, navigate, repo?.id, repo?.workspaceId, workspaceId]);

  const selectFile = useCallback(
    async (path: string) => {
      setSelectedPath(path);
      setFileError(undefined);
      setIsFileLoading(true);

      try {
        if (isReadablePodState(snapshot.state)) {
          setFileContent(await readFile(path));
        } else if (repoId) {
          const repoFile = await api.repos.getFile(repoId, path);
          setFileContent(repoFile.content);
        } else {
          throw new Error("Missing repo id");
        }
        setActiveTab("code");
      } catch (readError) {
        if (repoId && isReadablePodState(snapshot.state)) {
          try {
            const repoFile = await api.repos.getFile(repoId, path);
            setFileContent(repoFile.content);
            setActiveTab("code");
            return;
          } catch {
            // Keep the original BrowserPod read error below.
          }
        }

        setFileError(
          readError instanceof Error
            ? readError.message
            : "Unable to read file. The repo may still be warming up.",
        );
      } finally {
        setIsFileLoading(false);
      }
    },
    [readFile, repoId, snapshot.state],
  );

  const handleRun = useCallback(async (confirmed = false, manualOverride = false, commandOverride?: string, previewExpectedOverride?: boolean) => {
    if (isRunActionPending) {
      return false;
    }

    if (!confirmed && requiresSandboxConfirmation(effectiveSecurity)) {
      pendingConfirmationRef.current = { command: commandOverride, manualOverride, previewExpected: previewExpectedOverride };
      setIsSecurityConfirmOpen(true);
      return false;
    }

    setIsSecurityConfirmOpen(false);
    setIsRunActionPending(true);
    const pendingConfirmation = pendingConfirmationRef.current;
    const requestedCommandOverride = commandOverride ?? (confirmed ? pendingConfirmation.command : undefined);
    const requestedManualOverride = manualOverride || (confirmed && pendingConfirmation.manualOverride === true);
    const requestedPreviewExpected = previewExpectedOverride ?? (confirmed ? pendingConfirmation.previewExpected : undefined);
    pendingConfirmationRef.current = {};
    pendingRunOptionsRef.current = {
      sandboxConfirmed: confirmed && requiresSandboxConfirmation(effectiveSecurity),
      manualOverride: requestedManualOverride,
    };

    try {
      let runnability = effectiveRunnability;
      let runCommand = requestedCommandOverride ?? getAutoPreviewCommand(runnability) ?? (requestedManualOverride ? repo?.runScript : undefined);
      const previewExpected = requestedPreviewExpected ?? (requestedCommandOverride ? false : true);

      if ((!runnability || requestedCommandOverride || requestedManualOverride || getAutoPreviewCommand(runnability)) && !snapshot.fileTree && repo?.githubUrl) {
        const prepared = await bootstrapRepo(repo.githubUrl);
        setFileTree(prepared.fileTree);
        saveCachedFileTree(repo.id, prepared.fileTree);
        runnability = extraction?.runnability ?? prepared.runnability;
        runCommand = requestedCommandOverride ?? getAutoPreviewCommand(runnability) ?? (requestedManualOverride ? repo.runScript : undefined);
      }

      if ((!requestedManualOverride && !requestedCommandOverride && !getAutoPreviewCommand(runnability)) || !runCommand) {
        toast.error("This repo is not runnable in BrowserPod yet");
        return false;
      }

      setLastRunCommand(runCommand);
      setLastRunPreviewExpected(previewExpected);
      setIsRunInspectorOpen(true);
      setIsConsoleOpen(true);
      await runProject(runCommand, { previewExpected });
      if (previewExpected && snapshot.portalUrl && registeredPortalRef.current !== snapshot.portalUrl) {
        registeredPortalRef.current = snapshot.portalUrl;
        await registerRun(snapshot.portalUrl, pendingRunOptionsRef.current);
      }
      if (previewExpected && repo?.id) {
        setStoredRunIntent(repo.id, true);
      }
      toast.success(previewExpected ? "Project starting in BrowserPod" : "Sandbox command started in BrowserPod");
        return true;
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : "Unable to run project");
        return false;
    } finally {
      setIsRunActionPending(false);
    }
  }, [bootstrapRepo, effectiveRunnability, effectiveSecurity, extraction?.runnability, isRunActionPending, registerRun, repo?.githubUrl, repo?.id, repo?.runScript, runProject, snapshot.fileTree, snapshot.portalUrl]);

  const handleStop = useCallback(async () => {
    if (isRunActionPending) {
      return;
    }

    setIsRunActionPending(true);

    try {
      await stopProject();
      if (repo?.id) {
        setStoredRunIntent(repo.id, false);
      }
      await registerStop();
      toast.success("Project stopped");
    } catch (stopError) {
      toast.error(stopError instanceof Error ? stopError.message : "Unable to stop project");
    } finally {
      setIsRunActionPending(false);
    }
  }, [isRunActionPending, registerStop, repo?.id, stopProject]);

  const handleAutoCommand = useCallback((command: string) => {
    void handleRun(false, false, command, true);
  }, [handleRun]);

  const handleManualCommand = useCallback((command: RuntimeCommandSuggestion) => {
    const startedAt = new Date().toISOString();
    const previewExpected = command.previewExpected ?? false;

    if (!requiresSandboxConfirmation(effectiveSecurity)) {
      setLastRunCommand(command.command);
      setLastRunPreviewExpected(previewExpected);
      setIsRunInspectorOpen(true);
      setIsConsoleOpen(true);
    }

    setManualCommandRuns((current) => ({
      ...current,
      [command.command]: {
        command: command.command,
        label: command.label ?? null,
        status: "starting",
        startedAt,
        previewExpected,
      },
    }));

    void handleRun(false, true, command.command, previewExpected)
      .then((didStart) => {
        if (!didStart) {
          if (requiresSandboxConfirmation(effectiveSecurity)) {
            return;
          }

          setManualCommandRuns((current) => ({
            ...current,
            [command.command]: {
              ...current[command.command],
              command: command.command,
              label: command.label ?? null,
              status: "failed",
              outputStartedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              message: "Command did not start.",
            },
          }));
          return;
        }

        setManualCommandRuns((current) => ({
          ...current,
          [command.command]: {
            ...current[command.command],
            status: "running",
            outputStartedAt: new Date().toISOString(),
            message: previewExpected ? "Preview command is running in BrowserPod." : "Command is running in BrowserPod.",
          },
        }));
      });
  }, [effectiveSecurity, handleRun]);

  const handleStopManualCommand = useCallback((command: RuntimeCommandSuggestion) => {
    setManualCommandRuns((current) => ({
      ...current,
      [command.command]: {
        ...current[command.command],
        command: command.command,
        label: command.label ?? null,
        status: "stopping",
        message: "Stopping BrowserPod command...",
      },
    }));

    void handleStop()
      .then(() => {
        setManualCommandRuns((current) => ({
          ...current,
          [command.command]: {
            ...current[command.command],
            status: "completed",
            finishedAt: new Date().toISOString(),
            message: "Stopped by user.",
          },
        }));
      });
  }, [handleStop]);

  useEffect(() => {
    if (snapshot.state !== "ready") {
      return;
    }

    setManualCommandRuns((current) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(current).map(([command, run]) => {
        if (run.previewExpected || (run.status !== "starting" && run.status !== "running" && run.status !== "stopping")) {
          return [command, run];
        }

        changed = true;
        return [command, {
          ...run,
          status: "completed" as const,
          finishedAt: new Date().toISOString(),
          message: run.status === "stopping" ? "Stopped by user." : "Command finished or returned control to BrowserPod.",
        }];
      }));

      return changed ? next : current;
    });
  }, [manualCommandRuns, snapshot.state]);

  useEffect(() => {
    if (!repo?.githubUrl || bootedRepoRef.current === repo.id) {
      return;
    }

    const cachedTree = loadCachedFileTree(repo.id);
    const fallbackTree = repo.fileTree ?? cachedTree;
    const shouldRestoreRun =
      searchParams.get("run") === "true" ||
      hasStoredRunIntent(repo.id) ||
      repo.status === "running";

    if (!shouldRestoreRun && fallbackTree && repo.status !== "cloning") {
      return;
    }

    bootedRepoRef.current = repo.id;
    setBootstrapError(undefined);

    void bootstrapRepoFiles(repo.githubUrl)
      .then((nextTree) => {
        setFileTree(nextTree);
        saveCachedFileTree(repo.id, nextTree);

        const shouldSyncExtraction = repo.status === "cloning" || (!repo.analysis && !repo.aiReadme) || !repo.analysis?.security;

        if (shouldSyncExtraction) {
          void collectAiExtractionPayload(nextTree)
            .then((payload) => api.ai.extract(repo.id, payload))
            .catch(() => undefined);
        }

        if (!autoRunRef.current && shouldRestoreRun) {
          autoRunRef.current = true;
          void checkRunnability()
            .then((runnability) => {
              const command = getAutoPreviewCommand(runnability);

              if (!command) {
                setStoredRunIntent(repo.id, false);
                return;
              }

              setLastRunCommand(command);
              setLastRunPreviewExpected(true);
              return runProject(command, { previewExpected: true })
              .then(() => {
                setStoredRunIntent(repo.id, true);
                setIsRunInspectorOpen(true);
                setIsConsoleOpen(true);
              });
            })
            .catch((runError: unknown) => {
              setBootstrapError(runError instanceof Error ? runError.message : "Unable to restore BrowserPod run");
            });
        }
      })
      .catch((bootError: unknown) => {
        bootedRepoRef.current = undefined;
        setBootstrapError(bootError instanceof Error ? bootError.message : "Unable to prepare BrowserPod");
      });
  }, [bootAttempt, bootstrapRepoFiles, checkRunnability, collectAiExtractionPayload, repo, runProject, searchParams, selectFile]);

  useEffect(() => {
    const needsExtraction = activeTab === "functions" || activeTab === "security" ? !extraction : !aiReadme;

    if ((activeTab !== "ai-readme" && activeTab !== "functions" && activeTab !== "security") || !repoId || !needsExtraction || isAiLoading) {
      return;
    }

    const requestKey = `${repoId}:${activeTab}:${repo?.status ?? "unknown"}`;

    if (aiReadmeRequestRef.current === requestKey) {
      return;
    }

    aiReadmeRequestRef.current = requestKey;
    void loadExtraction();
  }, [activeTab, aiReadme, extraction, isAiLoading, loadExtraction, repo?.status, repoId]);

  useEffect(() => {
    if (activeTab !== "security" || !repoId || extraction?.security || repo?.status === "analyzing") {
      return;
    }

    const requestKey = `${repoId}:${repo?.analysisUpdatedAt ?? repo?.updatedAt ?? repo?.status ?? "unknown"}`;

    if (securityRescanRequestRef.current === requestKey) {
      return;
    }

    securityRescanRequestRef.current = requestKey;
    void api.ai.extractStored(repoId)
      .then(() => {
        toast.success("Security scan started from cached repo files");
        void refresh();
        void loadExtraction();
      })
      .catch(() => {
        void loadExtraction();
      });
  }, [activeTab, extraction?.security, loadExtraction, refresh, repo?.analysisUpdatedAt, repo?.status, repo?.updatedAt, repoId]);

  useEffect(() => {
    if (!snapshot.portalUrl || registeredPortalRef.current === snapshot.portalUrl) {
      return;
    }

    if (requiresSandboxConfirmation(effectiveSecurity) && !pendingRunOptionsRef.current.sandboxConfirmed) {
      return;
    }

    if (effectiveRunnability && !effectiveRunnability.canRun && !pendingRunOptionsRef.current.manualOverride) {
      return;
    }

    registeredPortalRef.current = snapshot.portalUrl;
    if (repo?.id) {
      setStoredRunIntent(repo.id, true);
    }
    void registerRun(snapshot.portalUrl, pendingRunOptionsRef.current).catch((registerError: unknown) => {
      toast.error(registerError instanceof Error ? registerError.message : "Unable to save portal URL");
    });
  }, [effectiveRunnability, effectiveSecurity, registerRun, repo?.id, snapshot.portalUrl]);

  useEffect(() => {
    if (!repo?.id || snapshot.securityEvents?.length === 0) {
      return;
    }

    for (const event of snapshot.securityEvents ?? []) {
      const key = event.id;
      if (reportedSecurityEventsRef.current.has(key)) {
        continue;
      }

      reportedSecurityEventsRef.current.add(key);
      void reportSecurityEvent({
        source: event.source,
        phase: event.phase,
        category: event.category,
        severity: event.severity,
        title: event.title,
        description: event.description,
        evidence: event.evidence,
        command: event.command,
      }).catch(() => undefined);
    }
  }, [repo?.id, reportSecurityEvent, snapshot.securityEvents]);

  useEffect(() => {
    if (activeTab !== "security" || !repoId) {
      return;
    }

    void loadSecurity();
  }, [activeTab, loadSecurity, repoId]);

  const isRunning = snapshot.state === "running";
  const isBusy = isRunActionPending || isBusyPodState(snapshot.state);
  const portalUrl = snapshot.portalUrl;
  const effectiveFileTree = fileTree ?? snapshot.fileTree ?? repo?.fileTree ?? undefined;
  const firstSupportedPath = effectiveFileTree ? findFirstSupportedFile(effectiveFileTree) : undefined;
  const analysisProgress = repo?.analysisProgress ?? extraction?.analysisProgress ?? null;
  const isExtractionInFlight = repo?.status === "cloning" || repo?.status === "analyzing";
  const autoPreviewCommand = getAutoPreviewCommand(effectiveRunnability);
  const manualCommands = getManualCommands(effectiveRunnability);
  const safeRunLabel = autoPreviewCommand ? runButtonLabel(effectiveSecurity, effectiveRunnability) : "Run";
  const canManualOverride = !autoPreviewCommand && Boolean(repo?.runScript) && manualCommands.length === 0;
  const isTreeLoading =
    isLoading ||
    ((snapshot.state === "booting" || snapshot.state === "cloning") && !effectiveFileTree);
  const isCodeLoading = isTreeLoading || isFileLoading || Boolean(firstSupportedPath && !selectedPath && !fileError);
  const repoLoadingPercent = repoOpeningPercent(isLoading, snapshot.state, Boolean(effectiveFileTree));
  const repoLoadingMessage = repoOpeningMessage(isLoading, snapshot.state, Boolean(effectiveFileTree));
  const latestTerminalLine = snapshot.terminal.at(-1)?.text;

  useEffect(() => {
    if (!repo?.id || fileTree) {
      return;
    }

    const cachedTree = loadCachedFileTree(repo.id);
    const fallbackTree = repo.fileTree ?? cachedTree;

    if (fallbackTree) {
      setFileTree(fallbackTree);
    }
  }, [fileTree, repo?.fileTree, repo?.id]);

  useEffect(() => {
    if (!effectiveFileTree || selectedPath || isFileLoading) {
      return;
    }

    if (firstSupportedPath) {
      void selectFile(firstSupportedPath);
    }
  }, [effectiveFileTree, firstSupportedPath, isFileLoading, selectedPath, selectFile]);

  useEffect(() => {
    if (!selectedPath || !fileError || isFileLoading || !isReadablePodState(snapshot.state)) {
      return;
    }

    void selectFile(selectedPath);
  }, [fileError, isFileLoading, selectedPath, selectFile, snapshot.state]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 xl:max-w-[108rem] xl:pr-[30rem]">
      <Dialog open={isSecurityConfirmOpen} onOpenChange={(open) => {
        setIsSecurityConfirmOpen(open);
        if (!open) {
          pendingConfirmationRef.current = {};
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-300" />
              Confirm sandboxed run
            </DialogTitle>
            <DialogDescription className="leading-6">
              This repository has high-risk findings. BrowserPod isolates the run from your real filesystem and credentials, but suspicious projects can still hang the preview, consume CPU, or fail to start.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <p>
              Continue only if you want to inspect it inside BrowserPod. Watch for malicious install scripts, obfuscated code, credential theft attempts, destructive filesystem commands, or resource abuse.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsSecurityConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="success" onClick={() => void handleRun(true)}>
              I understand, run in BrowserPod sandbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link to={`/workspace/${repo?.workspaceId ?? workspaceId}`}>
              <ArrowLeft className="h-4 w-4" />
              Workspace
            </Link>
          </Button>
          {isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="truncate text-2xl font-semibold tracking-normal">{repo?.name ?? "Repo"}</h1>
          )}
          <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            {repo?.githubUrl ? (
              <a
                href={repo.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {repo.githubUrl}
              </a>
            ) : (
              <Skeleton className="h-4 w-80 max-w-full" />
            )}
            <ExtractionProgressLine repo={repo} extraction={extraction} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setIsSidebarOpen((open) => !open)} title="Toggle file tree">
            <Menu className="h-4 w-4" />
          </Button>
          <RunnabilityBadge result={effectiveRunnability} />
          <RunButton
            canRun={Boolean(autoPreviewCommand)}
            isRunning={isRunning}
            isBusy={isBusy}
            label={safeRunLabel}
            onRun={() => void handleRun()}
            onStop={() => void handleStop()}
          />
          {canManualOverride && !isRunning && (
            <Button variant="outline" size="sm" disabled={isBusy} onClick={() => void handleRun(false, true)}>
              Run with manual override
            </Button>
          )}
          {portalUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={portalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Portal
              </a>
            </Button>
          )}
          {(portalUrl || lastRunCommand || snapshot.terminal.length > 0) && (
            <Button variant="outline" size="sm" onClick={() => setIsRunInspectorOpen(true)}>
              View run inspector
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setActiveTab("ai-readme")}>
            <Bot className="h-4 w-4" />
            AI Readme
          </Button>
        </div>
      </div>

      {(error || bootstrapError) && (
        <Alert className="mb-4 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertTitle>Repo is not ready</AlertTitle>
          <AlertDescription>
            <p>{error ?? bootstrapError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                bootedRepoRef.current = undefined;
                setBootAttempt((attempt) => attempt + 1);
                void refresh();
              }}
            >
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!error && (
        <RuntimeProfileCard
          runnability={effectiveRunnability}
          isBusy={isBusy}
          isRunning={isRunning}
          hasInspector={isRunning || Boolean(portalUrl || lastRunCommand || snapshot.terminal.length > 0)}
          activeCommand={lastRunCommand ?? autoPreviewCommand}
          commandRuns={manualCommandRuns}
          terminalLines={snapshot.terminal}
          onOpenInspector={() => setIsRunInspectorOpen(true)}
          onRunAuto={handleAutoCommand}
          onRunManualCommand={handleManualCommand}
          onStopManualCommand={handleStopManualCommand}
        />
      )}

      {!error && (
        <div
          className={cn(
            "grid gap-4",
            isSidebarOpen ? "lg:grid-cols-[minmax(16rem,20rem)_1fr]" : "lg:grid-cols-[1fr]",
          )}
        >
          {isSidebarOpen && (
            <aside className="min-h-[36rem] overflow-hidden rounded-lg border border-border bg-background">
              {isTreeLoading ? (
                <SectionLoading
                  title="Loading file tree"
                  message={repoLoadingMessage}
                  percent={repoLoadingPercent}
                  detail={latestTerminalLine ?? repo?.githubUrl}
                  className="min-h-[36rem] rounded-none border-0"
                />
              ) : (
                <FileTree tree={effectiveFileTree} selectedPath={selectedPath} onSelectFile={selectFile} />
              )}
            </aside>
          )}

          <section className="min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="overflow-x-auto">
                <TabsList className="mb-2">
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="ai-readme">AI Readme</TabsTrigger>
                  <TabsTrigger value="functions">Functions</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="code" className="min-h-[36rem]">
                <FileViewer
                  path={selectedPath}
                  content={fileContent}
                  isLoading={isCodeLoading}
                  error={fileError}
                  onRetry={selectedPath ? () => void selectFile(selectedPath) : undefined}
                  loadingTitle={isFileLoading ? "Downloading file" : "Opening repository"}
                  loadingMessage={isFileLoading ? "Reading source content" : repoLoadingMessage}
                  loadingPercent={isFileLoading ? 82 : repoLoadingPercent}
                  loadingDetail={isFileLoading ? selectedPath : latestTerminalLine ?? repo?.githubUrl}
                />
              </TabsContent>

              <TabsContent value="ai-readme" className="min-h-[36rem] rounded-lg border border-border bg-background">
                <AiReadmeViewer
                  readme={aiReadme}
                  isLoading={isAiLoading || (!aiReadme && isExtractionInFlight)}
                  error={aiError}
                  onRetry={() => void loadAiReadme()}
                  progress={analysisProgress}
                />
              </TabsContent>

              <TabsContent value="functions" className="min-h-[36rem] rounded-lg border border-border bg-background">
                <FunctionsViewer
                  extraction={extraction}
                  isLoading={isAiLoading || (!extraction && isExtractionInFlight)}
                  error={aiError}
                  repoName={repo?.name}
                  onRetry={() => void loadExtraction()}
                  progress={analysisProgress}
                />
              </TabsContent>

              <TabsContent value="security" className="min-h-[36rem] rounded-lg border border-border bg-background">
                <SecurityOverview
                  extraction={extraction}
                  runnability={effectiveRunnability}
                  runtimeEvents={snapshot.securityEvents}
                  runtimeSecurity={security?.runtimeSecurity}
                  isLoading={isAiLoading || isSecurityLoading || (!extraction?.security && isExtractionInFlight)}
                  error={aiError ?? securityError}
                  onRetry={repoId ? () => void api.ai.extractStored(repoId).then(() => {
                    void refresh();
                    void loadExtraction();
                  }) : undefined}
                  progress={analysisProgress}
                />
              </TabsContent>

            </Tabs>

            <section className="mt-4 overflow-hidden rounded-lg border border-border bg-background">
              <button
                type="button"
                className="flex h-11 w-full items-center justify-between px-4 text-sm font-medium hover:bg-accent"
                onClick={() => setIsConsoleOpen((open) => !open)}
              >
                <span>Console</span>
                {isConsoleOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <div className={cn("border-t border-border", !isConsoleOpen && "h-0 overflow-hidden border-t-0")}>
                <div className="max-h-64 overflow-auto bg-black p-3 font-mono text-xs text-zinc-100">
                  <div ref={terminalRef} className="min-h-40" />
                  {snapshot.terminal.map((line) => (
                    <div
                      key={line.id}
                      className={cn(
                        "whitespace-pre-wrap",
                        line.stream === "stderr" && "text-red-300",
                        line.stream === "system" && "text-cyan-200",
                      )}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </section>
        </div>
      )}

      {!error && (
        <aside className="mt-4 xl:fixed xl:right-6 xl:top-1/2 xl:z-40 xl:mt-0 xl:w-[27rem] xl:-translate-y-1/2">
          {repoId ? (
            <ChatPanel
              scope={{ type: "repo", id: repoId }}
              title="Repo AI"
              className="min-h-[34rem] border-cyan-200/70 bg-background/95 shadow-[0_22px_70px_rgba(8,47,73,0.18)] backdrop-blur xl:h-[min(42rem,calc(100vh-7rem))] xl:min-h-0 dark:border-cyan-900/60"
            />
          ) : (
            <Skeleton className="min-h-[34rem] rounded-lg xl:h-[min(42rem,calc(100vh-7rem))]" />
          )}
        </aside>
      )}
      <RunInspectionDialog
        open={isRunInspectorOpen}
        onOpenChange={setIsRunInspectorOpen}
        portalUrl={portalUrl}
        previewPath={effectiveRunnability?.previewPath}
        previewPaths={effectiveRunnability?.previewPaths}
        riskLevel={effectiveSecurity?.riskLevel}
        command={lastRunCommand ?? autoPreviewCommand}
        previewExpected={lastRunPreviewExpected ?? Boolean(portalUrl)}
        projectKind={effectiveRunnability?.runtimeProfile?.projectKind}
        runtimeEventCount={(snapshot.securityEvents?.length ?? 0) + (security?.runtimeSecurity.eventCount ?? 0)}
        isStopping={isBusy}
        onStop={isRunning ? () => void handleStop() : undefined}
        terminalLines={snapshot.terminal}
      />
      {isRunInspectorOpen && repoId && <FloatingRepoChat repoId={repoId} />}
    </main>
  );
}
