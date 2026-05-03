import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { AiReadmeViewer } from "@/components/ai/AiReadmeViewer";
import { FunctionsViewer } from "@/components/ai/FunctionsViewer";
import { SecurityOverview } from "@/components/ai/SecurityOverview";
import { makeExtraction, makeRunnability, makeSecurityScan } from "@/test/factories";

describe("AiReadmeViewer", () => {
  it("renders loading, error, and empty states", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<AiReadmeViewer isLoading />);

    expect(screen.getByText("Building AI README")).toBeInTheDocument();
    expect(screen.getByText("Live loading")).toBeInTheDocument();
    rerender(<AiReadmeViewer error="AI failed" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<AiReadmeViewer />);
    expect(screen.getByText("AI README will appear after extraction finishes.")).toBeInTheDocument();
  });

  it("builds markdown from structured README data", () => {
    render(<AiReadmeViewer readme={{
      title: "Docs",
      summary: "Summary text",
      stack: ["React", "Vite"],
      runCommand: "npm run dev",
      setup: ["npm install"],
      notableFiles: [{ path: "src/App.tsx", note: "Main app" }],
      risks: ["Needs API"],
    }} />);

    expect(screen.getAllByRole("heading", { name: "Docs" })).toHaveLength(2);
    expect(screen.getByText("Summary text")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
  });

  it("copies rendered markdown", async () => {
    render(<AiReadmeViewer readme={{ raw: "# Raw docs" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("# Raw docs");
    expect(toast.success).toHaveBeenCalledWith("AI README copied");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
  });

  it("shows copy failures", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    render(<AiReadmeViewer readme={{ raw: "# Raw docs" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(toast.error).toHaveBeenCalledWith("Unable to copy README");
  });
});

describe("FunctionsViewer", () => {
  it("renders loading, error, and empty states", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<FunctionsViewer isLoading />);

    expect(screen.getByText("Mapping functions")).toBeInTheDocument();
    expect(screen.getByText("Live loading")).toBeInTheDocument();
    rerender(<FunctionsViewer error="Extraction failed" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<FunctionsViewer />);
    expect(screen.getByText("Function documentation will appear after extraction finishes.")).toBeInTheDocument();
  });

  it("renders extraction metrics and function cards", () => {
    render(<FunctionsViewer extraction={makeExtraction()} repoName="frontend" />);

    expect(screen.getByText("frontend functions")).toBeInTheDocument();
    expect(screen.getByText("A DevHub frontend")).toBeInTheDocument();
    expect(screen.getByText("loadRepo")).toBeInTheDocument();
    expect(screen.getByText("RepoService")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("filters function cards by search text", async () => {
    render(<FunctionsViewer extraction={makeExtraction()} repoName="frontend" />);

    await userEvent.type(screen.getByPlaceholderText("Search functions, files, params"), "RepoService");

    expect(screen.getByText("RepoService")).toBeInTheDocument();
    expect(screen.queryByText("loadRepo")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("Search functions, files, params"));
    await userEvent.type(screen.getByPlaceholderText("Search functions, files, params"), "no match");
    expect(screen.getByText("No functions match your search.")).toBeInTheDocument();
  });

  it("handles empty function lists", () => {
    render(<FunctionsViewer extraction={makeExtraction({ functions: [] })} />);

    expect(screen.getByText("No function docs were returned for this repo yet.")).toBeInTheDocument();
  });
});

describe("SecurityOverview", () => {
  it("renders structured runnability blocker details", () => {
    const runnability = makeRunnability({
      canRun: false,
      entryPoint: null,
      blockers: [],
      blockerDetails: [
        {
          code: "missing-script",
          severity: "medium",
          title: "No start script",
          description: "DevHub could not find a dev, start, or serve npm script.",
          recommendation: "Add a package.json script that starts the web server.",
          evidence: "scripts.test only",
        },
      ],
    });

    render(<SecurityOverview extraction={makeExtraction({ runnability })} runnability={runnability} />);

    expect(screen.getByText("This repository cannot be started automatically")).toBeInTheDocument();
    expect(screen.getByText("DevHub analyzed the project files but could not find a safe automatic startup path.")).toBeInTheDocument();
    expect(screen.getByText("No start script")).toBeInTheDocument();
    expect(screen.getByText("Add a package.json script that starts the web server.")).toBeInTheDocument();
    expect(screen.getByText("scripts.test only")).toBeInTheDocument();
  });

  it("renders legacy runnability blockers when details are absent", () => {
    const runnability = makeRunnability({
      canRun: false,
      entryPoint: null,
      blockers: ["No readable package.json found at repo root"],
    });

    render(<SecurityOverview extraction={makeExtraction({ runnability })} runnability={runnability} />);

    expect(screen.getByText("Cannot start automatically")).toBeInTheDocument();
    expect(screen.getByText("No readable package.json found at repo root")).toBeInTheDocument();
  });

  it("groups security findings and dependency risks", () => {
    render(<SecurityOverview extraction={makeExtraction({
      security: makeSecurityScan({
        riskLevel: "high",
        summary: "Install scripts attempt credential access.",
        findings: [
          {
            title: "Credential file probe",
            severity: "high",
            category: "secret",
            file: "postinstall.js",
            line: 12,
            evidence: "fs.readFileSync('~/.ssh/id_rsa')",
            impact: "Could steal SSH keys outside a sandbox.",
            recommendation: "Do not run outside BrowserPod.",
            confidence: "high",
          },
        ],
        dependencyRisks: [
          {
            packageName: "flatmap-stream",
            version: "0.1.1",
            severity: "high",
            risk: "Known compromised package lineage",
            reason: "Associated with supply-chain credential theft.",
            recommendation: "Remove the dependency.",
            confidence: "medium",
          },
        ],
      }),
    })} />);

    expect(screen.getByText("High / secret")).toBeInTheDocument();
    expect(screen.getByText("Credential file probe")).toBeInTheDocument();
    expect(screen.getByText("Dependency Review")).toBeInTheDocument();
    expect(screen.getByText("flatmap-stream")).toBeInTheDocument();
  });

  it("shows BrowserPod runtime safety alerts", () => {
    render(<SecurityOverview
      extraction={makeExtraction()}
      runtimeEvents={[
        {
          id: "evt-1",
          code: "startup-timeout",
          source: "browserpod",
          phase: "start",
          category: "resource",
          severity: "medium",
          title: "Sandbox startup timed out",
          description: "The sandbox was stopped because the project did not finish starting. This can happen with broken projects, infinite loops, or resource-heavy code.",
          evidence: "No BrowserPod portal opened within 30 seconds.",
          createdAt: "2026-05-03T00:00:00.000Z",
        },
      ]}
    />);

    expect(screen.getByText("BrowserPod runtime alerts")).toBeInTheDocument();
    expect(screen.getByText("Sandbox startup timed out")).toBeInTheDocument();
    expect(screen.getByText("No BrowserPod portal opened within 30 seconds.")).toBeInTheDocument();
  });
});
