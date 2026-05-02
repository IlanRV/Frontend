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

  it("renders loading and error states", () => {
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
});

describe("WorkspacePage", () => {
  it("renders workspace repos and opens repo routes", async () => {
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />, true);

    expect(screen.getByText("Workspace One")).toBeInTheDocument();
    expect(screen.getByText("Repositories")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open frontend" }));
    expect(screen.getByText("Repo route")).toBeInTheDocument();
  });

  it("renders errors and empty repo states", () => {
    mockedUseWorkspace.mockReturnValueOnce({
      workspace: undefined,
      repos: [],
      isLoading: false,
      error: "workspace failed",
      refresh: vi.fn(),
      addRepo: vi.fn(),
      updateRepo: vi.fn(),
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    expect(screen.getByText("workspace failed")).toBeInTheDocument();
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

  it("shows repo and bootstrap errors", () => {
    mockedUseRepo.mockReturnValue(repoHook({ error: "repo failed" }));

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByText("repo failed")).toBeInTheDocument();
  });
});
