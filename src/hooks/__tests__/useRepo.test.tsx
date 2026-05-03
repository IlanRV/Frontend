import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRepo } from "@/hooks/useRepo";
import { api } from "@/lib/api";
import { saveCachedExtraction } from "@/lib/extractionCache";
import { makeExtraction, makeRepo } from "@/test/factories";

vi.mock("@/lib/api", () => ({
  api: {
    repos: {
      get: vi.fn(),
      run: vi.fn(),
      stop: vi.fn(),
    },
    ai: {
      getExtraction: vi.fn(),
    },
  },
}));

const reposApi = vi.mocked(api.repos);
const aiApi = vi.mocked(api.ai);

describe("useRepo", () => {
  it("hydrates cached extraction before network refresh", async () => {
    const cached = makeExtraction({ aiReadme: "# Cached" });
    saveCachedExtraction("repo-1", cached);
    reposApi.get.mockResolvedValueOnce(makeRepo({ aiReadme: null, analysis: null }));

    const { result } = renderHook(() => useRepo("repo-1"));

    expect(result.current.aiReadme).toEqual({ title: "AI README", raw: "# Cached" });
    await waitFor(() => expect(result.current.repo?.id).toBe("repo-1"));
  });

  it("loads repo analysis from repo payload and caches it", async () => {
    const extraction = makeExtraction();
    reposApi.get.mockResolvedValueOnce(makeRepo({
      analysis: extraction.techStack && extraction.overview && extraction.security
        ? {
            techStack: extraction.techStack,
            overview: extraction.overview,
            functions: extraction.functions,
            dependencies: extraction.dependencies,
            security: extraction.security,
          }
        : null,
      aiReadme: "# Fresh",
    }));

    const { result } = renderHook(() => useRepo("repo-1"));

    await waitFor(() => expect(result.current.extraction?.aiReadme).toBe("# Fresh"));
    expect(result.current.aiReadme).toEqual({ title: "AI README", raw: "# Fresh" });
  });

  it("sets repo load errors", async () => {
    reposApi.get.mockRejectedValueOnce(new Error("repo missing"));

    const { result } = renderHook(() => useRepo("repo-1"));

    await waitFor(() => expect(result.current.error).toBe("repo missing"));
    expect(result.current.repo).toBeUndefined();
  });

  it("loads AI extraction on demand", async () => {
    reposApi.get.mockResolvedValueOnce(makeRepo());
    aiApi.getExtraction.mockResolvedValueOnce(makeExtraction({ aiReadme: "# On demand" }));
    const { result } = renderHook(() => useRepo("repo-1"));

    await waitFor(() => expect(result.current.repo).toBeDefined());
    await act(async () => {
      await result.current.loadExtraction();
    });

    expect(result.current.extraction?.aiReadme).toBe("# On demand");
    expect(result.current.aiError).toBeUndefined();
  });

  it("sets AI extraction errors", async () => {
    reposApi.get.mockResolvedValueOnce(makeRepo());
    aiApi.getExtraction.mockRejectedValueOnce(new Error("ai down"));
    const { result } = renderHook(() => useRepo("repo-1"));

    await waitFor(() => expect(result.current.repo).toBeDefined());
    await act(async () => {
      await result.current.loadAiReadme();
    });

    expect(result.current.aiError).toBe("ai down");
  });

  it("registers run and stop state", async () => {
    reposApi.get.mockResolvedValueOnce(makeRepo());
    reposApi.run.mockResolvedValueOnce(makeRepo({ status: "running" }));
    reposApi.stop.mockResolvedValueOnce(makeRepo({ status: "ready" }));
    const { result } = renderHook(() => useRepo("repo-1"));

    await waitFor(() => expect(result.current.repo).toBeDefined());
    await act(async () => {
      await result.current.registerRun("https://portal.example");
    });
    expect(result.current.repo?.status).toBe("running");

    await act(async () => {
      await result.current.registerStop();
    });
    expect(result.current.repo?.status).toBe("ready");
  });

  it("handles missing repo ids", async () => {
    const { result } = renderHook(() => useRepo(undefined));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("Missing repo id");
    await expect(result.current.registerRun("portal")).rejects.toThrow("Missing repo id");
    await expect(result.current.registerStop()).rejects.toThrow("Missing repo id");
  });
});
