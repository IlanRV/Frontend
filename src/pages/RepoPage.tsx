import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Menu,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AiReadmeViewer } from "@/components/ai/AiReadmeViewer";
import { ExtractionProgressLine } from "@/components/ai/ExtractionProgressLine";
import { FunctionsViewer } from "@/components/ai/FunctionsViewer";
import { SecurityOverview } from "@/components/ai/SecurityOverview";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { FileTree } from "@/components/repo/FileTree";
import { FileViewer } from "@/components/repo/FileViewer";
import { PortalPreview } from "@/components/repo/PortalPreview";
import { RunButton } from "@/components/repo/RunButton";
import { RunnabilityBadge } from "@/components/repo/RunnabilityBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SectionLoading } from "@/components/ui/section-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePod } from "@/hooks/usePod";
import { useRepo } from "@/hooks/useRepo";
import { api } from "@/lib/api";
import { loadCachedFileTree, saveCachedFileTree } from "@/lib/fileTreeCache";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/types";

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
  const [bootAttempt, setBootAttempt] = useState(0);
  const bootedRepoRef = useRef<string | undefined>();
  const autoRunRef = useRef(false);
  const registeredPortalRef = useRef<string | undefined>();
  const aiReadmeRequestRef = useRef<string | undefined>();
  const securityRescanRequestRef = useRef<string | undefined>();
  const activeRepoRef = useRef<string | undefined>();

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
    autoRunRef.current = false;
    registeredPortalRef.current = undefined;
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

  const handleRun = useCallback(async () => {
    if (isRunActionPending) {
      return;
    }

    setIsRunActionPending(true);

    try {
      let runnability = snapshot.runnability ?? repo?.runnability ?? undefined;

      if (!snapshot.fileTree && repo?.githubUrl) {
        const prepared = await bootstrapRepo(repo.githubUrl);
        setFileTree(prepared.fileTree);
        saveCachedFileTree(repo.id, prepared.fileTree);
        runnability = prepared.runnability;
      }

      if (!runnability?.canRun || !runnability.entryPoint) {
        toast.error("This repo is not runnable in BrowserPod yet");
        return;
      }

      await runProject(runnability.entryPoint);
      if (repo?.id) {
        setStoredRunIntent(repo.id, true);
      }
      setActiveTab("live");
      setIsConsoleOpen(true);
      toast.success("Project starting in BrowserPod");
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : "Unable to run project");
    } finally {
      setIsRunActionPending(false);
    }
  }, [bootstrapRepo, isRunActionPending, repo?.githubUrl, repo?.id, repo?.runnability, runProject, snapshot.fileTree, snapshot.runnability]);

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
              if (!runnability.canRun || !runnability.entryPoint) {
                setStoredRunIntent(repo.id, false);
                return;
              }

              return runProject(runnability.entryPoint)
              .then(() => {
                setStoredRunIntent(repo.id, true);
                setActiveTab("live");
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

    registeredPortalRef.current = snapshot.portalUrl;
    if (repo?.id) {
      setStoredRunIntent(repo.id, true);
    }
    void registerRun(snapshot.portalUrl).catch((registerError: unknown) => {
      toast.error(registerError instanceof Error ? registerError.message : "Unable to save portal URL");
    });
  }, [registerRun, repo?.id, snapshot.portalUrl]);

  const isRunning = snapshot.state === "running";
  const isBusy = isRunActionPending || isBusyPodState(snapshot.state);
  const portalUrl = snapshot.portalUrl;
  const effectiveRunnability = snapshot.runnability ?? repo?.runnability ?? undefined;
  const effectiveFileTree = fileTree ?? snapshot.fileTree ?? repo?.fileTree ?? undefined;
  const firstSupportedPath = effectiveFileTree ? findFirstSupportedFile(effectiveFileTree) : undefined;
  const analysisProgress = repo?.analysisProgress ?? extraction?.analysisProgress ?? null;
  const isExtractionInFlight = repo?.status === "cloning" || repo?.status === "analyzing";
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
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 xl:max-w-[104rem] xl:pr-[25rem]">
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
            canRun={Boolean(effectiveRunnability?.canRun)}
            isRunning={isRunning}
            isBusy={isBusy}
            onRun={() => void handleRun()}
            onStop={() => void handleStop()}
          />
          {portalUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={portalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Portal
              </a>
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
                  <TabsTrigger value="live">Live Preview</TabsTrigger>
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

              <TabsContent value="live" className="min-h-[36rem]">
                <PortalPreview
                  portalUrl={portalUrl}
                  previewPath={effectiveRunnability?.previewPath}
                  previewPaths={effectiveRunnability?.previewPaths}
                />
              </TabsContent>

              <TabsContent value="security" className="min-h-[36rem] rounded-lg border border-border bg-background">
                <SecurityOverview
                  extraction={extraction}
                  isLoading={isAiLoading || (!extraction?.security && isExtractionInFlight)}
                  error={aiError}
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
        <aside className="mt-4 xl:fixed xl:right-6 xl:top-1/2 xl:z-40 xl:mt-0 xl:w-[22rem] xl:-translate-y-1/2">
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
    </main>
  );
}
