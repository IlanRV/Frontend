import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { DashboardPage } from "@/pages/DashboardPage";
import { LandingPage } from "@/pages/LandingPage";
import { RepoPage } from "@/pages/RepoPage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { stopRegisteredPod, usePod } from "@/hooks/usePod";
import { useRepo } from "@/hooks/useRepo";
import { useWorkspace, useWorkspaces } from "@/hooks/useWorkspace";
import { api } from "@/lib/api";
import { makeExtraction, makeFileTree, makeRepo, makeRunnability, makeRuntimeProfile, makeWorkspace } from "@/test/factories";
import { makeSecurityScan } from "@/test/factories";

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
  stopRegisteredPod: vi.fn(),
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
  RepoCard: ({ repo, onOpen, onRun, onDelete, isDeleting }: { repo: { name: string }; onOpen: () => void; onRun: () => void; onDelete?: () => void; isDeleting?: boolean }) => (
    <div>
      <button type="button" onClick={onOpen}>Open {repo.name}</button>
      <button type="button" onClick={onRun}>Run {repo.name}</button>
      {onDelete && <button type="button" disabled={isDeleting} onClick={onDelete}>{isDeleting ? "Deleting" : `Delete ${repo.name}`}</button>}
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

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  },
}));

vi.mock("@/components/repo/RunButton", () => ({
  RunButton: ({ canRun, isRunning, isBusy, label, onRun, onStop }: { canRun: boolean; isRunning: boolean; isBusy?: boolean; label?: string; onRun: () => void; onStop: () => void }) => (
    <button type="button" disabled={!canRun || isBusy} onClick={isRunning ? onStop : onRun}>{isRunning ? "Stop" : label ?? "Run"}</button>
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
const mockedStopRegisteredPod = vi.mocked(stopRegisteredPod);
const mockedApi = vi.mocked(api);

function repoHook(overrides: Partial<ReturnType<typeof useRepo>> = {}) {
  return {
    repo: makeRepo(),
    extraction: makeExtraction(),
    security: undefined,
    aiReadme: { raw: "# README" },
    isLoading: false,
    isAiLoading: false,
    isSecurityLoading: false,
    error: undefined,
    aiError: undefined,
    securityError: undefined,
    refresh: vi.fn(),
    loadExtraction: vi.fn(),
    loadAiReadme: vi.fn(),
    loadSecurity: vi.fn(),
    reportSecurityEvent: vi.fn().mockResolvedValue(undefined),
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
    deleteRepo: vi.fn(),
  });
  mockedUseRepo.mockReturnValue(repoHook());
  mockedUsePod.mockReturnValue(podHook());
  mockedStopRegisteredPod.mockResolvedValue(undefined);
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
      deleteRepo: vi.fn(),
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
      deleteRepo: vi.fn(),
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    expect(screen.getByText("No repos yet")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /Add Repo/ }).at(-1)!);

    expect(screen.getByTestId("add-repo-modal")).toHaveTextContent("open");
  });

  it("opens and cancels repository deletion", async () => {
    const deleteRepo = vi.fn();
    mockedUseWorkspace.mockReturnValue({
      workspace: makeWorkspace(),
      repos: [makeRepo()],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      addRepo: vi.fn(),
      updateRepo: vi.fn(),
      deleteRepo,
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete frontend" }));

    expect(screen.getByRole("dialog", { name: "Delete repository?" })).toBeInTheDocument();
    expect(screen.getByText('This removes "frontend" from this workspace and deletes its cached analysis, chat history, cached files, and runtime security events. This does not delete the GitHub repository.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteRepo).not.toHaveBeenCalled();
  });

  it("confirms repository deletion and removes it from the list", async () => {
    const deleteRepoSpy = vi.fn().mockResolvedValue(undefined);
    mockedUseWorkspace.mockImplementation(() => {
      const [repos, setRepos] = useState([makeRepo()]);

      return {
        workspace: makeWorkspace({ repos, repoCount: repos.length }),
        repos,
        isLoading: false,
        error: undefined,
        refresh: vi.fn(),
        addRepo: vi.fn(),
        updateRepo: vi.fn(),
        deleteRepo: async (repoId: string) => {
          await deleteRepoSpy(repoId);
          setRepos((current) => current.filter((repo) => repo.id !== repoId));
        },
      };
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete frontend" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete repository" }));

    await waitFor(() => expect(deleteRepoSpy).toHaveBeenCalledWith("repo-1"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open frontend" })).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Repository deleted");
  });

  it("shows an error toast when repository deletion fails", async () => {
    const deleteRepo = vi.fn().mockRejectedValue(new Error("delete failed"));
    mockedUseWorkspace.mockReturnValue({
      workspace: makeWorkspace(),
      repos: [makeRepo()],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      addRepo: vi.fn(),
      updateRepo: vi.fn(),
      deleteRepo,
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete frontend" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete repository" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("delete failed"));
    expect(screen.getByRole("dialog", { name: "Delete repository?" })).toBeInTheDocument();
  });

  it("stops local sandboxes before deleting running repositories", async () => {
    const deleteRepo = vi.fn().mockResolvedValue(undefined);
    mockedUseWorkspace.mockReturnValue({
      workspace: makeWorkspace(),
      repos: [makeRepo({ status: "running", portalUrl: "https://portal.example" })],
      isLoading: false,
      error: undefined,
      refresh: vi.fn(),
      addRepo: vi.fn(),
      updateRepo: vi.fn(),
      deleteRepo,
    });
    renderWithRouter("/workspace/workspace-1", <WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete frontend" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete repository" }));

    await waitFor(() => expect(mockedStopRegisteredPod).toHaveBeenCalledWith("repo-1"));
    expect(deleteRepo).toHaveBeenCalledWith("repo-1");
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

    await userEvent.click(screen.getByRole("button", { name: "Run in BrowserPod" }));

    await waitFor(() => expect(pod.runProject).toHaveBeenCalledWith("dev", { previewExpected: true }));
    expect(window.localStorage.getItem("devhub:repo-run-intent:repo-1")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Run inspector" })).toBeInTheDocument();
  });

  it("uses backend autoCommand only for auto-preview runtime profiles", async () => {
    const runProject = vi.fn().mockResolvedValue(undefined);
    const runnability = makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({ autoCommand: "npm run dev" }),
    });
    mockedUseRepo.mockReturnValue(repoHook({ extraction: makeExtraction({ runnability }) }));
    mockedUsePod.mockReturnValue({ ...podHook(), runProject });

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByText("Runtime profile")).toBeInTheDocument();
    expect(screen.getByText("Auto preview command")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Run preview in BrowserPod" })[0]);

    await waitFor(() => expect(runProject).toHaveBeenCalledWith("npm run dev", { previewExpected: true }));
  });

  it("keeps manual-only commands out of the primary run path", async () => {
    const runProject = vi.fn().mockResolvedValue(undefined);
    const registerRun = vi.fn().mockResolvedValue(makeRepo({ status: "running" }));
    const runnability = makeRunnability({
      canRun: false,
      entryPoint: null,
      blockers: ["CLI project"],
      runtimeProfile: makeRuntimeProfile({
        projectKind: "cli",
        supportLevel: "manual-only",
        previewExpected: false,
        autoCommand: null,
        manualCommands: [{ command: "npm test", description: "Run tests", source: "package-script", confidence: "high" }],
      }),
    });
    mockedUseRepo.mockReturnValue(repoHook({
      repo: makeRepo({ runnability, portalUrl: undefined }),
      extraction: makeExtraction({ runnability }),
      registerRun,
    }));
    mockedUsePod.mockReturnValue({
      ...podHook(),
      snapshot: { repoId: "repo-1", state: "ready", terminal: [], fileTree: makeFileTree(), runnability },
      runProject,
    });

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText("Manual only")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run npm test in BrowserPod" }));

    await waitFor(() => expect(runProject).toHaveBeenCalledWith("npm test", { previewExpected: false }));
    expect(registerRun).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Run inspector" })).toBeInTheDocument();
  });

  it("shows analysis-only runtime profiles without run controls", () => {
    const runnability = makeRunnability({
      canRun: false,
      entryPoint: null,
      blockers: ["Library package"],
      runtimeProfile: makeRuntimeProfile({
        projectKind: "library",
        supportLevel: "analysis-only",
        previewExpected: false,
        autoCommand: null,
        manualCommands: [{ command: "npm test", source: "package-script", confidence: "medium" }],
      }),
    });
    mockedUseRepo.mockReturnValue(repoHook({ extraction: makeExtraction({ runnability }) }));
    mockedUsePod.mockReturnValue({
      ...podHook(),
      snapshot: { repoId: "repo-1", state: "ready", terminal: [], fileTree: makeFileTree(), runnability },
    });

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByText("Analysis only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Run npm test in BrowserPod" })).not.toBeInTheDocument();
  });

  it("disables run and shows blocker details when backend says the repo is not runnable", async () => {
    const runnability = makeRunnability({
      canRun: false,
      entryPoint: null,
      blockers: [],
      blockerDetails: [
        {
          code: "native-dep",
          severity: "high",
          title: "Native dependency cannot run in BrowserPod",
          description: "The project requires a native package during startup.",
          recommendation: "Remove the native dependency or provide a browser-compatible script.",
          evidence: "sharp",
        },
      ],
    });
    mockedUseRepo.mockReturnValue(repoHook({
      repo: makeRepo({ runnable: false, runnability }),
      extraction: makeExtraction({ runnability }),
    }));
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    await userEvent.click(screen.getByRole("tab", { name: "Security" }));

    expect(screen.getByText("This repository cannot be started automatically")).toBeInTheDocument();
    expect(screen.getByText("Native dependency cannot run in BrowserPod")).toBeInTheDocument();
    expect(screen.getByText("sharp")).toBeInTheDocument();
  });

  it("requires confirmation before running high-risk repos", async () => {
    const runProject = vi.fn().mockResolvedValue(undefined);
    const registerRun = vi.fn().mockResolvedValue(makeRepo({ status: "running" }));
    const highRiskExtraction = makeExtraction({
      security: makeSecurityScan({
        riskLevel: "high",
        summary: "Suspicious install script detected.",
        findings: [
          {
            title: "Credential theft attempt",
            severity: "high",
            category: "secret",
            file: "postinstall.js",
            line: 4,
            evidence: ".npmrc and .ssh reads",
            impact: "Could steal credentials outside a sandbox.",
            recommendation: "Only run inside BrowserPod if needed.",
            confidence: "high",
          },
        ],
      }),
    });
    mockedUseRepo.mockReturnValue(repoHook({ extraction: highRiskExtraction, registerRun }));
    mockedUsePod.mockReturnValue({
      ...podHook(),
      runProject,
    });

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await userEvent.click(screen.getByRole("button", { name: "Run in BrowserPod sandbox anyway" }));

    expect(runProject).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm sandboxed run")).toBeInTheDocument();
    expect(screen.getByText(/malicious install scripts/)).toBeInTheDocument();
    expect(screen.getByText(/isolates the run from your real filesystem and credentials/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "I understand, run in BrowserPod sandbox" }));

    await waitFor(() => expect(runProject).toHaveBeenCalledWith("dev", { previewExpected: true }));
    await waitFor(() => expect(registerRun).toHaveBeenCalledWith("https://portal.example", { sandboxConfirmed: true, manualOverride: false }));
  });

  it("sends manualOverride when a user runs a repo script despite blockers", async () => {
    const runProject = vi.fn().mockResolvedValue(undefined);
    const registerRun = vi.fn().mockResolvedValue(makeRepo({ status: "running" }));
    const runnability = makeRunnability({ canRun: false, entryPoint: null, blockers: ["No dev script detected"] });
    mockedUseRepo.mockReturnValue(repoHook({
      repo: makeRepo({ runnability, runScript: "start" }),
      extraction: makeExtraction({ runnability }),
      registerRun,
    }));
    mockedUsePod.mockReturnValue({ ...podHook(), runProject });

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Run with manual override" }));

    await waitFor(() => expect(runProject).toHaveBeenCalledWith("start", { previewExpected: true }));
    await waitFor(() => expect(registerRun).toHaveBeenCalledWith("https://portal.example", { sandboxConfirmed: false, manualOverride: true }));
  });

  it("shows BrowserPod timeout safety events in the security tab", async () => {
    const snapshot = {
      ...podHook().snapshot,
      securityEvents: [
        {
          id: "evt-timeout",
          code: "startup-timeout" as const,
          source: "browserpod" as const,
          phase: "start" as const,
          category: "resource" as const,
          severity: "medium" as const,
          title: "Sandbox startup timed out",
          description: "The sandbox was stopped because the project did not finish starting. This can happen with broken projects, infinite loops, or resource-heavy code.",
          evidence: "No BrowserPod portal opened within 30 seconds.",
          createdAt: "2026-05-03T00:00:00.000Z",
        },
      ],
    };
    mockedUsePod.mockReturnValue({ ...podHook(), snapshot });
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Security" }));

    expect(screen.getByText("The sandbox was stopped because the project did not finish starting. This can happen with broken projects, infinite loops, or resource-heavy code.")).toBeInTheDocument();
  });

  it("reports BrowserPod timeout events to the backend security-events endpoint", async () => {
    const reportSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const snapshot = {
      ...podHook().snapshot,
      securityEvents: [
        {
          id: "evt-install-timeout",
          code: "install-timeout" as const,
          source: "browserpod" as const,
          phase: "install" as const,
          category: "resource" as const,
          severity: "high" as const,
          title: "Install timed out",
          description: "The install command did not finish before the safety timeout.",
          evidence: "npm install --ignore-scripts exceeded 60000ms.",
          command: "npm install --ignore-scripts",
          createdAt: "2026-05-03T00:00:00.000Z",
        },
        {
          id: "evt-start-timeout",
          code: "startup-timeout" as const,
          source: "browserpod" as const,
          phase: "start" as const,
          category: "resource" as const,
          severity: "high" as const,
          title: "Dev server did not become ready",
          description: "The project started a process but did not expose a BrowserPod portal before the timeout.",
          evidence: "No BrowserPod portal opened within 30 seconds.",
          command: "npm run dev",
          createdAt: "2026-05-03T00:00:00.000Z",
        },
      ],
    };
    mockedUsePod.mockReturnValue({ ...podHook(), snapshot });
    mockedUseRepo.mockReturnValue(repoHook({ reportSecurityEvent }));

    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await waitFor(() => expect(reportSecurityEvent).toHaveBeenCalledTimes(2));
    expect(reportSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ title: "Install timed out", command: "npm install --ignore-scripts" }));
    expect(reportSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ title: "Dev server did not become ready", phase: "start" }));
  });

  it("renders backend runtime security timeline events", async () => {
    mockedUseRepo.mockReturnValue(repoHook({
      security: {
        success: true,
        repoId: "repo-1",
        staticSecurity: null,
        runnability: makeRunnability(),
        runtimeSecurity: {
          riskLevel: "high",
          eventCount: 1,
          latestEventAt: "2026-05-03T00:00:00.000Z",
          events: [
            {
              id: "evt-1",
              source: "browserpod",
              phase: "runtime",
              category: "filesystem",
              severity: "high",
              title: "Suspicious credential path access",
              description: "The sandbox logs referenced sensitive credential paths. BrowserPod isolates these paths from the real machine.",
              evidence: "cat ~/.ssh/id_rsa",
              createdAt: "2026-05-03T00:00:00.000Z",
            },
          ],
        },
      },
    }));
    renderWithRouter("/workspace/workspace-1/repo/repo-1", <RepoPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Security" }));

    expect(screen.getByText("Runtime sandbox events")).toBeInTheDocument();
    expect(screen.getByText("Suspicious credential path access")).toBeInTheDocument();
    expect(screen.getByText("cat ~/.ssh/id_rsa")).toBeInTheDocument();
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

    await waitFor(() => expect(registerRun).toHaveBeenCalledWith("https://portal.example", {}));
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

    expect(screen.queryByRole("tab", { name: "Live Preview" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(screen.getByRole("dialog", { name: "Run inspector" })).toBeInTheDocument();
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
