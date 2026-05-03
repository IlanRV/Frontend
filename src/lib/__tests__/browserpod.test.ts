import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserPod } from "@leaningtech/browserpod";

import {
  BLACKLISTED_DEPENDENCIES,
  createInitialPodSnapshot,
  isSupportedFile,
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
    createDefaultTerminal: vi.fn().mockImplementation(async () => ({
      xterm: {
        write: vi.fn((_chunk: string | Uint8Array, callback?: () => void) => callback?.()),
      },
    })),
    onPortal: vi.fn((handler: (event: { url: string }) => void) => {
      portalHandler = handler;
    }),
    run: vi.fn().mockResolvedValue({}),
    openFile: vi.fn(),
    createFile: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(0),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };

  return { pod, emitPortal: (url: string) => portalHandler?.({ url }) };
}

function encodeUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function markerFromScript(script: string) {
  const match = script.match(/__DEVHUB_BEGIN_(.*?)__/);

  if (!match) {
    throw new Error("Script did not include a DevHub marker");
  }

  return match[1];
}

function markedOutput(markerId: string, payload: string) {
  return [
    `__DEVHUB_BEGIN_${markerId}__`,
    encodeUtf8(payload),
    `__DEVHUB_END_${markerId}__`,
  ].join("\n");
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
    expect(isSupportedFile("src/App.tsx")).toBe(true);
    expect(isSupportedFile(".env")).toBe(true);
    expect(isSupportedFile("nested/.gitignore")).toBe(true);
    expect(isSupportedFile("assets/logo.png")).toBe(false);
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

  it("reattaches terminals without booting a second pod", async () => {
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager } = makeManager();
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");

    await manager.boot(firstHost);
    await manager.boot(secondHost);

    expect(BrowserPod.boot).toHaveBeenCalledOnce();
    expect(pod.createDefaultTerminal).toHaveBeenCalledWith(firstHost);
    expect(pod.createDefaultTerminal).toHaveBeenCalledWith(secondHost);
  });

  it("rejects missing BrowserPod keys before booting", async () => {
    const { manager } = makeManager({ apiKey: "" });

    await expect(manager.boot(document.createElement("div"))).rejects.toThrow("Set VITE_BP_APIKEY");
    expect(BrowserPod.boot).not.toHaveBeenCalled();
  });

  it("stores readable boot failures in the snapshot", async () => {
    vi.mocked(BrowserPod.boot).mockRejectedValue(new Error("websocket refused"));
    const { manager, snapshots } = makeManager();

    await expect(manager.boot(document.createElement("div"))).rejects.toThrow("BrowserPod could not connect");

    expect(snapshots.at(-1)).toMatchObject({
      state: "error",
      error: expect.stringContaining("BrowserPod could not connect"),
    });
  });
});

describe("PodLifecycleManager file IO", () => {
  it("reads BrowserPod text files in chunks", async () => {
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager } = makeManager();
    const file = {
      getSize: vi.fn().mockResolvedValue(64_005),
      read: vi.fn().mockResolvedValueOnce("hello").mockResolvedValueOnce(" dev"),
      write: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    pod.openFile.mockResolvedValue(file);

    await manager.boot(document.createElement("div"));

    await expect(manager.readTextFile("/home/user/repo/README.md")).resolves.toBe("hello dev");
    expect(file.read).toHaveBeenNthCalledWith(1, 64_000);
    expect(file.read).toHaveBeenNthCalledWith(2, 5);
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("rejects non-text BrowserPod files", async () => {
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager } = makeManager();
    const binaryFile = { close: vi.fn().mockResolvedValue(undefined) };
    pod.openFile.mockResolvedValue(binaryFile);

    await manager.boot(document.createElement("div"));

    await expect(manager.readTextFile("/home/user/repo/logo.png")).rejects.toThrow("not a UTF-8 text file");
    expect(binaryFile.close).toHaveBeenCalledOnce();
  });

  it("reads runtime-created repo files through marked command output", async () => {
    const { pod } = makePod();
    const scripts = new Map<string, string>();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    pod.createFile.mockImplementation(async (path: string) => ({
      write: vi.fn(async (content: string) => {
        scripts.set(path, content);
        return content.length;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }));
    pod.run.mockImplementation(async (command: string, args: string[], options?: { terminal?: { xterm?: { write: (chunk: string) => void } } }) => {
      if (command === "node") {
        const script = scripts.get(args[0]) ?? "";
        const marker = markerFromScript(script);
        options?.terminal?.xterm?.write(markedOutput(marker, "# Hello"));
      }
      return {};
    });
    const { manager } = makeManager();

    await manager.boot(document.createElement("div"));

    await expect(manager.readRepoFile("README.md")).resolves.toBe("# Hello");
    expect([...scripts.values()].at(0)).toContain("/home/user/repo/README.md");
  });
});

describe("PodLifecycleManager repo preparation", () => {
  it("clones once and reuses cached tree and runnability for the same repo", async () => {
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager } = makeManager();
    const tree = makeFileTree();
    const runnability = { canRun: true, entryPoint: "dev", blockers: [] };
    vi.spyOn(manager, "refreshFileTree").mockResolvedValue(tree);
    vi.spyOn(manager, "checkRunnability").mockResolvedValue(runnability);

    await manager.boot(document.createElement("div"));

    await expect(manager.cloneRepo("https://github.com/acme/frontend")).resolves.toEqual({ fileTree: tree, runnability });
    const runCount = pod.run.mock.calls.length;
    await expect(manager.cloneRepo("https://github.com/acme/frontend")).resolves.toEqual({ fileTree: tree, runnability });

    expect(pod.run).toHaveBeenCalledWith("rm", ["-rf", "/home/user/repo"], expect.objectContaining({ echo: false }));
    expect(pod.run).toHaveBeenCalledWith("git", ["clone", "--depth", "1", "https://github.com/acme/frontend", "/home/user/repo"], expect.any(Object));
    expect(pod.run).toHaveBeenCalledTimes(runCount);
  });

  it("falls back to the git index when the filesystem tree is empty", async () => {
    const { pod } = makePod();
    const scripts = new Map<string, string>();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    pod.createFile.mockImplementation(async (path: string) => ({
      write: vi.fn(async (content: string) => {
        scripts.set(path, content);
        return content.length;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }));
    pod.run.mockImplementation(async (command: string, args: string[], options?: { terminal?: { xterm?: { write: (chunk: string) => void } } }) => {
      if (command === "node") {
        const script = scripts.get(args[0]) ?? "";
        const marker = markerFromScript(script);
        const payload = script.includes("execFileSync")
          ? JSON.stringify(makeFileTree())
          : JSON.stringify({ name: "repo", path: "", type: "directory", children: [] });
        options?.terminal?.xterm?.write(markedOutput(marker, payload));
      }
      return {};
    });
    const { manager, snapshots } = makeManager();

    await manager.boot(document.createElement("div"));

    await expect(manager.refreshFileTree()).resolves.toMatchObject({ children: expect.any(Array) });
    expect(snapshots.some((snapshot) => snapshot.terminal.some((line) => line.text.includes("git index")))).toBe(true);
    expect(snapshots.at(-1)?.fileTree?.children?.length).toBeGreaterThan(0);
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

  it("detects preview routes while ignoring unreadable route files", async () => {
    const { manager } = makeManager();
    const tree = makeFileTree();
    tree.children?.push({
      name: "server.ts",
      path: "server.ts",
      type: "file",
      extension: ".ts",
      supported: true,
      size: 100,
    });
    manager.getSnapshot().fileTree = tree;
    vi.spyOn(manager, "readRepoFile").mockImplementation(async (path) => {
      if (path === "package.json") {
        return JSON.stringify({ scripts: { start: "node server.ts" }, engines: { node: ">=22" } });
      }
      throw new Error("skip");
    });
    vi.spyOn(manager, "readRepoFiles").mockResolvedValue([
      {
        path: "server.ts",
        content: 'app.get("/health", handler); router.route("/users/:id"); app.post("/api/items", handler);',
      },
    ]);

    await expect(manager.checkRunnability()).resolves.toMatchObject({
      canRun: true,
      entryPoint: "start",
      previewPath: "/health",
      previewPaths: ["/health", "/api/items"],
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
    vi.spyOn(manager, "readRepoFiles").mockImplementation(async (paths) =>
      paths.map((path) => ({ path, content: `content:${path}` })),
    );

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

describe("PodLifecycleManager project lifecycle", () => {
  it("runs npm projects, stops them, and resets to ready", async () => {
    const kill = vi.fn().mockResolvedValue(undefined);
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    pod.run.mockImplementation(async (command: string, args: string[]) => {
      if (command === "npm" && args[0] === "run") {
        return { kill };
      }
      return {};
    });
    const { manager, snapshots } = makeManager();

    await manager.boot(document.createElement("div"));
    await manager.runProject("dev");
    await Promise.resolve();
    await Promise.resolve();

    expect(pod.run).toHaveBeenCalledWith("npm", ["install", "--ignore-scripts"], expect.objectContaining({ cwd: "/home/user/repo" }));
    expect(pod.run).toHaveBeenCalledWith("npm", ["run", "dev"], expect.objectContaining({ cwd: "/home/user/repo" }));

    await manager.stopProject();

    expect(kill).toHaveBeenCalledOnce();
    expect(pod.run).toHaveBeenCalledWith("pkill", ["-f", "npm run"], expect.objectContaining({ cwd: "/home/user/repo" }));
    expect(snapshots.map((snapshot) => snapshot.state)).toEqual(expect.arrayContaining(["installing", "running", "stopping", "ready"]));
  });

  it("runs backend-provided command strings through the sandbox shell", async () => {
    const kill = vi.fn().mockResolvedValue(undefined);
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    pod.run.mockImplementation(async (command: string, args: string[]) => {
      if (command === "sh" && args[0] === "-lc") {
        return { kill };
      }
      return {};
    });
    const { manager } = makeManager();

    await manager.boot(document.createElement("div"));
    await manager.runProject("npm run dev", { previewExpected: true });

    expect(pod.run).toHaveBeenCalledWith("sh", ["-lc", "npm run dev"], expect.objectContaining({ cwd: "/home/user/repo" }));
  });

  it("runs non-preview manual commands without waiting for a portal", async () => {
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager, snapshots } = makeManager();

    await manager.boot(document.createElement("div"));
    await manager.runProject("npm test", { previewExpected: false });

    expect(pod.run).toHaveBeenCalledWith("sh", ["-lc", "npm test"], expect.objectContaining({ cwd: "/home/user/repo" }));
    expect(snapshots.at(-1)?.state).toBe("ready");
    expect(snapshots.at(-1)?.securityEvents).toBeUndefined();
  });

  it("records a clear startup timeout event when no portal opens", async () => {
    vi.useFakeTimers();
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager, snapshots } = makeManager();

    await manager.boot(document.createElement("div"));
    const run = manager.runProject("dev");
    await Promise.resolve();
    const startupTimeout = expect(run).rejects.toThrow("The sandbox was stopped because the project did not finish starting");
    await vi.advanceTimersByTimeAsync(30_000);

    await startupTimeout;
    expect(snapshots.at(-1)?.securityEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "startup-timeout",
        source: "browserpod",
        phase: "start",
        category: "resource",
        severity: "high",
        title: "Dev server did not become ready",
        command: "npm run dev",
      }),
    ]));
  });

  it("records process kill failures as sandbox security events", async () => {
    const kill = vi.fn().mockRejectedValue(new Error("kill refused"));
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    pod.run.mockImplementation(async (command: string, args: string[]) => {
      if (command === "npm" && args[0] === "run") {
        return { kill };
      }
      return {};
    });
    const { manager, snapshots } = makeManager();

    await manager.boot(document.createElement("div"));
    await manager.runProject("dev");
    await manager.stopProject();

    expect(snapshots.at(-1)?.securityEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "browserpod",
        phase: "stop",
        category: "process",
        severity: "high",
        title: "Sandbox process did not stop cleanly",
        evidence: "kill refused",
      }),
    ]));
  });

  it("terminates BrowserPod and clears runtime state", async () => {
    const { pod } = makePod();
    vi.mocked(BrowserPod.boot).mockResolvedValue(pod as never);
    const { manager, snapshots } = makeManager();

    await manager.boot(document.createElement("div"));
    await manager.terminate();

    expect(pod.terminate).toHaveBeenCalledOnce();
    expect(manager.getSnapshot()).toMatchObject({ state: "idle", portalUrl: undefined });
    expect(snapshots.at(-1)?.state).toBe("idle");
  });
});
