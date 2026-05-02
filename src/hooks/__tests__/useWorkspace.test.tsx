import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspace, useWorkspaces, WORKSPACE_LIMIT } from "@/hooks/useWorkspace";
import { api } from "@/lib/api";
import { makeRepo, makeWorkspace } from "@/test/factories";

vi.mock("@/lib/api", () => ({
  api: {
    workspaces: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    repos: {
      add: vi.fn(),
    },
  },
}));

const workspacesApi = vi.mocked(api.workspaces);
const reposApi = vi.mocked(api.repos);

describe("useWorkspaces", () => {
  beforeEach(() => {
    workspacesApi.list.mockResolvedValue([makeWorkspace()]);
  });

  it("loads workspaces on mount", async () => {
    const { result } = renderHook(() => useWorkspaces());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
    expect(result.current.error).toBeUndefined();
  });

  it("sets an error when listing fails", async () => {
    workspacesApi.list.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(result.current.workspaces).toEqual([]);
  });

  it("creates and deletes workspaces in local state", async () => {
    const existing = makeWorkspace({ id: "workspace-1", workspaceId: "workspace-1" });
    const created = makeWorkspace({ id: "workspace-2", workspaceId: "workspace-2", name: "New" });
    workspacesApi.list.mockResolvedValueOnce([existing]);
    workspacesApi.create.mockResolvedValueOnce(created);
    workspacesApi.delete.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
    await act(async () => {
      await result.current.createWorkspace({ name: "New", description: "" });
    });
    expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(["workspace-2", "workspace-1"]);

    await act(async () => {
      await result.current.deleteWorkspace("workspace-1");
    });
    expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(["workspace-2"]);
  });

  it("exports the workspace cap", () => {
    expect(WORKSPACE_LIMIT).toBe(3);
  });
});

describe("useWorkspace", () => {
  it("reports a missing workspace id", async () => {
    const { result } = renderHook(() => useWorkspace(undefined));

    await waitFor(() => expect(result.current.error).toBe("Missing workspace id"));
    expect(workspacesApi.get).not.toHaveBeenCalled();
  });

  it("loads one workspace and exposes repos", async () => {
    workspacesApi.get.mockResolvedValueOnce(makeWorkspace({ repos: [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2" })] }));

    const { result } = renderHook(() => useWorkspace("workspace-1"));

    await waitFor(() => expect(result.current.repos).toHaveLength(2));
    expect(result.current.workspace?.id).toBe("workspace-1");
  });

  it("adds and updates repos", async () => {
    const repo = makeRepo({ id: "repo-1", repoId: "repo-1", status: "ready" });
    const nextRepo = makeRepo({ id: "repo-2", repoId: "repo-2", name: "api" });
    workspacesApi.get.mockResolvedValueOnce(makeWorkspace({ repos: [repo] }));
    reposApi.add.mockResolvedValueOnce(nextRepo);
    const { result } = renderHook(() => useWorkspace("workspace-1"));

    await waitFor(() => expect(result.current.workspace).toBeDefined());
    await act(async () => {
      await result.current.addRepo("https://github.com/acme/api");
    });
    expect(result.current.repos.map((item) => item.id)).toEqual(["repo-2", "repo-1"]);

    act(() => {
      result.current.updateRepo({ ...nextRepo, status: "running" });
    });
    expect(result.current.repos.find((item) => item.id === "repo-2")?.status).toBe("running");
  });

  it("polls while repos are active", async () => {
    vi.useFakeTimers();
    workspacesApi.get
      .mockResolvedValueOnce(makeWorkspace({ repos: [makeRepo({ status: "analyzing" })] }))
      .mockResolvedValueOnce(makeWorkspace({ repos: [makeRepo({ status: "ready" })] }));
    const { result } = renderHook(() => useWorkspace("workspace-1"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.repos[0]?.status).toBe("analyzing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.repos[0]?.status).toBe("ready");
    expect(workspacesApi.get).toHaveBeenCalledTimes(2);
  });
});
