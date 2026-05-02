import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePod } from "@/hooks/usePod";
import { makeFileTree } from "@/test/factories";
import type { PodSnapshot } from "@/types";

const podMock = vi.hoisted(() => ({
  instances: [] as Array<{
    options: { repoId: string; apiKey: string; onSnapshot: (snapshot: PodSnapshot) => void };
    boot: ReturnType<typeof vi.fn>;
    cloneRepo: ReturnType<typeof vi.fn>;
    readRepoFile: ReturnType<typeof vi.fn>;
    refreshFileTree: ReturnType<typeof vi.fn>;
    checkRunnability: ReturnType<typeof vi.fn>;
    collectAiExtractionPayload: ReturnType<typeof vi.fn>;
    runProject: ReturnType<typeof vi.fn>;
    stopProject: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@/lib/browserpod", () => {
  function createInitialPodSnapshot(repoId: string): PodSnapshot {
    return { repoId, state: "idle", terminal: [] };
  }

  function fileTree() {
    return {
      name: "repo",
      path: "",
      type: "directory" as const,
      children: [{ name: "README.md", path: "README.md", type: "file" as const, supported: true }],
    };
  }

  function runnability() {
    return { canRun: true, entryPoint: "dev", blockers: [] };
  }

  class PodLifecycleManager {
    options: { repoId: string; apiKey: string; onSnapshot: (snapshot: PodSnapshot) => void };
    boot = vi.fn().mockResolvedValue({});
    cloneRepo = vi.fn().mockResolvedValue({ fileTree: fileTree(), runnability: runnability() });
    readRepoFile = vi.fn().mockResolvedValue("file content");
    refreshFileTree = vi.fn().mockResolvedValue(fileTree());
    checkRunnability = vi.fn().mockResolvedValue(runnability());
    collectAiExtractionPayload = vi.fn().mockResolvedValue({ fileTree: fileTree(), files: [] });
    runProject = vi.fn().mockResolvedValue(undefined);
    stopProject = vi.fn().mockResolvedValue(undefined);
    terminate = vi.fn().mockResolvedValue(undefined);

    constructor(options: { repoId: string; apiKey: string; onSnapshot: (snapshot: PodSnapshot) => void }) {
      this.options = options;
      podMock.instances.push(this);
    }
  }

  return { createInitialPodSnapshot, PodLifecycleManager };
});

beforeEach(() => {
  podMock.instances.length = 0;
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000099");
});

describe("usePod", () => {
  it("throws when booting before the terminal host is mounted", async () => {
    const { result } = renderHook(() => usePod("repo-no-host"));

    await expect(result.current.boot()).rejects.toThrow("Terminal host is not mounted yet");
  });

  it("boots and clones repos through the lifecycle manager", async () => {
    const { result } = renderHook(() => usePod("repo-bootstrap"));
    const host = document.createElement("div");
    result.current.terminalRef.current = host;

    await act(async () => {
      await result.current.bootstrapRepo("https://github.com/acme/repo");
    });

    const manager = podMock.instances[0];
    expect(manager.boot).toHaveBeenCalledWith(host);
    expect(manager.cloneRepo).toHaveBeenCalledWith("https://github.com/acme/repo");
  });

  it("exposes manager actions", async () => {
    const { result } = renderHook(() => usePod("repo-actions"));

    await act(async () => {
      await result.current.readFile("README.md");
      await result.current.refreshFileTree();
      await result.current.checkRunnability();
      await result.current.collectAiExtractionPayload(makeFileTree());
      await result.current.runProject("dev");
      await result.current.stopProject();
    });

    const manager = podMock.instances[0];
    expect(manager.readRepoFile).toHaveBeenCalledWith("README.md");
    expect(manager.refreshFileTree).toHaveBeenCalledOnce();
    expect(manager.checkRunnability).toHaveBeenCalledOnce();
    expect(manager.collectAiExtractionPayload).toHaveBeenCalledWith(makeFileTree());
    expect(manager.runProject).toHaveBeenCalledWith("dev");
    expect(manager.stopProject).toHaveBeenCalledOnce();
  });

  it("subscribes to snapshot updates", async () => {
    const { result } = renderHook(() => usePod("repo-subscribe"));
    const nextSnapshot: PodSnapshot = {
      repoId: "repo-subscribe",
      state: "ready",
      terminal: [],
      fileTree: makeFileTree(),
    };

    act(() => {
      podMock.instances[0].options.onSnapshot(nextSnapshot);
    });

    await waitFor(() => expect(result.current.snapshot.state).toBe("ready"));
    expect(result.current.snapshot.fileTree).toEqual(makeFileTree());
  });

  it("schedules idle pod termination after the last subscriber unmounts", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => usePod("repo-idle-cleanup"));
    const manager = podMock.instances[0];

    unmount();
    expect(manager.terminate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(manager.terminate).toHaveBeenCalledOnce();
  });

  it("keeps running pods warm after unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => usePod("repo-running-cleanup"));
    const manager = podMock.instances[0];

    act(() => {
      manager.options.onSnapshot({ repoId: "repo-running-cleanup", state: "running", terminal: [] });
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(manager.terminate).not.toHaveBeenCalled();
  });

  it("uses a generated fallback repo id", () => {
    renderHook(() => usePod(undefined));

    expect(podMock.instances[0].options.repoId).toBe("temp-00000000-0000-4000-8000-000000000099");
  });

  it("terminates explicit pods immediately", async () => {
    const { result } = renderHook(() => usePod("repo-explicit-terminate"));
    const manager = podMock.instances[0];

    await act(async () => {
      await result.current.terminate();
    });

    expect(manager.terminate).toHaveBeenCalledOnce();
  });
});
