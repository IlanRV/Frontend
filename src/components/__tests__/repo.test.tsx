import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { AddRepoModal } from "@/components/repo/AddRepoModal";
import { FileTree } from "@/components/repo/FileTree";
import { FileViewer } from "@/components/repo/FileViewer";
import { PortalPreview } from "@/components/repo/PortalPreview";
import { RepoCard } from "@/components/repo/RepoCard";
import { RunButton } from "@/components/repo/RunButton";
import { RunInspectionDialog } from "@/components/repo/RunInspectionDialog";
import { RunnabilityBadge } from "@/components/repo/RunnabilityBadge";
import { RuntimeProfileCard } from "@/components/repo/RuntimeProfileCard";
import { api } from "@/lib/api";
import { saveCachedFileTree } from "@/lib/fileTreeCache";
import { usePod } from "@/hooks/usePod";
import { makeFileTree, makeRepo, makeRunnability, makeRuntimeProfile } from "@/test/factories";

vi.mock("@/hooks/usePod", () => ({
  usePod: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    ai: {
      extract: vi.fn(),
    },
    repos: {
      delete: vi.fn(),
      deleteFromWorkspace: vi.fn(),
    },
  },
}));

vi.mock("@/lib/fileTreeCache", () => ({
  saveCachedFileTree: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  },
}));

const podMock = {
  terminalRef: { current: null },
  snapshot: { repoId: "temp", state: "idle", terminal: [] },
  bootstrapRepo: vi.fn(),
  bootstrapRepoFiles: vi.fn(),
  collectAiExtractionPayload: vi.fn(),
  terminate: vi.fn(),
};

beforeEach(() => {
  vi.mocked(usePod).mockReturnValue(podMock as never);
  podMock.bootstrapRepo.mockResolvedValue({ fileTree: makeFileTree(), runnability: makeRunnability() });
  podMock.bootstrapRepoFiles.mockResolvedValue(makeFileTree());
  podMock.collectAiExtractionPayload.mockResolvedValue({ fileTree: makeFileTree(), files: [] });
  podMock.terminate.mockResolvedValue(undefined);
  vi.mocked(api.ai.extract).mockResolvedValue({ success: true, extractionId: "ext-1", status: "ready" });
  vi.mocked(api.repos.delete).mockResolvedValue(undefined);
});

describe("FileTree", () => {
  it("renders empty and no-file states", () => {
    const { rerender } = render(<FileTree onSelectFile={vi.fn()} />);

    expect(screen.getByText("File tree will appear after the repo is cloned.")).toBeInTheDocument();
    rerender(<FileTree tree={{ name: "repo", path: "", type: "directory", children: [] }} onSelectFile={vi.fn()} />);
    expect(screen.getByText("No files were found for this repo yet.")).toBeInTheDocument();
  });

  it("expands directories and selects supported files", async () => {
    const onSelectFile = vi.fn();
    render(<FileTree tree={makeFileTree()} selectedPath="README.md" onSelectFile={onSelectFile} />);

    expect(screen.getByRole("button", { name: /repo/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /src/ }));
    expect(screen.queryByRole("button", { name: /App.tsx/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /src/ }));
    await userEvent.click(screen.getByRole("button", { name: /App.tsx/ }));

    expect(onSelectFile).toHaveBeenCalledWith("src/App.tsx");
    expect(screen.getByRole("button", { name: /secret.bin/ })).toBeDisabled();
  });
});

describe("FileViewer", () => {
  it("renders loading, error, and empty states", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<FileViewer content="" isLoading />);

    expect(screen.getByText("Loading file")).toBeInTheDocument();
    rerender(<FileViewer content="" error="File failed" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<FileViewer content="" />);
    expect(screen.getByText("Select a supported file from the tree.")).toBeInTheDocument();
  });

  it("renders Monaco with detected language and theme", () => {
    document.documentElement.classList.add("dark");

    render(<FileViewer path="src/App.tsx" content="export function App() {}" />);

    expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-language", "typescript");
    expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-theme", "vs-dark");
    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
  });

  it.each([
    ["index.ts", "typescript"],
    ["index.js", "javascript"],
    ["index.jsx", "javascript"],
    ["package.json", "json"],
    ["styles.css", "css"],
    ["index.html", "html"],
    ["script.py", "python"],
    ["workflow.yml", "yaml"],
    ["workflow.yaml", "yaml"],
    [".env", "shell"],
    [".gitignore", "shell"],
    ["notes.txt", "plaintext"],
  ])("detects %s as %s", (path, language) => {
    render(<FileViewer path={path} content="content" />);

    expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-language", language);
  });

  it("renders markdown files as formatted markdown", () => {
    render(<FileViewer path="README.md" content={"# Title\n\n- item"} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();
    expect(screen.queryByTestId("monaco-editor")).not.toBeInTheDocument();
  });

  it("updates the editor theme when the document theme changes", async () => {
    render(<FileViewer path="index.js" content="console.log('hi')" />);

    expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-theme", "light");
    document.documentElement.classList.add("dark");

    await waitFor(() => expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-theme", "vs-dark"));
  });
});

describe("PortalPreview", () => {
  it("shows a placeholder without a portal", () => {
    render(<PortalPreview />);

    expect(screen.getByText("Run the project to open a live BrowserPod portal.")).toBeInTheDocument();
  });

  it("normalizes preview paths and updates iframe URLs", async () => {
    render(<PortalPreview portalUrl="https://portal.example/base?x=1#hash" previewPaths={["api/health", "/docs"]} />);

    expect(screen.getByTitle("BrowserPod live preview")).toHaveAttribute("src", "https://portal.example/");
    await userEvent.click(screen.getByRole("button", { name: "/api/health" }));
    await waitFor(() => expect(screen.getByTitle("BrowserPod live preview")).toHaveAttribute("src", "https://portal.example/api/health"));
    await userEvent.clear(screen.getByLabelText("Preview path"));
    await userEvent.type(screen.getByLabelText("Preview path"), "docs");
    await userEvent.click(screen.getByRole("button", { name: "Load path" }));
    expect(screen.getByTitle("BrowserPod live preview")).toHaveAttribute("src", "https://portal.example/docs");
  });

  it("shows runtime metadata and stop controls", async () => {
    const onStop = vi.fn();
    render(
      <PortalPreview
        portalUrl="https://portal.example"
        command="npm run dev"
        projectKind="preview-app"
        runtimeEventCount={2}
        onStop={onStop}
      />,
    );

    expect(screen.getByText("Sandboxed by BrowserPod")).toBeInTheDocument();
    expect(screen.getByText("Preview app")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByText("2 runtime alert(s)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop sandbox" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});

describe("RunInspectionDialog", () => {
  it("renders live preview, console output, and a QR code for preview URLs", async () => {
    render(
      <RunInspectionDialog
        open
        onOpenChange={vi.fn()}
        portalUrl="https://portal.example"
        previewPath="/docs"
        command="npm run dev"
        previewExpected
        terminalLines={[{ id: "line-1", stream: "stdout", text: "server ready", createdAt: "now" }]}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Run inspector" })).toBeInTheDocument();
    expect(screen.getByText("Current command")).toBeInTheDocument();
    expect(screen.queryByText("Preview expected")).not.toBeInTheDocument();
    expect(screen.getByTitle("BrowserPod live preview")).toHaveAttribute("src", "https://portal.example/docs");
    expect(screen.getByText("server ready")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show QR code" }));

    expect(await screen.findByRole("img", { name: "QR code for BrowserPod preview" })).toHaveAttribute("src", "data:image/png;base64,qr");
  });

  it("renders a console-only run view without preview URLs", () => {
    render(
      <RunInspectionDialog
        open
        onOpenChange={vi.fn()}
        command="npm test"
        previewExpected={false}
        terminalLines={[{ id: "line-1", stream: "stderr", text: "test output", createdAt: "now" }]}
      />,
    );

    expect(screen.getByText("No live preview yet")).toBeInTheDocument();
    expect(screen.getByText("test output")).toBeInTheDocument();
    expect(screen.queryByTitle("BrowserPod live preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show QR code" })).not.toBeInTheDocument();
  });

  it("shows a stop control before a preview portal appears", async () => {
    const onStop = vi.fn();
    render(
      <RunInspectionDialog
        open
        onOpenChange={vi.fn()}
        command="npm run dev"
        previewExpected
        onStop={onStop}
        terminalLines={[]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onStop).toHaveBeenCalledOnce();
  });

  it("keeps the inspector header clear of badge clutter and uses a blurred backdrop", () => {
    render(
      <RunInspectionDialog
        open
        onOpenChange={vi.fn()}
        portalUrl="https://portal.example"
        command="npm run dev"
        previewExpected
        projectKind="api-server"
        riskLevel="high"
        runtimeEventCount={2}
        terminalLines={[]}
      />,
    );

    expect(screen.queryByText("API server")).not.toBeInTheDocument();
    expect(screen.queryByText("High-risk repo")).not.toBeInTheDocument();
    expect(document.querySelector(".backdrop-blur-sm")).toBeInTheDocument();
  });
});

describe("RuntimeProfileCard", () => {
  it("starts as a compact collapsed summary", () => {
    render(<RuntimeProfileCard runnability={makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({
        autoCommand: "npm run dev",
        manualCommands: [{ command: "npm test", label: "Run tests", source: "package-script", confidence: "high" }],
      }),
    })} />);

    const toggle = screen.getByRole("button", { name: /Runtime profile/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Official run available")).toBeInTheDocument();
    expect(screen.getByText("1 alternate run")).toBeInTheDocument();
    expect(screen.queryByText("Official BrowserPod run")).not.toBeInTheDocument();
    expect(screen.queryByText("npm run dev")).not.toBeInTheDocument();
  });

  it("renders auto-preview commands and runtime evidence", async () => {
    const onRunAuto = vi.fn();
    render(<RuntimeProfileCard runnability={makeRunnability({ autoCommand: "npm run dev", runtimeProfile: makeRuntimeProfile() })} onRunAuto={onRunAuto} />);

    expect(screen.getByText("Runtime profile")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));
    expect(screen.getByText("Official BrowserPod run")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Runtime details" }));
    expect(screen.getByText("package.json scripts.dev")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run preview in BrowserPod" }));
    expect(onRunAuto).toHaveBeenCalledWith("npm run dev");
  });

  it("renders manual-only commands without enabling analysis-only runs", async () => {
    const onRunManualCommand = vi.fn();
    const { rerender } = render(<RuntimeProfileCard runnability={makeRunnability({
      canRun: false,
      runtimeProfile: makeRuntimeProfile({
        projectKind: "cli",
        supportLevel: "manual-only",
        previewExpected: false,
        autoCommand: null,
        manualCommands: [{ command: "npm test", description: "Run tests", source: "package-script", confidence: "high" }],
      }),
    })} onRunManualCommand={onRunManualCommand} />);

    expect(screen.getByText("Manual only")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));
    expect(screen.getByText("Alternate sandbox runs")).toBeInTheDocument();
    expect(screen.getAllByText("npm test").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Run npm test in BrowserPod" }));
    expect(onRunManualCommand).toHaveBeenCalledWith(expect.objectContaining({ command: "npm test" }));

    rerender(<RuntimeProfileCard runnability={makeRunnability({
      canRun: false,
      runtimeProfile: makeRuntimeProfile({
        projectKind: "library",
        supportLevel: "analysis-only",
        previewExpected: false,
        autoCommand: null,
        manualCommands: [{ command: "npm test", source: "package-script", confidence: "high" }],
      }),
    })} onRunManualCommand={onRunManualCommand} />);

    expect(screen.getByText("Analysis only")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));
    expect(screen.queryByRole("button", { name: "Run npm test in BrowserPod" })).not.toBeInTheDocument();
  });

  it("groups official and alternate run paths", async () => {
    render(<RuntimeProfileCard runnability={makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({
        autoCommand: "npm run dev",
        manualCommands: [
          { command: "npm run docs", label: "Run docs", description: "Start documented docs server", source: "readme", confidence: "high", previewExpected: true },
          { command: "npm test", label: "Run tests", description: "AI found a test entrypoint", source: "ai", confidence: "medium", previewExpected: false },
        ],
      }),
    })} onRunAuto={vi.fn()} onRunManualCommand={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));

    expect(screen.getByText("Official BrowserPod run")).toBeInTheDocument();
    expect(screen.getByText("Alternate sandbox runs")).toBeInTheDocument();
    expect(screen.getByText("readme")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
    expect(screen.getAllByText("opens preview").length).toBeGreaterThan(0);
    expect(screen.getByText("console-only")).toBeInTheDocument();
  });

  it("shows inferred package-script run evidence without requiring a README", async () => {
    render(<RuntimeProfileCard runnability={makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({
        autoCommand: "npm run dev",
        evidence: ["package.json scripts.dev", "frontend framework indicators"],
        reasoning: "Package scripts and source files point to a preview app.",
      }),
    })} onRunAuto={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));

    expect(screen.getByText("Official BrowserPod run")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByText(/Evidence: package\.json scripts\.dev/)).toBeInTheDocument();
    expect(screen.queryByText("This repo is not runnable in BrowserPod yet")).not.toBeInTheDocument();
  });

  it("surfaces README-backed workspace scripts as BrowserPod run options", async () => {
    render(<RuntimeProfileCard runnability={makeRunnability({
      autoCommand: "npm run dev:frontend",
      runtimeProfile: makeRuntimeProfile({
        autoCommand: "npm run dev:frontend",
        evidence: ["README says npm run dev:frontend", "root package.json defines dev:frontend"],
        manualCommands: [
          {
            command: "npm run dev:backend",
            label: "Run backend",
            reason: "The README and root package expose this backend workspace command.",
            confidence: "medium",
          },
        ],
      }),
    })} onRunAuto={vi.fn()} onRunManualCommand={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));

    expect(screen.getByText("npm run dev:frontend")).toBeInTheDocument();
    expect(screen.getByText(/Evidence: README says npm run dev:frontend/)).toBeInTheDocument();
    expect(screen.getByText("Workspace script")).toBeInTheDocument();
    expect(screen.getByText("npm run dev:backend")).toBeInTheDocument();
    expect(screen.getByText("The README and root package expose this backend workspace command.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run backend in BrowserPod" })).toBeInTheDocument();
  });

  it("runs the selected official or AI-suggested path from a dropdown", async () => {
    const onRunAuto = vi.fn();
    const onRunManualCommand = vi.fn();
    render(<RuntimeProfileCard runnability={makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({
        autoCommand: "npm run dev",
        manualCommands: [
          { command: "npm test", label: "Run tests", source: "ai", confidence: "medium", previewExpected: false },
        ],
      }),
    })} onRunAuto={onRunAuto} onRunManualCommand={onRunManualCommand} />);

    expect(screen.getByLabelText("Run path")).toHaveValue("official");
    await userEvent.click(screen.getByRole("button", { name: "Run selected in BrowserPod" }));
    expect(onRunAuto).toHaveBeenCalledWith("npm run dev");

    await userEvent.selectOptions(screen.getByLabelText("Run path"), "manual-0");
    await userEvent.click(screen.getByRole("button", { name: "Run selected in BrowserPod" }));

    expect(onRunManualCommand).toHaveBeenCalledWith(expect.objectContaining({ command: "npm test", source: "ai" }));
  });

  it("offers the active run inspector while running", async () => {
    const onOpenInspector = vi.fn();
    render(<RuntimeProfileCard
      runnability={makeRunnability({ autoCommand: "npm run dev", runtimeProfile: makeRuntimeProfile({ autoCommand: "npm run dev" }) })}
      isRunning
      hasInspector
      activeCommand="npm run dev"
      onOpenInspector={onOpenInspector}
    />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View run inspector" }));

    expect(onOpenInspector).toHaveBeenCalledOnce();
  });

  it("lets users stop a running command before switching run paths", async () => {
    const onStopRun = vi.fn();
    render(<RuntimeProfileCard
      runnability={makeRunnability({
        autoCommand: "npm run dev",
        runtimeProfile: makeRuntimeProfile({
          autoCommand: "npm run dev",
          manualCommands: [{ command: "npm test", label: "Run tests", source: "ai", confidence: "medium" }],
        }),
      })}
      isRunning
      activeCommand="npm run dev"
      onRunAuto={vi.fn()}
      onRunManualCommand={vi.fn()}
      onStopRun={onStopRun}
    />);

    const select = screen.getByLabelText("Run path");
    expect(select).not.toBeDisabled();
    await userEvent.selectOptions(select, "manual-0");
    expect(select).toHaveValue("manual-0");
    expect(screen.getByRole("button", { name: "Run selected in BrowserPod" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Stop current run" }));

    expect(onStopRun).toHaveBeenCalledOnce();
  });

  it("shows manual command status, output, and stop controls", async () => {
    const onStopManualCommand = vi.fn();
    render(<RuntimeProfileCard
      runnability={makeRunnability({
        canRun: false,
        runtimeProfile: makeRuntimeProfile({
          projectKind: "test-only",
          supportLevel: "manual-only",
          previewExpected: false,
          autoCommand: null,
          manualCommands: [{ command: "npm test", label: "Run tests", description: "Run the unit suite", source: "package-script", confidence: "high" }],
        }),
      })}
      commandRuns={{
        "npm test": {
          command: "npm test",
          label: "Run tests",
          status: "running",
          startedAt: "2026-05-03T00:00:00.000Z",
        },
      }}
      terminalLines={[
        { id: "line-old", stream: "stdout", text: "before", createdAt: "2026-05-02T23:59:59.000Z" },
        { id: "line-out", stream: "stdout", text: "tests passed", createdAt: "2026-05-03T00:00:01.000Z" },
        { id: "line-err", stream: "stderr", text: "warning output", createdAt: "2026-05-03T00:00:02.000Z" },
      ]}
      onStopManualCommand={onStopManualCommand}
      onRunManualCommand={vi.fn()}
    />);

    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));
    expect(screen.getByText("This repo is mostly tests or fixtures, so DevHub will not auto-start a preview.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run tests in BrowserPod" })).toBeDisabled();
    expect(screen.getByText("Status: running")).toBeInTheDocument();
    expect(screen.getByText("tests passed")).toBeInTheDocument();
    expect(screen.getByText("warning output")).toBeInTheDocument();
    expect(screen.queryByText("before")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Stop Run tests" }));

    expect(onStopManualCommand).toHaveBeenCalledWith(expect.objectContaining({ command: "npm test" }));
  });

  it("keeps repo preparation logs out of manual command output", async () => {
    render(<RuntimeProfileCard
      runnability={makeRunnability({
        canRun: false,
        runtimeProfile: makeRuntimeProfile({
          projectKind: "api-server",
          supportLevel: "manual-only",
          previewExpected: false,
          autoCommand: null,
          manualCommands: [{ command: "npm test", label: "Run tests", source: "package-script", confidence: "high" }],
        }),
      })}
      commandRuns={{
        "npm test": {
          command: "npm test",
          label: "Run tests",
          status: "failed",
          startedAt: "2026-05-03T00:00:00.000Z",
          outputStartedAt: "2026-05-03T00:00:10.000Z",
          finishedAt: "2026-05-03T00:00:11.000Z",
          message: "Command did not start.",
        },
      }}
      terminalLines={[
        { id: "clone", stream: "system", text: "Cloning https://github.com/snyk-labs/nodejs-goof", createdAt: "2026-05-03T00:00:01.000Z" },
        { id: "tree", stream: "system", text: "Filesystem tree was empty, checking git index", createdAt: "2026-05-03T00:00:02.000Z" },
        { id: "error", stream: "stderr", text: "BrowserPod command did not return a readable payload", createdAt: "2026-05-03T00:00:03.000Z" },
      ]}
      onRunManualCommand={vi.fn()}
    />);

    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));
    expect(screen.queryByText("Cloning https://github.com/snyk-labs/nodejs-goof")).not.toBeInTheDocument();
    expect(screen.queryByText("Filesystem tree was empty, checking git index")).not.toBeInTheDocument();
    expect(screen.queryByText("BrowserPod command did not return a readable payload")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for sandbox output. Full output also appears in Console.")).toBeInTheDocument();
  });

  it("collapses runtime reasoning and evidence by default", async () => {
    render(<RuntimeProfileCard runnability={makeRunnability({
      runtimeProfile: makeRuntimeProfile({
        reasoning: "Detailed runtime reasoning",
        evidence: ["package.json scripts.dev"],
      }),
    })} />);

    await userEvent.click(screen.getByRole("button", { name: /Runtime profile/ }));
    expect(screen.getByRole("button", { name: "Runtime details" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Detailed runtime reasoning")).not.toBeInTheDocument();
  });
});

describe("repo controls", () => {
  it("renders run and stop button states", async () => {
    const onRun = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(<RunButton canRun isRunning={false} onRun={onRun} onStop={onStop} />);

    await userEvent.click(screen.getByTitle("Run project"));
    expect(onRun).toHaveBeenCalledOnce();
    rerender(<RunButton canRun isRunning onRun={onRun} onStop={onStop} />);
    await userEvent.click(screen.getByRole("button", { name: /Stop/ }));
    expect(onStop).toHaveBeenCalledOnce();
    rerender(<RunButton canRun={false} isRunning={false} onRun={onRun} onStop={onStop} />);
    expect(screen.getByRole("button", { name: /Run/ })).toBeDisabled();
  });

  it("renders runnability badges", () => {
    const { rerender } = render(<RunnabilityBadge />);

    expect(screen.getByText("Checking runnability")).toBeInTheDocument();
    rerender(<RunnabilityBadge result={makeRunnability()} />);
    expect(screen.getByText("Runnable via npm run dev")).toBeInTheDocument();
    rerender(<RunnabilityBadge result={makeRunnability({ canRun: false, entryPoint: null, blockers: ["missing"] })} />);
    expect(screen.getByText("1 run blocker(s)")).toBeInTheDocument();
  });

  it("renders repo cards and stops run clicks from opening the card", async () => {
    const onOpen = vi.fn();
    const onRun = vi.fn();
    render(<RepoCard repo={makeRepo({ portalUrl: undefined })} onOpen={onOpen} onRun={onRun} />);

    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("AI Readme")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Open and run repo"));
    expect(onRun).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("frontend"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders stop controls for running sandbox repos", async () => {
    const onOpen = vi.fn();
    const onStop = vi.fn();
    render(
      <RepoCard
        repo={makeRepo({ status: "running", portalUrl: "https://portal.example" })}
        onOpen={onOpen}
        onRun={vi.fn()}
        onStop={onStop}
      />,
    );

    expect(screen.getByText("Live")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Stop sandbox"));

    expect(onStop).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders an accessible delete button without opening the repo", async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <RepoCard
        repo={makeRepo()}
        onOpen={onOpen}
        onRun={vi.fn()}
        onDelete={onDelete}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete frontend" });
    expect(deleteButton).toHaveTextContent("Delete");

    await userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("disables repo delete buttons while deletion is pending", () => {
    render(
      <RepoCard
        repo={makeRepo()}
        onOpen={vi.fn()}
        onRun={vi.fn()}
        onDelete={vi.fn()}
        isDeleting
      />,
    );

    expect(screen.getByRole("button", { name: "Delete frontend" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete frontend" })).toHaveTextContent("Deleting");
  });

  it("renders repo card status variants and active state", () => {
    const onOpen = vi.fn();
    const onRun = vi.fn();
    const { rerender } = render(<RepoCard active repo={makeRepo({ status: "ready" })} onOpen={onOpen} onRun={onRun} />);

    expect(screen.getByRole("button", { name: /frontend/ })).toHaveClass("border-primary/70");
    for (const status of ["running", "error", "cloning", "analyzing"] as const) {
      rerender(<RepoCard repo={makeRepo({ status })} onOpen={onOpen} onRun={onRun} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    }
  });

  it("hides optional repo actions and opens with keyboard activation", () => {
    const onOpen = vi.fn();
    const onRun = vi.fn();
    render(
      <RepoCard
        repo={makeRepo({
          runnable: false,
          runnability: null,
          aiReadme: null,
          aiReadmeStatus: "pending",
          portalUrl: undefined,
        })}
        onOpen={onOpen}
        onRun={onRun}
      />,
    );

    const card = screen.getByRole("button", { name: /frontend/ });
    expect(screen.queryByTitle("Open and run repo")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Readme")).not.toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();

    fireEvent.keyDown(card, { key: " " });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onRun).not.toHaveBeenCalled();
  });
});

describe("AddRepoModal", () => {
  it("validates GitHub URLs", async () => {
    render(<AddRepoModal open onOpenChange={vi.fn()} onAdd={vi.fn()} onComplete={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("GitHub URL"), "https://example.com/repo");
    await userEvent.click(screen.getByRole("button", { name: "Add repo" }));

    expect(toast.error).toHaveBeenCalledWith("Enter a GitHub repository URL like https://github.com/org/repo");
  });

  it("creates repo records, extracts AI payloads, caches trees, and closes", async () => {
    const onAdd = vi.fn().mockResolvedValue(makeRepo());
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddRepoModal open onOpenChange={onOpenChange} onAdd={onAdd} onComplete={onComplete} />);

    await userEvent.type(screen.getByLabelText("GitHub URL"), "https://github.com/acme/frontend");
    await userEvent.click(screen.getByRole("button", { name: "Add repo" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("https://github.com/acme/frontend"));
    expect(podMock.bootstrapRepoFiles).toHaveBeenCalledWith("https://github.com/acme/frontend");
    expect(saveCachedFileTree).toHaveBeenCalledWith("repo-1", makeFileTree());
    expect(api.ai.extract).toHaveBeenCalledWith("repo-1", { fileTree: makeFileTree(), files: [] });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(podMock.terminate).toHaveBeenCalled();
  });

  it("rolls back created repos on extraction failure", async () => {
    const onAdd = vi.fn().mockResolvedValue(makeRepo());
    vi.mocked(api.ai.extract).mockRejectedValueOnce(new Error("extract failed"));
    render(<AddRepoModal open onOpenChange={vi.fn()} onAdd={onAdd} onComplete={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("GitHub URL"), "https://github.com/acme/frontend");
    await userEvent.click(screen.getByRole("button", { name: "Add repo" }));

    await waitFor(() => expect(api.repos.delete).toHaveBeenCalledWith("repo-1"));
    expect(toast.error).toHaveBeenCalledWith("extract failed");
  });
});
