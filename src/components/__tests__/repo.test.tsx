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
import { RunnabilityBadge } from "@/components/repo/RunnabilityBadge";
import { api } from "@/lib/api";
import { saveCachedFileTree } from "@/lib/fileTreeCache";
import { usePod } from "@/hooks/usePod";
import { makeFileTree, makeRepo, makeRunnability } from "@/test/factories";

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
    },
  },
}));

vi.mock("@/lib/fileTreeCache", () => ({
  saveCachedFileTree: vi.fn(),
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
