import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserPod } from "@leaningtech/browserpod";

import {
  BLACKLISTED_DEPENDENCIES,
  createInitialPodSnapshot,
  PodLifecycleManager,
  SUPPORTED_EXTENSIONS,
} from "@/lib/browserpod";
import { makeFileTree } from "@/test/factories";
import type { FileTreeNode, PodSnapshot } from "@/types";

vi.mock("@leaningtech/browserpod", () => ({
  BrowserPod: {
    boot: vi.fn(),
  },
}));

function makePod() {
  let portalHandler: ((event: { url: string }) => void) | undefined;
  const pod = {
    createDefaultTerminal: vi.fn().mockResolvedValue({}),
    onPortal: vi.fn((handler: (event: { url: string }) => void) => {
      portalHandler = handler;
    }),
    run: vi.fn().mockResolvedValue({}),
    createFile: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(0),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };

  return { pod, emitPortal: (url: string) => portalHandler?.({ url }) };
}

function makeManager(overrides: Partial<{ apiKey: string; onSnapshot: (snapshot: PodSnapshot) => void }> = {}) {
  const snapshots: PodSnapshot[] = [];
  const manager = new PodLifecycleManager({
    repoId: "repo-1",
    apiKey: overrides.apiKey ?? "bp-key",
    onSnapshot: overrides.onSnapshot ?? ((snapshot) => snapshots.push(snapshot)),
  });

  return { manager, snapshots };
}

beforeEach(() => {
  vi.mocked(BrowserPod.boot).mockReset();
});

describe("BrowserPod constants and snapshots", () => {
  it("creates idle snapshots with terminal history", () => {
    expect(createInitialPodSnapshot("repo-1")).toEqual({
      repoId: "repo-1",
      state: "idle",
      terminal: [],
    });
  });

  it("exports supported files and blocked native dependencies", () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(expect.arrayContaining([".tsx", ".json", ".md", ".env"]));
    expect(BLACKLISTED_DEPENDENCIES).toEqual(expect.arrayContaining(["sharp", "node-gyp", "sqlite3"]));
  });
});

describe("PodLifecycleManager boot", () => {
  it("boots BrowserPod with storage and terminal setup", async () => {
    const { pod, emitPortal } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager, snapshots } = makeManager();
    const host = document.createElement("div");

    await expect(manager.boot(host)).resolves.toBe(pod);
    emitPortal("https://portal.example");

    expect(BrowserPod.boot).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "bp-key",
      nodeVersion: "22",
      storageKey: "devhub-repo-1",
    }));
    expect(pod.createDefaultTerminal).toHaveBeenCalledWith(host);
    expect(snapshots.map((snapshot) => snapshot.state)).toEqual(expect.arrayContaining(["booting", "ready"]));
    expect(snapshots.at(-1)).toMatchObject({ portalUrl: "https://portal.example" });
  });

  it("rejects missing BrowserPod keys before booting", async () => {
    const { manager } = makeManager({ apiKey: "" });

    await expect(manager.boot(document.createElement("div"))).rejects.toThrow("Set VITE_BP_APIKEY");
    expect(BrowserPod.boot).not.toHaveBeenCalled();
  });
});

describe("PodLifecycleManager runnability", () => {
  it("detects runnable package scripts", async () => {
    const { manager, snapshots } = makeManager();
    vi.spyOn(manager, "readRepoFile").mockResolvedValue(JSON.stringify({
      scripts: { dev: "vite" },
      dependencies: { react: "^18.3.1" },
      engines: { node: ">=20" },
    }));

    await expect(manager.checkRunnability()).resolves.toEqual({
      canRun: true,
      entryPoint: "dev",
      blockers: [],
    });
    expect(snapshots.at(-1)?.runnability?.canRun).toBe(true);
  });

  it("reports missing scripts, blocked dependencies, and incompatible engines", async () => {
    const { manager } = makeManager();
    vi.spyOn(manager, "readRepoFile").mockResolvedValue(JSON.stringify({
      scripts: { test: "vitest" },
      dependencies: { sharp: "latest" },
      engines: { node: "<18" },
    }));

    const result = await manager.checkRunnability();

    expect(result.canRun).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("No runnable npm script"),
      expect.stringContaining("sharp"),
      expect.stringContaining("does not allow BrowserPod Node 22"),
    ]));
  });

  it("handles unreadable package.json", async () => {
    const { manager } = makeManager();
    vi.spyOn(manager, "readRepoFile").mockRejectedValue(new Error("missing"));

    await expect(manager.checkRunnability()).resolves.toEqual({
      canRun: false,
      blockers: ["No readable package.json found at repo root"],
    });
  });
});

describe("PodLifecycleManager AI payload collection", () => {
  it("hydrates supported files under the byte limit", async () => {
    const { manager } = makeManager();
    const tree: FileTreeNode = {
      ...makeFileTree(),
      children: [
        ...(makeFileTree().children ?? []),
        { name: "large.ts", path: "large.ts", type: "file", supported: true, extension: ".ts", size: 300_000 },
        { name: "image.png", path: "image.png", type: "file", supported: false, extension: ".png", size: 20 },
      ],
    };
    vi.spyOn(manager, "readRepoFile").mockImplementation(async (path) => `content:${path}`);

    const payload = await manager.collectAiExtractionPayload(tree);

    expect(payload.fileTree).toBe(tree);
    expect(payload.files).toEqual(expect.arrayContaining([
      { path: "README.md", content: "content:README.md" },
      { path: "package.json", content: "content:package.json" },
    ]));
    expect(payload.files).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "large.ts" }),
      expect.objectContaining({ path: "image.png" }),
    ]));
  });
});
