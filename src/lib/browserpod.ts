import {
  BrowserPod,
  type BinaryFile,
  type Process,
  type Terminal,
  type TextFile,
} from "@leaningtech/browserpod";
import { satisfies as semverSatisfies, validRange } from "semver";

import type {
  ExtractAiPayload,
  FileTreeNode,
  PodSnapshot,
  RunnabilityResult,
  SupportedExtension,
  TerminalLine,
} from "@/types";

const SUPPORTED_EXTENSIONS = [
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".css",
  ".html",
  ".py",
  ".yml",
  ".yaml",
  ".env",
  ".gitignore",
] satisfies SupportedExtension[];

const BLACKLISTED_DEPENDENCIES = [
  "esbuild",
  "sharp",
  "bcrypt",
  "node-gyp",
  "puppeteer",
  "canvas",
  "sqlite3",
  "better-sqlite3",
  "electron",
  "node-sass",
  "@swc/core",
  "fibers",
  "rollup",
];

const IGNORED_DIRECTORIES = [
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
];

const MAX_AI_FILES = 100;
const MAX_AI_FILE_BYTES = 250_000;
const REPO_ROOT = "/home/user/repo";
const FILE_TREE_RETRY_DELAYS_MS = [0, 350, 800, 1400];

interface PodLifecycleManagerOptions {
  repoId: string;
  apiKey: string;
  onSnapshot: (snapshot: PodSnapshot) => void;
}

interface PodRunOptions {
  cwd?: string;
  echo?: boolean;
}

interface XtermLike {
  write(data: string | Uint8Array, callback?: () => void): void;
}

type InternalTerminal = Terminal & {
  xterm?: XtermLike;
};

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
}

type RunScriptName = NonNullable<RunnabilityResult["entryPoint"]>;

type TextWritableFile = {
  write(data: string): Promise<number>;
  close(): Promise<void>;
};

type KillableProcess = Process & {
  kill?: () => Promise<void> | void;
  terminate?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
};

type TerminablePod = BrowserPod & {
  terminate?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
};

type BrowserPodBootOptions = Parameters<typeof BrowserPod.boot>[0] & {
  storageKey?: string;
};

export function createInitialPodSnapshot(repoId: string): PodSnapshot {
  return {
    repoId,
    state: "idle",
    terminal: [],
  };
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function browserPodStorageKey(repoId: string) {
  return `devhub-${repoId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function readableBrowserPodBootError(error: unknown) {
  const message = error instanceof Error ? error.message : "BrowserPod failed to boot";

  if (/websocket|api key/i.test(message)) {
    return "BrowserPod could not connect. Open DevHub at http://localhost:5173, verify VITE_BP_APIKEY is a valid BrowserPod key, then restart the frontend dev server.";
  }

  return message;
}

function createTerminalLine(text: string, stream: TerminalLine["stream"]): TerminalLine {
  return {
    id: crypto.randomUUID(),
    text,
    stream,
    createdAt: nowIso(),
  };
}

function isTextFile(file: BinaryFile | TextFile): file is TextFile {
  return "read" in file && "write" in file && "getSize" in file;
}

function toWritableTextFile(file: BinaryFile | TextFile): TextWritableFile {
  return file as TextWritableFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function parsePackageJson(content: string): PackageJson {
  const parsed = JSON.parse(content) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("package.json is not an object");
  }

  const engines = isRecord(parsed.engines)
    ? {
        node: typeof parsed.engines.node === "string" ? parsed.engines.node : undefined,
      }
    : undefined;

  return {
    scripts: stringRecord(parsed.scripts),
    dependencies: stringRecord(parsed.dependencies),
    devDependencies: stringRecord(parsed.devDependencies),
    optionalDependencies: stringRecord(parsed.optionalDependencies),
    peerDependencies: stringRecord(parsed.peerDependencies),
    engines,
  };
}

function extFromPath(path: string) {
  if (path === ".env" || path.endsWith(".env")) {
    return ".env";
  }

  if (path === ".gitignore" || path.endsWith("/.gitignore")) {
    return ".gitignore";
  }

  const lastDot = path.lastIndexOf(".");
  return lastDot === -1 ? "" : path.slice(lastDot);
}

function isSupportedFile(path: string) {
  return SUPPORTED_EXTENSIONS.includes(extFromPath(path) as SupportedExtension);
}

function flattenSupportedFiles(node: FileTreeNode, output: FileTreeNode[] = []) {
  if (node.type === "file" && node.supported) {
    output.push(node);
  }

  for (const child of node.children ?? []) {
    flattenSupportedFiles(child, output);
  }

  return output;
}

function hasTreeEntries(node: FileTreeNode) {
  return (node.children?.length ?? 0) > 0;
}

function normalizeFileTree(value: unknown): FileTreeNode {
  if (!isRecord(value)) {
    throw new Error("Pod returned an invalid file tree");
  }

  const type = value.type === "directory" ? "directory" : "file";
  const name = typeof value.name === "string" ? value.name : "repo";
  const path = typeof value.path === "string" ? value.path : "";
  const extension = typeof value.extension === "string" ? value.extension : undefined;
  const size = typeof value.size === "number" ? value.size : undefined;
  const supported = typeof value.supported === "boolean" ? value.supported : undefined;
  const children = Array.isArray(value.children)
    ? value.children.map((child) => normalizeFileTree(child))
    : undefined;

  return {
    name,
    path,
    type,
    extension,
    size,
    supported,
    children,
  };
}

function buildTreeScript(rootPath: string, markerId: string) {
  return `
const fs = require("fs");
const path = require("path");

const root = ${JSON.stringify(rootPath)};
const beginMarker = "__DEVHUB_BEGIN_${markerId}__";
const endMarker = "__DEVHUB_END_${markerId}__";
const supported = new Set(${JSON.stringify(SUPPORTED_EXTENSIONS)});
const ignored = new Set(${JSON.stringify(IGNORED_DIRECTORIES)});

function emitPayload(value) {
  const base64 = Buffer.from(value, "utf-8").toString("base64");

  console.log(beginMarker);
  for (let index = 0; index < base64.length; index += 16000) {
    console.log(base64.slice(index, index + 16000));
  }
  console.log(endMarker);
}

function extFromPath(filePath) {
  if (filePath === ".env" || filePath.endsWith(".env")) return ".env";
  if (filePath === ".gitignore" || filePath.endsWith("/.gitignore")) return ".gitignore";
  const lastDot = filePath.lastIndexOf(".");
  return lastDot === -1 ? "" : filePath.slice(lastDot);
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function walk(fullPath) {
  const stat = fs.statSync(fullPath);
  const name = path.basename(fullPath);
  const relative = path.relative(root, fullPath).replace(/\\\\/g, "/");

  if (stat.isDirectory()) {
    const entries = sortEntries(fs.readdirSync(fullPath, { withFileTypes: true }))
      .filter((entry) => !ignored.has(entry.name));

    return {
      name: relative ? name : "repo",
      path: relative,
      type: "directory",
      children: entries.map((entry) => walk(path.join(fullPath, entry.name))).filter(Boolean)
    };
  }

  const extension = extFromPath(relative || name);
  return {
    name,
    path: relative,
    type: "file",
    extension,
    size: stat.size,
    supported: supported.has(extension)
  };
}

try {
  console.log("[DevHub tree] cwd=" + process.cwd());
  const tree = walk(root);
  const json = JSON.stringify(tree);
  console.log("[DevHub tree] serialized " + Buffer.byteLength(json, "utf-8") + " bytes");
  emitPayload(json);
} catch (error) {
  console.error("[DevHub tree] failed", error && error.stack ? error.stack : error);
  process.exit(1);
}
`;
}

function buildGitTreeScript(rootPath: string, markerId: string) {
  return `
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = ${JSON.stringify(rootPath)};
const beginMarker = "__DEVHUB_BEGIN_${markerId}__";
const endMarker = "__DEVHUB_END_${markerId}__";
const supported = new Set(${JSON.stringify(SUPPORTED_EXTENSIONS)});

function emitPayload(value) {
  const base64 = Buffer.from(value, "utf-8").toString("base64");

  console.log(beginMarker);
  for (let index = 0; index < base64.length; index += 16000) {
    console.log(base64.slice(index, index + 16000));
  }
  console.log(endMarker);
}

function extFromPath(filePath) {
  if (filePath === ".env" || filePath.endsWith(".env")) return ".env";
  if (filePath === ".gitignore" || filePath.endsWith("/.gitignore")) return ".gitignore";
  const lastDot = filePath.lastIndexOf(".");
  return lastDot === -1 ? "" : filePath.slice(lastDot);
}

function sortChildren(node) {
  if (!node.children) return node;

  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortChildren);
  return node;
}

function ensureDirectory(rootNode, parts) {
  let current = rootNode;

  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index];
    const directoryPath = parts.slice(0, index + 1).join("/");
    let next = current.children.find(
      (child) => child.type === "directory" && child.path === directoryPath
    );

    if (!next) {
      next = {
        name,
        path: directoryPath,
        type: "directory",
        children: []
      };
      current.children.push(next);
    }

    current = next;
  }

  return current;
}

try {
  console.log("[DevHub git tree] cwd=" + process.cwd());
  const rawFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8"
  });
  const files = rawFiles.split("\\0").filter(Boolean);
  const tree = { name: "repo", path: "", type: "directory", children: [] };

  for (const relative of files) {
    const parts = relative.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) continue;

    const parent = ensureDirectory(tree, parts);
    const fullPath = path.join(root, relative);
    let size = 0;

    try {
      size = fs.statSync(fullPath).size;
    } catch {}

    const extension = extFromPath(relative);
    parent.children.push({
      name,
      path: relative,
      type: "file",
      extension,
      size,
      supported: supported.has(extension)
    });
  }

  const json = JSON.stringify(sortChildren(tree));
  console.log("[DevHub git tree] serialized " + Buffer.byteLength(json, "utf-8") + " bytes");
  emitPayload(json);
} catch (error) {
  console.error("[DevHub git tree] failed", error && error.stack ? error.stack : error);
  process.exit(1);
}
`;
}

function buildReadTextFileScript(inputPath: string, markerId: string) {
  return `
const fs = require("fs");

const inputPath = ${JSON.stringify(inputPath)};
const beginMarker = "__DEVHUB_BEGIN_${markerId}__";
const endMarker = "__DEVHUB_END_${markerId}__";

function emitPayload(value) {
  const base64 = Buffer.from(value, "utf-8").toString("base64");

  console.log(beginMarker);
  for (let index = 0; index < base64.length; index += 16000) {
    console.log(base64.slice(index, index + 16000));
  }
  console.log(endMarker);
}

try {
  console.log("[DevHub read] input=" + inputPath);
  const content = fs.readFileSync(inputPath, "utf-8");
  console.log("[DevHub read] read " + Buffer.byteLength(content, "utf-8") + " bytes");
  emitPayload(content);
} catch (error) {
  console.error("[DevHub read] failed", error && error.stack ? error.stack : error);
  process.exit(1);
}
`;
}

function commandPreview(command: string, args: string[]) {
  const value = [command, ...args].join(" ");
  return value.length > 240 ? `${value.slice(0, 240)}...` : value;
}

function terminalChunkToText(chunk: string | Uint8Array) {
  return typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function extractMarkedPayload(output: string, markerId: string) {
  const beginMarker = `__DEVHUB_BEGIN_${markerId}__`;
  const endMarker = `__DEVHUB_END_${markerId}__`;
  const beginIndex = output.indexOf(beginMarker);
  const endIndex = output.indexOf(endMarker);

  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    console.error("[BrowserPod] marked payload missing:", {
      markerId,
      outputPreview: output.slice(0, 1000),
      outputLength: output.length,
    });
    throw new Error("BrowserPod command did not return a readable payload");
  }

  const payload = output
    .slice(beginIndex + beginMarker.length, endIndex)
    .replace(/\s/g, "");

  if (!payload) {
    throw new Error("BrowserPod command returned an empty payload");
  }

  return decodeBase64Utf8(payload);
}

export class PodLifecycleManager {
  private pod?: BrowserPod;
  private terminal?: Terminal;
  private captureTerminal?: Terminal;
  private captureTerminalHost?: HTMLDivElement;
  private captureQueue: Promise<void> = Promise.resolve();
  private runningProcess?: Process;
  private snapshot: PodSnapshot;
  private readonly apiKey: string;
  private readonly storageKey: string;
  private readonly onSnapshot: (snapshot: PodSnapshot) => void;

  constructor(options: PodLifecycleManagerOptions) {
    this.apiKey = options.apiKey;
    this.storageKey = browserPodStorageKey(options.repoId);
    this.onSnapshot = options.onSnapshot;
    this.snapshot = createInitialPodSnapshot(options.repoId);
  }

  getSnapshot() {
    return this.snapshot;
  }

  private emit(partial: Partial<PodSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      terminal: partial.terminal ?? this.snapshot.terminal,
    };
    this.onSnapshot(this.snapshot);
  }

  private log(text: string, stream: TerminalLine["stream"] = "system") {
    this.emit({
      terminal: [...this.snapshot.terminal, createTerminalLine(text, stream)].slice(-200),
    });
  }

  private async runCommand(command: string, args: string[], options: PodRunOptions = {}) {
    if (!this.pod || !this.terminal) {
      throw new Error("BrowserPod is not ready yet");
    }

    const preview = commandPreview(command, args);
    console.debug("[BrowserPod] command start:", { command, args, cwd: options.cwd });
    this.log(`$ ${preview}`);

    try {
      const process = await this.pod.run(command, args, {
        terminal: this.terminal,
        cwd: options.cwd,
        echo: options.echo ?? true,
      });
      console.debug("[BrowserPod] command finished:", preview);
      return process;
    } catch (error) {
      console.error("[BrowserPod] command failed:", { command, args, cwd: options.cwd, error });
      throw error;
    }
  }

  private async getCaptureTerminal() {
    if (!this.pod) {
      throw new Error("BrowserPod is not ready yet");
    }

    if (this.captureTerminal) {
      return this.captureTerminal;
    }

    const host = document.createElement("div");
    host.style.cssText = [
      "position: fixed",
      "left: -10000px",
      "top: 0",
      "width: 800px",
      "height: 400px",
      "opacity: 0",
      "pointer-events: none",
      "overflow: hidden",
    ].join(";");
    document.body.appendChild(host);

    this.captureTerminalHost = host;
    this.captureTerminal = await this.pod.createDefaultTerminal(host);
    console.debug("[BrowserPod] hidden capture terminal created");

    return this.captureTerminal;
  }

  private async runCommandWithOutput(command: string, args: string[], options: PodRunOptions = {}) {
    const run = async () => {
      if (!this.pod) {
        throw new Error("BrowserPod is not ready yet");
      }

      const terminal = (await this.getCaptureTerminal()) as InternalTerminal;

      if (!terminal.xterm) {
        throw new Error("BrowserPod capture terminal is not available");
      }

      const preview = commandPreview(command, args);
      const originalWrite = terminal.xterm.write.bind(terminal.xterm);
      let output = "";

      terminal.xterm.write = (chunk, callback) => {
        output += terminalChunkToText(chunk);
        originalWrite(chunk, callback);
      };

      console.debug("[BrowserPod] capture command start:", { command, args, cwd: options.cwd });
      this.log(`$ ${preview}`);

      try {
        await this.pod.run(command, args, {
          terminal,
          cwd: options.cwd,
          echo: options.echo ?? false,
        });
        console.debug("[BrowserPod] capture command finished:", {
          preview,
          outputLength: output.length,
          outputPreview: output.slice(0, 1000),
        });
        return output;
      } catch (error) {
        console.error("[BrowserPod] capture command failed:", {
          command,
          args,
          cwd: options.cwd,
          outputPreview: output.slice(0, 1000),
          error,
        });
        throw error;
      } finally {
        terminal.xterm.write = originalWrite;
      }
    };

    const result = this.captureQueue.then(run, run);
    this.captureQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private async runNodeScriptWithOutput(script: string, options: PodRunOptions = {}) {
    const scriptPath = `/home/user/.devhub-script-${crypto.randomUUID()}.js`;

    await this.writeTextFile(scriptPath, script);

    try {
      return await this.runCommandWithOutput("node", [scriptPath], options);
    } finally {
      void this.runCommand("rm", ["-f", scriptPath], { cwd: "/home/user", echo: false }).catch(
        (error: unknown) => {
          console.debug("[BrowserPod] failed to remove temp script:", error);
        },
      );
    }
  }

  async boot(terminalHost: HTMLElement) {
    if (this.pod) {
      console.debug("[BrowserPod] already booted, reusing pod");
      return this.pod;
    }

    if (!this.apiKey || this.apiKey === "your_browserpod_api_key") {
      console.error("[BrowserPod] missing or placeholder API key");
      throw new Error("Set VITE_BP_APIKEY in .env before booting BrowserPod");
    }

    console.debug("[BrowserPod] booting with Node 22, apiKey prefix:", this.apiKey.slice(0, 10) + "...");
    this.emit({ state: "booting", error: undefined });
    this.log("Booting BrowserPod with Node 22");

    try {
      const bootOptions: BrowserPodBootOptions = {
        apiKey: this.apiKey,
        nodeVersion: "22",
        storageKey: this.storageKey,
      };

      this.pod = await BrowserPod.boot(bootOptions);
      console.debug("[BrowserPod] BrowserPod.boot() resolved successfully");
      this.terminal = await this.pod.createDefaultTerminal(terminalHost);
      console.debug("[BrowserPod] terminal created");
      this.pod.onPortal(({ url }) => {
        console.debug("[BrowserPod] portal opened:", url);
        this.emit({ portalUrl: url });
        this.log(`Portal opened: ${url}`);
      });
      this.emit({ state: "ready" });
      this.log("BrowserPod ready");
      console.debug("[BrowserPod] ready");
      return this.pod;
    } catch (error) {
      console.error("[BrowserPod] boot failed:", error);
      const message = readableBrowserPodBootError(error);
      this.emit({ state: "error", error: message });
      this.log(message, "stderr");
      throw new Error(message);
    }
  }

  async cloneRepo(repoUrl: string) {
    console.debug("[BrowserPod] cloning repo:", repoUrl);
    this.emit({ state: "cloning", error: undefined, fileTree: undefined });
    this.log(`Cloning ${repoUrl}`);

    try {
      await this.runCommand("rm", ["-rf", REPO_ROOT], { echo: false });
      await this.runCommand("git", ["clone", "--depth", "1", repoUrl, REPO_ROOT]);
      console.debug("[BrowserPod] clone complete, building file tree");
      const fileTree = await this.refreshFileTreeWithRetries();
      console.debug("[BrowserPod] file tree built:", fileTree);
      const runnability = await this.checkRunnability();
      console.debug("[BrowserPod] runnability:", runnability);
      this.emit({ state: "ready", fileTree, runnability });
      return { fileTree, runnability };
    } catch (error) {
      console.error("[BrowserPod] cloneRepo failed:", error);
      const message = error instanceof Error ? error.message : "Repo clone failed";
      this.emit({ state: "error", error: message });
      this.log(message, "stderr");
      throw error;
    }
  }

  async readTextFile(path: string) {
    if (!this.pod) {
      throw new Error("BrowserPod is not ready yet");
    }

    console.debug("[BrowserPod] opening text file:", path);

    let file: BinaryFile | TextFile;
    try {
      file = await this.pod.openFile(path, "utf-8");
    } catch (error) {
      console.error("[BrowserPod] openFile failed:", { path, error });
      throw error;
    }

    if (!isTextFile(file)) {
      await file.close();
      throw new Error(`${path} is not a UTF-8 text file`);
    }

    const size = await file.getSize();
    console.debug("[BrowserPod] text file opened:", { path, size });
    let remaining = size;
    let content = "";

    while (remaining > 0) {
      const chunkSize = Math.min(remaining, 64_000);
      const chunk = await file.read(chunkSize);
      content += chunk;
      remaining -= chunkSize;
    }

    await file.close();
    return content;
  }

  async writeTextFile(path: string, content: string) {
    if (!this.pod) {
      throw new Error("BrowserPod is not ready yet");
    }

    console.debug("[BrowserPod] creating text file:", { path, bytes: content.length });
    const file = await this.pod.createFile(path, "utf-8");
    const writable = toWritableTextFile(file);
    await writable.write(content);
    await writable.close();
    console.debug("[BrowserPod] text file created:", path);
  }

  async readRuntimeTextFile(path: string) {
    const markerId = crypto.randomUUID();

    console.debug("[BrowserPod] reading runtime text file through stdout:", {
      path,
      markerId,
    });

    const output = await this.runNodeScriptWithOutput(buildReadTextFileScript(path, markerId), {
      cwd: REPO_ROOT,
      echo: false,
    });

    return extractMarkedPayload(output, markerId);
  }

  async readRepoFile(path: string) {
    const normalized = path.replace(/^\/+/, "");
    return this.readRuntimeTextFile(`${REPO_ROOT}/${normalized}`);
  }

  private async loadFileTreeFromScript(script: string, markerId: string) {
    const output = await this.runNodeScriptWithOutput(script, {
      cwd: REPO_ROOT,
      echo: false,
    });

    const treeJson = extractMarkedPayload(output, markerId);
    console.debug("[BrowserPod] file tree JSON loaded:", { bytes: treeJson.length });
    if (!treeJson.trim()) {
      throw new Error("BrowserPod produced an empty file tree response");
    }

    return normalizeFileTree(JSON.parse(treeJson) as unknown);
  }

  private async refreshFileTreeWithRetries() {
    let lastError: unknown;
    let lastTree: FileTreeNode | undefined;

    for (let attempt = 0; attempt < FILE_TREE_RETRY_DELAYS_MS.length; attempt += 1) {
      const delay = FILE_TREE_RETRY_DELAYS_MS[attempt];

      if (delay > 0) {
        this.log("Waiting for cloned files to settle before reading the tree");
        await sleep(delay);
      }

      try {
        const tree = await this.refreshFileTree();
        lastTree = tree;

        if (hasTreeEntries(tree)) {
          return tree;
        }
      } catch (error) {
        lastError = error;
        console.debug("[BrowserPod] file tree refresh attempt failed:", {
          attempt: attempt + 1,
          error,
        });
      }
    }

    if (lastTree) {
      throw new Error("BrowserPod cloned the repo, but no files were reported by the filesystem or git index");
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to read file tree from BrowserPod");
  }

  async refreshFileTree() {
    const markerId = crypto.randomUUID();

    console.debug("[BrowserPod] refreshing file tree through stdout:", { markerId });
    const tree = await this.loadFileTreeFromScript(buildTreeScript(REPO_ROOT, markerId), markerId);

    if (hasTreeEntries(tree)) {
      this.emit({ fileTree: tree });
      return tree;
    }

    console.debug("[BrowserPod] filesystem tree was empty, falling back to git index");
    this.log("Filesystem tree was empty, checking git index");
    const gitMarkerId = crypto.randomUUID();
    const gitTree = await this.loadFileTreeFromScript(buildGitTreeScript(REPO_ROOT, gitMarkerId), gitMarkerId);
    this.emit({ fileTree: gitTree });
    return gitTree;
  }

  async checkRunnability(): Promise<RunnabilityResult> {
    const blockers: string[] = [];
    let packageJson: PackageJson;

    try {
      packageJson = parsePackageJson(await this.readRepoFile("package.json"));
    } catch {
      const result = {
        canRun: false,
        blockers: ["No readable package.json found at repo root"],
      };
      this.emit({ runnability: result });
      return result;
    }

    const scripts = packageJson.scripts ?? {};
    const scriptPriority: RunScriptName[] = ["dev", "start", "serve"];
    const entryPoint = scriptPriority.find((scriptName) => Boolean(scripts[scriptName]));

    if (!entryPoint) {
      blockers.push('No runnable npm script found: expected "dev", "start", or "serve"');
    }

    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ]);

    const blockedDeps = BLACKLISTED_DEPENDENCIES.filter((dependency) =>
      dependencyNames.has(dependency),
    );

    if (blockedDeps.length > 0) {
      blockers.push(`Unsupported native/runtime dependencies: ${blockedDeps.join(", ")}`);
    }

    const nodeEngine = packageJson.engines?.node;
    const nodeRange = nodeEngine ? validRange(nodeEngine) : null;

    if (nodeEngine && !nodeRange) {
      blockers.push(`Unable to understand engines.node "${nodeEngine}"`);
    } else if (nodeRange && !semverSatisfies("22.0.0", nodeRange)) {
      blockers.push(`engines.node "${nodeEngine}" does not allow BrowserPod Node 22`);
    }

    const result: RunnabilityResult = {
      canRun: blockers.length === 0,
      entryPoint,
      blockers,
    };

    this.emit({ runnability: result });
    return result;
  }

  async collectAiExtractionPayload(fileTree: FileTreeNode): Promise<ExtractAiPayload> {
    const files = flattenSupportedFiles(fileTree)
      .filter((file) => (file.size ?? 0) <= MAX_AI_FILE_BYTES)
      .slice(0, MAX_AI_FILES);

    const hydratedFiles = await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        content: await this.readRepoFile(file.path),
      })),
    );

    return {
      fileTree,
      files: hydratedFiles,
    };
  }

  async runProject(entryPoint: RunScriptName) {
    console.debug("[BrowserPod] runProject, entryPoint:", entryPoint);
    this.emit({ state: "installing", error: undefined });
    this.log("Installing npm dependencies");
    await this.runCommand("npm", ["install"], { cwd: REPO_ROOT });
    console.debug("[BrowserPod] npm install complete, starting project");

    this.emit({ state: "running", portalUrl: undefined });
    this.log(`Starting npm script: ${entryPoint}`);

    const runPromise = this.runCommand("npm", ["run", entryPoint], { cwd: REPO_ROOT });

    void runPromise
      .then((process) => {
        console.debug("[BrowserPod] project process started:", process);
        this.runningProcess = process;
      })
      .catch((error: unknown) => {
        console.error("[BrowserPod] project process error:", error);
        const message = error instanceof Error ? error.message : "Project process stopped";
        if (this.snapshot.state === "running") {
          this.emit({ state: "error", error: message });
        }
        this.log(message, "stderr");
      });
  }

  async stopProject() {
    console.debug("[BrowserPod] stopProject");
    this.emit({ state: "stopping" });
    this.log("Stopping project");

    const process = this.runningProcess as KillableProcess | undefined;
    const maybeKill = process?.kill ?? process?.terminate ?? process?.close;

    if (maybeKill) {
      await maybeKill.call(process);
    } else {
      try {
        await this.runCommand("pkill", ["-f", "npm run"], { cwd: REPO_ROOT, echo: false });
      } catch {
        this.log("No killable BrowserPod process handle was available");
      }
    }

    this.runningProcess = undefined;
    this.emit({ state: "ready", portalUrl: undefined });
  }

  async terminate() {
    console.debug("[BrowserPod] terminate");
    if (this.snapshot.state === "running" || this.snapshot.state === "installing") {
      try {
        await this.stopProject();
      } catch (error) {
        console.debug("[BrowserPod] stop during terminate failed:", error);
      }
    }

    const pod = this.pod as TerminablePod | undefined;
    const maybeTerminate = pod?.terminate ?? pod?.close;

    if (maybeTerminate) {
      try {
        await maybeTerminate.call(pod);
      } catch (error) {
        console.debug("[BrowserPod] pod terminate failed:", error);
      }
    }

    this.pod = undefined;
    this.terminal = undefined;
    this.captureTerminal = undefined;
    this.captureTerminalHost?.remove();
    this.captureTerminalHost = undefined;
    this.runningProcess = undefined;
    this.emit({ state: "idle", portalUrl: undefined });
  }
}

export { BLACKLISTED_DEPENDENCIES, SUPPORTED_EXTENSIONS, isSupportedFile };
