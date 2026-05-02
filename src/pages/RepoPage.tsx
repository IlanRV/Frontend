import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Menu,
  Power,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AiReadmeViewer } from "@/components/ai/AiReadmeViewer";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { FileTree } from "@/components/repo/FileTree";
import { FileViewer } from "@/components/repo/FileViewer";
import { PortalPreview } from "@/components/repo/PortalPreview";
import { RunButton } from "@/components/repo/RunButton";
import { RunnabilityBadge } from "@/components/repo/RunnabilityBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePod } from "@/hooks/usePod";
import { useRepo } from "@/hooks/useRepo";
import { loadCachedFileTree, saveCachedFileTree } from "@/lib/fileTreeCache";
import { cn } from "@/lib/utils";
import type { FileTreeNode, RunnabilityResult } from "@/types";

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

const REPO_CACHE_VERSION = 1;
const MAX_CACHED_FILES = 20;

interface RepoBrowserPodCache {
  version: typeof REPO_CACHE_VERSION;
  repoId: string;
  repoUrl?: string;
  fileTree?: FileTreeNode;
  runnability?: RunnabilityResult;
  selectedPath?: string;
  files: Record<string, string>;
  updatedAt: string;
}

function repoCacheKey(repoId: string) {
  return `devhub:repo-cache:${repoId}`;
}

function readRepoCache(repoId: string | undefined) {
  if (!repoId || typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(repoCacheKey(repoId));
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<RepoBrowserPodCache>;
    if (parsed.version !== REPO_CACHE_VERSION || parsed.repoId !== repoId) {
      return undefined;
    }

    return {
      ...parsed,
      files: parsed.files ?? {},
    } as RepoBrowserPodCache;
  } catch (error) {
    console.debug("[BrowserPod] repo cache read failed:", error);
    return undefined;
  }
}

function writeRepoCache(repoId: string | undefined, patch: Partial<RepoBrowserPodCache>) {
  if (!repoId || typeof window === "undefined") {
    return;
  }

  try {
    const previous = readRepoCache(repoId);
    const next: RepoBrowserPodCache = {
      version: REPO_CACHE_VERSION,
      repoId,
      files: previous?.files ?? {},
      updatedAt: new Date().toISOString(),
      ...previous,
      ...patch,
    };

    window.localStorage.setItem(repoCacheKey(repoId), JSON.stringify(next));
  } catch (error) {
    console.debug("[BrowserPod] repo cache write failed:", error);
  }
}

function cacheFileContent(repoId: string | undefined, path: string, content: string) {
  if (!repoId) {
    return;
  }

  const previous = readRepoCache(repoId);
  const files = { ...(previous?.files ?? {}) };
  delete files[path];
  files[path] = content;

  while (Object.keys(files).length > MAX_CACHED_FILES) {
    const oldestPath = Object.keys(files)[0];
    delete files[oldestPath];
  }

  writeRepoCache(repoId, { files, selectedPath: path });
}

export function RepoPage() {
  const { id: workspaceId, repoId } = useParams<{ id: string; repoId: string }>();
  const [searchParams] = useSearchParams();
  const {
    repo,
    aiReadme,
    isLoading,
    isAiLoading,
    error,
    aiError,
    refresh,
    loadAiReadme,
    registerRun,
    registerStop,
  } = useRepo(repoId);
  const {
    terminalRef,
    snapshot,
    bootstrapRepo,
    readFile,
    runProject,
    stopProject,
    terminate,
  } = usePod(repoId);

  const [fileTree, setFileTree] = useState<FileTreeNode | undefined>();
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState<string | undefined>();
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [cachedRunnability, setCachedRunnability] = useState<RunnabilityResult | undefined>();
  const [bootstrapError, setBootstrapError] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("code");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const bootedRepoRef = useRef<string | undefined>();
  const manuallyClosedRef = useRef(false);
  const bootstrapPromiseRef = useRef<Promise<{ fileTree: FileTreeNode; runnability: RunnabilityResult }> | undefined>();
  const autoRunRef = useRef(false);
  const registeredPortalRef = useRef<string | undefined>();
  const aiReadmeRequestRef = useRef<string | undefined>();
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
    autoRunRef.current = false;
    registeredPortalRef.current = undefined;
    aiReadmeRequestRef.current = undefined;
  }, [repoId]);

  useEffect(() => {
    manuallyClosedRef.current = false;
    bootedRepoRef.current = undefined;
    bootstrapPromiseRef.current = undefined;
    setFileTree(undefined);
    setSelectedPath(undefined);
    setFileContent("");
    setFileError(undefined);
    setCachedRunnability(undefined);

    const cached = readRepoCache(repoId);
    if (!cached) {
      return;
    }

    setFileTree(cached.fileTree);
    setCachedRunnability(cached.runnability);

    if (cached.selectedPath) {
      setSelectedPath(cached.selectedPath);
      setFileContent(cached.files[cached.selectedPath] ?? "");
    }
  }, [repoId]);

  const selectFile = useCallback(
    async (path: string) => {
      const cachedContent = readRepoCache(repoId)?.files[path];

      setSelectedPath(path);
      setFileError(undefined);
      writeRepoCache(repoId, { selectedPath: path });

      if (cachedContent !== undefined) {
        setFileContent(cachedContent);
        setIsFileLoading(false);
      } else {
        setFileContent("");
        setIsFileLoading(true);
      }

      try {
        const content = await readFile(path);
        setFileContent(content);
        cacheFileContent(repoId, path, content);
        setActiveTab("code");
      } catch (readError) {
        if (cachedContent === undefined) {
          setFileError(readError instanceof Error ? readError.message : "Unable to read file");
        } else {
          console.debug("[BrowserPod] using cached file content:", readError);
        }
      } finally {
        setIsFileLoading(false);
      }
    },
    [readFile, repoId],
  );

  const effectiveRunnability = snapshot.runnability ?? cachedRunnability ?? repo?.runnability ?? undefined;

  const startBootstrap = useCallback(() => {
    if (!repo?.githubUrl) {
      return Promise.reject(new Error("Repo URL is not loaded yet"));
    }

    manuallyClosedRef.current = false;

    if (bootstrapPromiseRef.current) {
      return bootstrapPromiseRef.current;
    }

    const promise = bootstrapRepo(repo.githubUrl)
      .then((result) => {
        setFileTree(result.fileTree);
        setCachedRunnability(result.runnability);
        writeRepoCache(repoId, {
          repoUrl: repo.githubUrl,
          fileTree: result.fileTree,
          runnability: result.runnability,
        });
        return result;
      })
      .finally(() => {
        if (bootstrapPromiseRef.current === promise) {
          bootstrapPromiseRef.current = undefined;
        }
      });

    bootstrapPromiseRef.current = promise;
    return promise;
  }, [bootstrapRepo, repo?.githubUrl, repoId]);

  const handleRun = useCallback(async () => {
    let runnability = effectiveRunnability;

    if (!runnability?.canRun || !runnability.entryPoint) {
      toast.error("This repo is not runnable in BrowserPod yet");
      return;
    }

    try {
      if (!snapshot.fileTree || !snapshot.runnability) {
        toast.message("Preparing BrowserPod from cached repo info");
        runnability = (await startBootstrap()).runnability;
      }

      if (!runnability.canRun || !runnability.entryPoint) {
        toast.error("This repo is not runnable in BrowserPod yet");
        return;
      }

      await runProject(runnability.entryPoint);
      setActiveTab("live");
      setIsConsoleOpen(true);
      toast.success("Project starting in BrowserPod");
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : "Unable to run project");
    }
  }, [effectiveRunnability, runProject, snapshot.fileTree, snapshot.runnability, startBootstrap]);

  const handleStop = useCallback(async () => {
    try {
      await stopProject();
      await registerStop();
      toast.success("Project stopped");
    } catch (stopError) {
      toast.error(stopError instanceof Error ? stopError.message : "Unable to stop project");
    }
  }, [registerStop, stopProject]);

  const handleClosePod = useCallback(async () => {
    try {
      bootstrapPromiseRef.current = undefined;
      bootedRepoRef.current = undefined;
      manuallyClosedRef.current = true;
      await terminate();
      toast.success("BrowserPod closed");
    } catch (closeError) {
      toast.error(closeError instanceof Error ? closeError.message : "Unable to close BrowserPod");
    }
  }, [terminate]);

  useEffect(() => {
    if (!repo?.githubUrl || manuallyClosedRef.current || bootedRepoRef.current === repo.id) {
      return;
    }

    bootedRepoRef.current = repo.id;
    setBootstrapError(undefined);

    void startBootstrap()
      .then(({ fileTree: nextTree, runnability }) => {
        setFileTree(nextTree);
        saveCachedFileTree(repo.id, nextTree);
        const firstFile = readRepoCache(repoId)?.selectedPath ?? selectedPath ?? findFirstSupportedFile(nextTree);
        if (firstFile && firstFile !== selectedPath) {
          void selectFile(firstFile);
        }

        if (!autoRunRef.current && searchParams.get("run") === "true") {
          autoRunRef.current = true;
          if (runnability.canRun && runnability.entryPoint) {
            void runProject(runnability.entryPoint).then(() => {
              setActiveTab("live");
              setIsConsoleOpen(true);
            });
          }
        }
      })
      .catch((bootError: unknown) => {
        bootedRepoRef.current = undefined;
        setBootstrapError(bootError instanceof Error ? bootError.message : "Unable to prepare BrowserPod");
      });
  }, [bootAttempt, repo?.githubUrl, repo?.id, repoId, runProject, searchParams, selectFile, selectedPath, startBootstrap]);

  useEffect(() => {
    if (activeTab !== "ai-readme" || !repoId || aiReadme || isAiLoading) {
      return;
    }

    const requestKey = `${repoId}:${repo?.status ?? "unknown"}`;

    if (aiReadmeRequestRef.current === requestKey) {
      return;
    }

    aiReadmeRequestRef.current = requestKey;
    void loadAiReadme();
  }, [activeTab, aiReadme, isAiLoading, loadAiReadme, repo?.status, repoId]);

  useEffect(() => {
    if (!snapshot.portalUrl || registeredPortalRef.current === snapshot.portalUrl) {
      return;
    }

    registeredPortalRef.current = snapshot.portalUrl;
    void registerRun(snapshot.portalUrl).catch((registerError: unknown) => {
      toast.error(registerError instanceof Error ? registerError.message : "Unable to save portal URL");
    });
  }, [registerRun, snapshot.portalUrl]);

  const isRunning = snapshot.state === "running";
  const effectiveFileTree = snapshot.fileTree ?? fileTree ?? repo?.fileTree ?? undefined;
  const isPreparingWithCache = Boolean(effectiveFileTree && effectiveRunnability) && (snapshot.state === "booting" || snapshot.state === "cloning");
  const isBusy = isBusyPodState(snapshot.state) && !isPreparingWithCache;
  const portalUrl = snapshot.portalUrl ?? repo?.portalUrl;
  const isTreeLoading =
    isLoading ||
    ((snapshot.state === "booting" || snapshot.state === "cloning") && !effectiveFileTree);

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

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-3">
            <Link to={`/workspace/${workspaceId}`}>
              <ArrowLeft className="h-4 w-4" />
              Workspace
            </Link>
          </Button>
          {isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="truncate text-2xl font-semibold tracking-normal">{repo?.name ?? "Repo"}</h1>
          )}
          <p className="mt-2 truncate text-sm text-muted-foreground">{repo?.githubUrl}</p>
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
          <Button variant="outline" size="sm" onClick={() => void handleClosePod()} title="Close BrowserPod">
            <Power className="h-4 w-4" />
            Close Pod
          </Button>
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
                manuallyClosedRef.current = false;
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
                <div className="space-y-3 p-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-4/5" />
                  <Skeleton className="h-8 w-3/5" />
                  <Skeleton className="h-8 w-5/6" />
                </div>
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
                  <TabsTrigger value="live">Live Preview</TabsTrigger>
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="code" className="min-h-[36rem]">
                <FileViewer
                  path={selectedPath}
                  content={fileContent}
                  isLoading={isFileLoading}
                  error={fileError}
                  onRetry={selectedPath ? () => void selectFile(selectedPath) : undefined}
                />
              </TabsContent>

              <TabsContent value="ai-readme" className="min-h-[36rem] rounded-lg border border-border bg-background">
                <AiReadmeViewer
                  readme={aiReadme}
                  isLoading={isAiLoading}
                  error={aiError}
                  onRetry={() => void loadAiReadme()}
                />
              </TabsContent>

              <TabsContent value="live" className="min-h-[36rem]">
                <PortalPreview portalUrl={portalUrl} />
              </TabsContent>

              <TabsContent value="chat" className="min-h-[36rem]">
                {repoId ? (
                  <ChatPanel scope={{ type: "repo", id: repoId }} title="Repo AI" />
                ) : (
                  <Skeleton className="h-[36rem]" />
                )}
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
    </main>
  );
}
