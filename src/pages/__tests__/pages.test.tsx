import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { DashboardPage } from "@/pages/DashboardPage";
import { LandingPage } from "@/pages/LandingPage";
import { RepoPage } from "@/pages/RepoPage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { usePod } from "@/hooks/usePod";
import { useRepo } from "@/hooks/useRepo";
import { useWorkspace, useWorkspaces } from "@/hooks/useWorkspace";
import { api } from "@/lib/api";
import { makeExtraction, makeFileTree, makeRepo, makeRunnability, makeWorkspace } from "@/test/factories";

vi.mock("@/hooks/useWorkspace", () => ({
  WORKSPACE_LIMIT: 3,
  useWorkspaces: vi.fn(),
  useWorkspace: vi.fn(),
}));

vi.mock("@/hooks/useRepo", () => ({
  useRepo: vi.fn(),
}));

vi.mock("@/hooks/usePod", () => ({
  usePod: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    repos: {
      getFile: vi.fn(),
    },
    ai: {
      extract: vi.fn(),
    },
  },
}));

vi.mock("@/components/chat/ChatPanel", () => ({
  ChatPanel: ({ title }: { title?: string }) => <div data-testid="chat-panel">{title}</div>,
}));

vi.mock("@/components/repo/AddRepoModal", () => ({
  AddRepoModal: ({ open }: { open: boolean }) => <div data-testid="add-repo-modal">{open ? "open" : "closed"}</div>,
}));

vi.mock("@/components/repo/RepoCard", () => ({
  RepoCard: ({ repo, onOpen, onRun }: { repo: { name: string }; onOpen: () => void; onRun: () => void }) => (
    <div>
      <button type="button" onClick={onOpen}>Open {repo.name}</button>
      <button type="button" onClick={onRun}>Run {repo.name}</button>
    </div>
  ),
}));

vi.mock("@/components/repo/FileTree", () => ({
  FileTree: ({ tree, onSelectFile }: { tree?: { name: string }; onSelectFile: (path: string) => void }) => (
    <button type="button" onClick={() => onSelectFile("README.md")}>File tree {tree?.name}</button>
  ),
}));

vi.mock("@/components/repo/FileViewer", () => ({
  FileViewer: ({ path, content, error }: { path?: string; content: string; error?: string }) => (
    <div data-testid="file-viewer">{error ?? `${path ?? "no-file"}:${content}`}</div>
  ),
}));

vi.mock("@/components/repo/PortalPreview", () => ({
  PortalPreview: ({ portalUrl }: { portalUrl?: string }) => <div data-testid="portal-preview">{portalUrl ?? "no portal"}</div>,
}));

vi.mock("@/components/repo/RunButton", () => ({
  RunButton: ({ canRun, isRunning, isBusy, onRun, onStop }: { canRun: boolean; isRunning: boolean; isBusy?: boolean; onRun: () => void; onStop: () => void }) => (
    <button type="button" disabled={!canRun || isBusy} onClick={isRunning ? onStop : onRun}>{isRunning ? "Stop" : "Run"}</button>
  ),
}));

vi.mock("@/components/repo/RunnabilityBadge", () => ({
  RunnabilityBadge: ({ result }: { result?: { canRun: boolean } }) => <div>{result?.canRun ? "runnable" : "checking"}</div>,
}));

vi.mock("@/components/ai/AiReadmeViewer", () => ({
  AiReadmeViewer: ({ readme }: { readme?: { raw?: string } }) => <div data-testid="ai-readme">{readme?.raw ?? "no readme"}</div>,
}));

vi.mock("@/components/ai/FunctionsViewer", () => ({
  FunctionsViewer: ({ repoName }: { repoName?: string }) => <div data-testid="functions-viewer">{repoName} functions</div>,
}));

const mockedUseWorkspaces = vi.mocked(useWorkspaces);
const mockedUseWorkspace = vi.mocked(useWorkspace);
const mockedUseRepo = vi.mocked(useRepo);
const mockedUsePod = vi.mocked(usePod);
const mockedApi = vi.mocked(api);

function repoHook(overrides: Partial<ReturnType<typeof useRepo>> = {}) {
  return {
    repo: makeRepo(),
    extraction: makeExtraction(),
    aiReadme: { raw: "# README" },
    isLoading: false,
    isAiLoading: false,
    error: undefined,
    aiError: undefined,
    refresh: vi.fn(),
    loadExtraction: vi.fn(),
    loadAiReadme: vi.fn(),
    registerRun: vi.fn().mockResolvedValue(makeRepo({ status: "running" })),
    registerStop: vi.fn().mockResolvedValue(makeRepo({ status: "ready" })),
    ...overrides,
  };
}

function podHook(overrides: Partial<ReturnType<typeof usePod>> = {}) {
  return {
    terminalRef: { current: null },
    snapshot: {
      repoId: "repo-1",
      state: "ready" as const,
      terminal: [{ id: "line-1", stream: "system" as const, text: "ready", createdAt: "now" }],
      fileTree: makeFileTree(),
      runnability: makeRunnability(),
      portalUrl: "https://portal.example",
    },
    boot: vi.fn(),
    bootstrapRepo: vi.fn().mockResolvedValue({ fileTree: makeFileTree(), runnability: makeRunnability() }),
    bootstrapRepoFiles: vi.fn().mockResolvedValue(makeFileTree()),
    readFile: vi.fn().mockResolvedValue("# Readme"),
    refreshFileTree: vi.fn(),
    checkRunnability: vi.fn(),
    collectAiExtractionPayload: vi.fn().mockResolvedValue({ fileTree: makeFileTree(), files: [] }),
    runProject: vi.fn().mockResolvedValue(undefined),
    stopProject: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    ...overrides,
  };
}

function renderWithRouter(path: string, element: ReactElement, includeRepoTarget = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={element} />
        <Route path="/workspace/:id" element={element} />
        <Route path="/workspace/:id/repo/:repoId" element={element} />
        {includeRepoTarget && <Route path="/workspace/workspace-1/repo/repo-1" element={<div>Repo route</div>} />}
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseWorkspaces.mockReturnValue({
    workspaces: [makeWorkspace()],
    isLoading: false,
    error: undefined,
    refresh: vi.fn(),
    createWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
  });
  mockedUseWorkspace.mockReturnValue({
    workspace: makeWorkspace(),
    repos: [makeRepo()],
    isLoading: false,
    error: undefined,
    refresh: vi.fn(),
    addRepo: vi.fn(),
    updateRepo: vi.fn(),
  });
  mockedUseRepo.mockReturnValue(repoHook());
  mockedUsePod.mockReturnValue(podHook());
  vi.mocked(mockedApi.repos.getFile).mockResolvedValue({ path: "README.md", content: "backend read", size: 12, updatedAt: "now" });
  vi.mocked(mockedApi.ai.extract).mockResolvedValue({ success: true, extractionId: "ext-1", status: "ready" });
});

describe("LandingPage", () => {
  it("renders primary marketing actions", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "DevHub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create workspace/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Run in browser")).toBeInTheDocument();
  });
});

describe("DashboardPage", () => {
  it("renders workspaces", () => {
    renderWithRouter("/dashboard", <DashboardPage />);

    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(screen.getByText("Workspace One")).toBeInTheDocument();
    expect(screen.getByText("1/3 workspaces used.")).toBeInTheDocument();
  });

  it("renders loading and error states", async () => {
    mockedUseWorkspaces.mockReturnValueOnce({
      workspaces: [],
      isLoading: true,
      error: undefined,
      refresh: vi.fn(),
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
    });
    const { rerender } = renderWithRouter("/dashboard", <DashboardPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    const refresh = vi.fn();
    mockedUseWorkspaces.mockReturnValueOnce({
      workspaces: [],
      isLoading: false,
      error: "load failed",
      refresh,
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
    });
    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes><Route path="/dashboard" element={<DashboardPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("load failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("opens the create modal from the empty workspace state", async () => {
    mockedUseWorkspaces.mockReturnValueOnce({
      workspaces: [],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
    });
    renderWithRouter("/dashboard", <DashboardPage />);

    expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Create Workspace" }).at(-1)!);

    expect(screen.getByRole("dialog")).toHaveTextContent("Create workspace");
  });

  it("asks before deleting workspaces", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedUseWorkspaces.mockReturnValueOnce({
      workspaces: [makeWorkspace()],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      createWorkspace: vi.fn(),
      deleteWorkspace,
    });
    renderWithRouter("/dashboard", <DashboardPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    await waitFor(() => expect(deleteWorkspace).toHaveBeenCalledWith("workspace-1"));
    expect(toast.success).toHaveBeenCalledWith("Workspace deleted");
  });

  it("cancels workspace deletes", async () => {
    const deleteWorkspace = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockedUseWorkspaces.mockReturnValueOnce({
      workspaces: [makeWorkspace()],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      createWorkspace: vi.fn(),
      deleteWorkspace,
    });
    renderWithRouter("/dashboard", <DashboardPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    expect(deleteWorkspace).not.toHaveBeenCalled();
  });
});

describe("WorkspacePage", () => {
  it("renders workspace repos and opens repo routes", async () => {
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />, true);

    expect(screen.getByText("Workspace One")).toBeInTheDocument();
    expect(screen.getByText("Repositories")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open frontend" }));
    expect(screen.getByText("Repo route")).toBeInTheDocument();
  });

  it("renders errors and empty repo states", async () => {
    const refresh = vi.fn();
    mockedUseWorkspace.mockReturnValueOnce({
      workspace: undefined,
      repos: [],
      isLoading: false,
      error: "workspace failed",
      refresh,
      addRepo: vi.fn(),
      updateRepo: vi.fn(),
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    expect(screen.getByText("workspace failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("opens the add-repo modal from an empty workspace", async () => {
    mockedUseWorkspace.mockReturnValueOnce({
      workspace: makeWorkspace(),
      repos: [],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      addRepo: vi.fn(),
      updateRepo: vi.fn(),
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    expect(screen.getByText("No repos yet")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /Add Repo/ }).at(-1)!);

    expect(screen.getByTestId("add-repo-modal")).toHaveTextContent("open");
  });
});

describe("RepoPage", () => {
  it("renders repo chrome, cached tree, file content, and console", async () => {
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("runnable")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("file-viewer")).toHaveTextContent("README.md:# Readme"));
    await userEvent.click(screen.getByText("Console"));
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("runs and stores run intent", async () => {
    const pod = podHook();
    mockedUsePod.mockReturnValue(pod);
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(pod.runProject).toHaveBeenCalledWith("dev"));
    expect(window.localStorage.getItem("devhub:repo-run-intent:repo-1")).toBe("true");
  });

  it("stops running projects and clears run intent", async () => {
    window.localStorage.setItem("devhub:repo-run-intent:repo-1", "true");
    const stopProject = vi.fn().mockResolvedValue(undefined);
    const registerStop = vi.fn().mockResolvedValue(makeRepo({ status: "ready" }));
    const pod = podHook();
    mockedUsePod.mockReturnValue({
      ...pod,
      snapshot: { ...pod.snapshot, state: "running" },
      stopProject,
    });
    mockedUseRepo.mockReturnValue(repoHook({ registerStop }));
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(stopProject).toHaveBeenCalledOnce());
    expect(registerStop).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("devhub:repo-run-intent:repo-1")).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Project stopped");
  });

  it("registers BrowserPod portal URLs once they appear", async () => {
    const registerRun = vi.fn().mockResolvedValue(makeRepo({ status: "running" }));
    mockedUseRepo.mockReturnValue(repoHook({ registerRun }));

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await waitFor(() => expect(registerRun).toHaveBeenCalledWith("https://portal.example"));
    expect(window.localStorage.getItem("devhub:repo-run-intent:repo-1")).toBe("true");
  });

  it("loads AI tabs and keeps repo chat visible outside the tab switcher", async () => {
    const loadExtraction = vi.fn();
    mockedUseRepo.mockReturnValue(repoHook({ extraction: undefined, aiReadme: undefined, loadExtraction }));
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByTestId("chat-panel")).toHaveTextContent("Repo AI");

    await userEvent.click(screen.getByRole("tab", { name: "AI Readme" }));
    await waitFor(() => expect(loadExtraction).toHaveBeenCalledOnce());
    expect(screen.getByTestId("ai-readme")).toHaveTextContent("no readme");

    await userEvent.click(screen.getByRole("tab", { name: "Functions" }));
    await waitFor(() => expect(loadExtraction).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("functions-viewer")).toHaveTextContent("frontend functions");

    await userEvent.click(screen.getByRole("tab", { name: "Live Preview" }));
    expect(screen.getByTestId("portal-preview")).toHaveTextContent("https://portal.example");
    expect(screen.queryByRole("tab", { name: "Chat" })).not.toBeInTheDocument();
  });

  it("falls back to backend file reads when BrowserPod is not readable", async () => {
    const readFile = vi.fn();
    mockedUsePod.mockReturnValueOnce({
      ...podHook(),
      snapshot: { repoId: "repo-1", state: "idle", terminal: [], fileTree: makeFileTree(), runnability: makeRunnability() },
      readFile,
    });
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await waitFor(() => expect(screen.getByTestId("file-viewer")).toHaveTextContent("README.md:"));
    expect(readFile).not.toHaveBeenCalled();
  });

  it("falls back to backend reads after BrowserPod read failures", async () => {
    const readFile = vi.fn().mockRejectedValue(new Error("pod failed"));
    mockedUsePod.mockReturnValueOnce({
      ...podHook(),
      readFile,
    });
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await waitFor(() => expect(screen.getByTestId("file-viewer")).toHaveTextContent("README.md:backend read"));
    expect(readFile).toHaveBeenCalledWith("README.md");
  });

  it("shows backend file read errors", async () => {
    vi.mocked(mockedApi.repos.getFile).mockRejectedValueOnce(new Error("backend down"));
    mockedUsePod.mockReturnValueOnce({
      ...podHook(),
      snapshot: { repoId: "repo-1", state: "idle", terminal: [], fileTree: makeFileTree(), runnability: makeRunnability() },
      readFile: vi.fn(),
    });
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await waitFor(() => expect(screen.getByTestId("file-viewer")).toHaveTextContent("backend down"));
  });

  it("toggles the file tree sidebar", async () => {
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByRole("button", { name: /File tree/ })).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Toggle file tree"));

    expect(screen.queryByRole("button", { name: /File tree/ })).not.toBeInTheDocument();
  });

  it("shows bootstrap errors and retries repo refresh", async () => {
    const bootstrapRepoFiles = vi.fn().mockRejectedValue(new Error("boot failed"));
    const refresh = vi.fn();
    mockedUseRepo.mockReturnValue(repoHook({
      repo: makeRepo({ status: "cloning", fileTree: null, analysis: null, aiReadme: null }),
      refresh,
    }));
    mockedUsePod.mockReturnValue({
      ...podHook(),
      snapshot: { repoId: "repo-1", state: "idle", terminal: [] },
      bootstrapRepoFiles,
    });

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await waitFor(() => expect(screen.getByText("boot failed")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows repo and bootstrap errors", () => {
    mockedUseRepo.mockReturnValue(repoHook({ error: "repo failed" }));

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByText("repo failed")).toBeInTheDocument();
  });
});
