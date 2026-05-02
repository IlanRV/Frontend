import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { AiReadmeViewer } from "@/components/ai/AiReadmeViewer";
import { FunctionsViewer } from "@/components/ai/FunctionsViewer";
import { makeExtraction } from "@/test/factories";

describe("AiReadmeViewer", () => {
  it("renders loading, error, and empty states", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<AiReadmeViewer isLoading />);

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
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

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
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
