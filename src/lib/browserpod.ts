import {
  BrowserPod,
  type BinaryFile,
  type Process,
  type Terminal,
  type TextFile,
} from "@leaningtech/browserpod";
import { satisfies as semverSatisfies, validRange } from "semver";

import { suspiciousLogEvent } from "@/lib/security";
import type {
  ExtractAiPayload,
  FileTreeNode,
  PodSnapshot,
  RunnabilityResult,
  SandboxSecurityEvent,
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
  ".ejs",
  ".hbs",
  ".handlebars",
  ".dust",
  ".py",
  ".yml",
  ".yaml",
  ".txt",
  ".lock",
  ".sh",
  ".bash",
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
const MAX_BATCH_READ_FILES = 20;
const MAX_ROUTE_SCAN_FILES = 40;
const MAX_ROUTE_SCAN_FILE_BYTES = 200_000;
const REPO_ROOT = "/home/user/repo";
const FILE_TREE_RETRY_DELAYS_MS = [0, 350, 800, 1400];
const CLONE_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 60_000;
const PORTAL_STARTUP_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 10_000;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

interface PodLifecycleManagerOptions {
  repoId: string;
  apiKey: string;
  onSnapshot: (snapshot: PodSnapshot) => void;
}

interface PodRunOptions {
  cwd?: string;
  echo?: boolean;
  log?: boolean;
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

interface ProjectRunOptions {
  previewExpected?: boolean;
}

interface ProjectRunInvocation {
  command: string;
  args: string[];
  display: string;
}

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

interface ReadRepoFileResult {
  path: string;
  content?: string;
  error?: string;
}

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

function createSecurityEvent(
  code: SandboxSecurityEvent["code"],
  phase: SandboxSecurityEvent["phase"],
  category: SandboxSecurityEvent["category"],
  severity: SandboxSecurityEvent["severity"],
  title: string,
  description: string,
  evidence?: string,
  command?: string,
): SandboxSecurityEvent {
  return {
    id: crypto.randomUUID(),
    code,
    source: "browserpod",
    phase,
    category,
    severity,
    title,
    description,
    evidence,
    command,
    createdAt: nowIso(),
  };
}

function isKillableProcess(process: Process): process is KillableProcess {
  const candidate = process as KillableProcess;
  return Boolean(candidate.kill ?? candidate.terminate ?? candidate.close);
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

function uniquePreviewPaths(paths: string[]) {
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
    .map((path) => (path.startsWith("/") ? path : `/${path}`))
    .filter((path) => !path.includes(":") && !path.includes("*"))
    .slice(0, 8);
}

function detectRoutePaths(content: string) {
  const paths: string[] = [];
  const routeCallPattern =
    /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|all|use)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const routeChainPattern = /\brouter\s*\.\s*route\s*\(\s*["'`]([^"'`]+)["'`]/g;

  for (const match of content.matchAll(routeCallPattern)) {
    paths.push(match[1]);
  }

  for (const match of content.matchAll(routeChainPattern)) {
    paths.push(match[1]);
  }

  return paths;
}

function choosePreviewPath(paths: string[]) {
  return (
    paths.find((path) => path === "/api/health" || path === "/health") ??
    paths.find((path) => path !== "/") ??
    paths[0]
  );
}

function isRouteScanCandidate(file: FileTreeNode) {
  if (!file.supported || (file.size ?? 0) > MAX_ROUTE_SCAN_FILE_BYTES) {
    return false;
  }

  return [".js", ".jsx", ".ts", ".tsx"].includes(file.extension ?? "");
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
  const tree = walk(root);
  const json = JSON.stringify(tree);
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
  const content = fs.readFileSync(inputPath, "utf-8");
  emitPayload(content);
} catch (error) {
  console.error("[DevHub read] failed", error && error.stack ? error.stack : error);
  process.exit(1);
}
`;
}

function buildReadTextFilesScript(rootPath: string, inputPaths: string[], markerId: string) {
  return `
const fs = require("fs");
const path = require("path");

const root = ${JSON.stringify(rootPath)};
const inputPaths = ${JSON.stringify(inputPaths)};
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

function safeResolve(relativePath) {
  const normalized = relativePath.replace(/^\\/+/, "");
  const resolved = path.resolve(root, normalized);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Refusing to read outside repo root: " + relativePath);
  }

  return resolved;
}

const results = inputPaths.map((inputPath) => {
  try {
    return {
      path: inputPath,
      content: fs.readFileSync(safeResolve(inputPath), "utf-8")
    };
  } catch (error) {
    return {
      path: inputPath,
      error: error && error.message ? error.message : String(error)
    };
  }
});

emitPayload(JSON.stringify(results));
`;
}

function commandPreview(command: string, args: string[]) {
  const value = [command, ...args].join(" ");
  return value.length > 240 ? `${value.slice(0, 240)}...` : value;
}

function projectRunInvocation(input: string): ProjectRunInvocation {
  const value = input.trim();

  if (!value) {
    throw new Error("No BrowserPod command was provided");
  }

  if (/^[\w:-]+$/.test(value)) {
    return {
      command: "npm",
      args: ["run", value],
      display: `npm run ${value}`,
    };
  }

  return {
    command: "sh",
    args: ["-lc", value],
    display: value,
  };
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
  private terminalHost?: HTMLElement;
  private captureQueue: Promise<void> = Promise.resolve();
  private runningProcess?: Process;
  private runLock?: Promise<void>;
  private clonedRepoUrl?: string;
  private portalWaiters: Array<(url: string) => void> = [];
  private runtimeMonitorRestore?: () => void;
  private runtimeSecurityEvidence = new Set<string>();
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

  private recordRuntimeOutput(text: string) {
    const cleaned = text.replace(ANSI_ESCAPE_PATTERN, "").trim();

    if (!cleaned) {
      return;
    }

    this.emit({
      terminal: [...this.snapshot.terminal, createTerminalLine(cleaned.slice(0, 1000), "stdout")].slice(-200),
    });
  }

  private recordSecurityEvent(event: SandboxSecurityEvent) {
    this.emit({
      securityEvents: [...(this.snapshot.securityEvents ?? []), event],
    });
  }

  private startRuntimeSecurityMonitor() {
    const terminal = this.terminal as InternalTerminal | undefined;

    if (!terminal?.xterm || this.runtimeMonitorRestore) {
      return;
    }

    const originalWrite = terminal.xterm.write.bind(terminal.xterm);

    terminal.xterm.write = (chunk, callback) => {
      const text = terminalChunkToText(chunk);

      for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        this.recordRuntimeOutput(line);
        const event = suspiciousLogEvent(line);

        if (!event) {
          continue;
        }

        const key = `${event.code}:${event.title}:${event.evidence ?? ""}`;
        if (this.runtimeSecurityEvidence.has(key)) {
          continue;
        }

        this.runtimeSecurityEvidence.add(key);
        this.recordSecurityEvent(event);
      }

      originalWrite(chunk, callback);
    };

    this.runtimeMonitorRestore = () => {
      terminal.xterm!.write = originalWrite;
      this.runtimeMonitorRestore = undefined;
    };
  }

  private stopRuntimeSecurityMonitor() {
    this.runtimeMonitorRestore?.();
  }

  private async runCommandWithTimeout(
    command: string,
    args: string[],
    options: PodRunOptions,
    timeoutMs: number,
    timeoutEvent: () => SandboxSecurityEvent,
  ) {
    let timeoutId: number | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timeoutId = window.setTimeout(() => {
        resolve("timeout");
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([this.runCommand(command, args, options), timeout]);

      if (result === "timeout") {
        const event = timeoutEvent();
        this.recordSecurityEvent(event);
        void this.stopProject().catch(() => undefined);
        throw new Error(event.description);
      }

      return result;
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private async runStopOperationWithTimeout(operation: () => Promise<void> | void) {
    let timeoutId: number | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timeoutId = window.setTimeout(() => resolve("timeout"), STOP_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        Promise.resolve().then(operation).then(() => "done" as const),
        timeout,
      ]);

      if (result === "timeout") {
        const event = createSecurityEvent(
          "stop-timeout",
          "stop",
          "process",
          "high",
          "Sandbox stop timed out",
          "The frontend attempted to stop the BrowserPod process, but the stop command did not finish before the safety timeout.",
          `BrowserPod stop operation exceeded ${STOP_TIMEOUT_MS}ms.`,
          "stop BrowserPod process",
        );
        this.recordSecurityEvent(event);
        this.log(event.description, "stderr");
        return false;
      }

      return true;
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private waitForPortalStartup(displayCommand: string) {
    if (this.snapshot.portalUrl) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      let done = false;
      let removeWaiter = () => undefined;
      const timeoutId = window.setTimeout(() => {
        if (done) {
          return;
        }

        done = true;
        removeWaiter();
        this.recordSecurityEvent(createSecurityEvent(
          "startup-timeout",
          "start",
          "resource",
          "high",
          "Dev server did not become ready",
          "The project started a process but did not expose a BrowserPod portal before the timeout.",
          "No BrowserPod portal opened within 30 seconds.",
          displayCommand,
        ));
        void this.stopProject().catch(() => undefined);
        resolve(false);
      }, PORTAL_STARTUP_TIMEOUT_MS);

      const waiter = () => {
        if (done) {
          return;
        }

        done = true;
        window.clearTimeout(timeoutId);
        removeWaiter();
        resolve(true);
      };

      removeWaiter = () => {
        this.portalWaiters = this.portalWaiters.filter((item) => item !== waiter);
      };
      this.portalWaiters.push(waiter);
    });
  }

  private async runCommand(command: string, args: string[], options: PodRunOptions = {}) {
    if (!this.pod || !this.terminal) {
      throw new Error("BrowserPod is not ready yet");
    }

    const preview = commandPreview(command, args);
    if (options.log ?? false) {
      this.log(`$ ${preview}`);
    }

    try {
      const process = await this.pod.run(command, args, {
        terminal: this.terminal,
        cwd: options.cwd,
        echo: options.echo ?? true,
      });
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

      if (options.log ?? false) {
        this.log(`$ ${preview}`);
      }

      try {
        await this.pod.run(command, args, {
          terminal,
          cwd: options.cwd,
          echo: options.echo ?? false,
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
      return await this.runCommandWithOutput("node", [scriptPath], { ...options, log: false });
    } finally {
      void this.runCommand("rm", ["-f", scriptPath], { cwd: "/home/user", echo: false, log: false }).catch(
        () => undefined,
      );
    }
  }

  async boot(terminalHost: HTMLElement) {
    if (this.pod) {
      if (this.terminalHost !== terminalHost) {
        this.terminal = await this.pod.createDefaultTerminal(terminalHost);
        this.terminalHost = terminalHost;
      }
      this.onSnapshot(this.snapshot);
      return this.pod;
    }

    if (!this.apiKey || this.apiKey === "your_browserpod_api_key") {
      console.error("[BrowserPod] missing or placeholder API key");
      throw new Error("Set VITE_BP_APIKEY in .env before booting BrowserPod");
    }

    this.emit({ state: "booting", error: undefined });
    this.log("Booting BrowserPod with Node 22");

    try {
      const bootOptions: BrowserPodBootOptions = {
        apiKey: this.apiKey,
        nodeVersion: "22",
        storageKey: this.storageKey,
      };

      this.pod = await BrowserPod.boot(bootOptions);
      this.terminal = await this.pod.createDefaultTerminal(terminalHost);
      this.terminalHost = terminalHost;
      this.pod.onPortal(({ url }) => {
        this.emit({ portalUrl: url });
        for (const waiter of this.portalWaiters) {
          waiter(url);
        }
        this.portalWaiters = [];
        this.log(`Portal opened: ${url}`);
      });
      this.emit({ state: "ready" });
      this.log("BrowserPod ready");
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
    if (this.clonedRepoUrl === repoUrl && this.snapshot.fileTree && this.snapshot.runnability) {
      return {
        fileTree: this.snapshot.fileTree,
        runnability: this.snapshot.runnability,
      };
    }

    if (
      this.clonedRepoUrl === repoUrl &&
      this.snapshot.fileTree &&
      (this.snapshot.state === "running" || this.snapshot.state === "installing")
    ) {
      const runnability = this.snapshot.runnability ?? (await this.checkRunnability());
      return {
        fileTree: this.snapshot.fileTree,
        runnability,
      };
    }

    const fileTree = await this.cloneRepoFiles(repoUrl);
    const runnability = this.snapshot.runnability ?? (await this.checkRunnability());
    this.emit({ state: "ready", fileTree, runnability });
    return { fileTree, runnability };
  }

  async cloneRepoFiles(repoUrl: string) {
    if (this.clonedRepoUrl === repoUrl && this.snapshot.fileTree) {
      this.emit({ state: this.snapshot.state === "error" ? "ready" : this.snapshot.state, error: undefined });
      return this.snapshot.fileTree;
    }

    this.emit({ state: "cloning", error: undefined, fileTree: undefined });
    this.log(`Cloning ${repoUrl}`);

    try {
      this.clonedRepoUrl = undefined;
      await this.runCommand("rm", ["-rf", REPO_ROOT], { echo: false });
      await this.runCommandWithTimeout(
        "git",
        ["clone", "--depth", "1", repoUrl, REPO_ROOT],
        {},
        CLONE_TIMEOUT_MS,
        () => createSecurityEvent(
          "clone-timeout",
          "clone",
          "resource",
          "high",
          "Clone timed out",
          "The git clone command did not finish before the safety timeout.",
          `git clone --depth 1 exceeded ${CLONE_TIMEOUT_MS}ms.`,
          `git clone --depth 1 ${repoUrl}`,
        ),
      );
      this.clonedRepoUrl = repoUrl;
      const fileTree = await this.refreshFileTreeWithRetries();
      this.emit({ state: "ready", fileTree, runnability: undefined });
      return fileTree;
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

    const file = await this.pod.createFile(path, "utf-8");
    const writable = toWritableTextFile(file);
    await writable.write(content);
    await writable.close();
  }

  async readRuntimeTextFile(path: string) {
    const markerId = crypto.randomUUID();

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

  async readRepoFiles(paths: string[]) {
    const normalizedPaths = [...new Set(paths.map((path) => path.replace(/^\/+/, "")).filter(Boolean))];

    if (normalizedPaths.length === 0) {
      return [];
    }

    const hydratedFiles: Array<{ path: string; content: string }> = [];

    for (let index = 0; index < normalizedPaths.length; index += MAX_BATCH_READ_FILES) {
      const batch = normalizedPaths.slice(index, index + MAX_BATCH_READ_FILES);
      const markerId = crypto.randomUUID();
      const output = await this.runNodeScriptWithOutput(
        buildReadTextFilesScript(REPO_ROOT, batch, markerId),
        { cwd: REPO_ROOT, echo: false },
      );
      const parsed = JSON.parse(extractMarkedPayload(output, markerId)) as unknown;

      if (!Array.isArray(parsed)) {
        throw new Error("BrowserPod returned an invalid batch file payload");
      }

      hydratedFiles.push(
        ...parsed.flatMap((item): Array<{ path: string; content: string }> => {
          const result = item as ReadRepoFileResult;

          if (typeof result.path === "string" && typeof result.content === "string") {
            return [{ path: result.path, content: result.content }];
          }

          if (typeof result.path === "string" && result.error) {
            console.warn("[BrowserPod] batch file read skipped", { path: result.path, error: result.error });
          }

          return [];
        }),
      );
    }

    return hydratedFiles;
  }

  private async loadFileTreeFromScript(script: string, markerId: string) {
    const output = await this.runNodeScriptWithOutput(script, {
      cwd: REPO_ROOT,
      echo: false,
    });

    const treeJson = extractMarkedPayload(output, markerId);
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
      }
    }

    if (lastTree) {
      throw new Error("BrowserPod cloned the repo, but no files were reported by the filesystem or git index");
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to read file tree from BrowserPod");
  }

  async refreshFileTree() {
    const markerId = crypto.randomUUID();

    const tree = await this.loadFileTreeFromScript(buildTreeScript(REPO_ROOT, markerId), markerId);

    if (hasTreeEntries(tree)) {
      this.emit({ fileTree: tree });
      return tree;
    }

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

    const previewPaths = await this.detectPreviewPaths();

    if (previewPaths.length > 0) {
      result.previewPaths = previewPaths;
      result.previewPath = choosePreviewPath(previewPaths);
    }

    this.emit({ runnability: result });
    return result;
  }

  async collectAiExtractionPayload(fileTree: FileTreeNode): Promise<ExtractAiPayload> {
    const files = flattenSupportedFiles(fileTree)
      .filter((file) => (file.size ?? 0) <= MAX_AI_FILE_BYTES)
      .slice(0, MAX_AI_FILES);
    const hydratedFiles = await this.readRepoFiles(files.map((file) => file.path));

    return {
      fileTree,
      files: hydratedFiles,
    };
  }

  private async detectPreviewPaths() {
    const fileTree = this.snapshot.fileTree;

    if (!fileTree) {
      return [];
    }

    const candidates = flattenSupportedFiles(fileTree)
      .filter(isRouteScanCandidate)
      .slice(0, MAX_ROUTE_SCAN_FILES);
    const detected = (await this.readRepoFiles(candidates.map((file) => file.path))).flatMap((file) =>
      detectRoutePaths(file.content),
    );

    return uniquePreviewPaths(detected);
  }

  async runProject(entryPoint: RunScriptName | string, options: ProjectRunOptions = {}) {
    if (this.runLock) {
      return this.runLock;
    }

    if (this.snapshot.state === "installing" || this.snapshot.state === "running") {
      return Promise.resolve();
    }

    const runPromise = (async () => {
      try {
        const invocation = projectRunInvocation(entryPoint);
        const previewExpected = options.previewExpected ?? true;

        this.emit({ state: "installing", error: undefined });
        this.log("Installing npm dependencies without lifecycle scripts");
        await this.runCommandWithTimeout(
          "npm",
          ["install", "--ignore-scripts"],
          { cwd: REPO_ROOT },
          INSTALL_TIMEOUT_MS,
          () => createSecurityEvent(
            "install-timeout",
            "install",
            "resource",
            "high",
            "Install timed out",
            "The install command did not finish before the safety timeout.",
            "npm install --ignore-scripts exceeded 60000ms.",
            "npm install --ignore-scripts",
          ),
        );

        this.emit({ state: "running", portalUrl: undefined });
        this.log(`Starting sandbox command: ${invocation.display}`);
        this.startRuntimeSecurityMonitor();

        const process = await this.runCommand(invocation.command, invocation.args, { cwd: REPO_ROOT });
        this.runningProcess = process;

        if (previewExpected && !isKillableProcess(process)) {
          const didOpenPortal = await this.waitForPortalStartup(invocation.display);

          if (!didOpenPortal) {
            throw new Error("The sandbox was stopped because the project did not finish starting. This can happen with broken projects, infinite loops, or resource-heavy code.");
          }
        } else if (!previewExpected && !isKillableProcess(process)) {
          this.runningProcess = undefined;
          this.stopRuntimeSecurityMonitor();
          this.emit({ state: "ready" });
        }
      } catch (error) {
        this.stopRuntimeSecurityMonitor();
        const message = error instanceof Error ? error.message : "Project process stopped";
        const isExpectedSandboxStop = message.startsWith("The sandbox was stopped") || message.includes("install command did not finish");

        if (!isExpectedSandboxStop) {
          this.recordSecurityEvent(createSecurityEvent(
            "process-error",
            "start",
            "process",
            "medium",
            "Sandbox process error",
            "The project process stopped before DevHub could open a stable BrowserPod preview.",
            message,
          ));
          this.emit({ state: "error", error: message });
        }

        this.log(message, "stderr");
        throw error;
      }
    })();

    runPromise.catch(() => undefined);
    this.runLock = runPromise.finally(() => {
      this.runLock = undefined;
    });

    this.runLock.catch(() => undefined);

    return this.runLock;
  }

  async stopProject() {
    this.emit({ state: "stopping" });
    this.log("Stopping project");
    this.stopRuntimeSecurityMonitor();

    const process = this.runningProcess as KillableProcess | undefined;
    const maybeKill = process?.kill ?? process?.terminate ?? process?.close;

    if (maybeKill) {
      try {
        await this.runStopOperationWithTimeout(() => maybeKill.call(process));
      } catch (error) {
        const message = error instanceof Error ? error.message : "BrowserPod process kill failed";
        this.recordSecurityEvent(createSecurityEvent(
          "process-error",
          "stop",
          "process",
          "high",
          "Sandbox process did not stop cleanly",
          "The frontend attempted to stop the running process but it did not exit cleanly.",
          message,
          "kill BrowserPod process",
        ));
        this.log(message, "stderr");
      }
    }

    const killPatterns = ["npm run", "npm start", "pnpm", "yarn", "vite", "nodemon", "node server", "node app", "node index"];

    for (const pattern of killPatterns) {
      try {
        await this.runCommand("pkill", ["-f", pattern], { cwd: REPO_ROOT, echo: false, log: false });
      } catch {
        // pkill exits non-zero when no process matches; that is fine for cleanup.
      }
    }

    this.runningProcess = undefined;
    this.emit({ state: "ready", portalUrl: undefined });
  }

  async terminate() {
    if (this.snapshot.state === "running" || this.snapshot.state === "installing") {
      try {
        await this.stopProject();
      } catch {
        // Termination should continue even if process cleanup has already happened.
      }
    }

    const pod = this.pod as TerminablePod | undefined;
    const maybeTerminate = pod?.terminate ?? pod?.close;

    if (maybeTerminate) {
      try {
        await maybeTerminate.call(pod);
      } catch {
        // The pod may already be closed by the runtime.
      }
    }

    this.pod = undefined;
    this.terminal = undefined;
    this.terminalHost = undefined;
    this.captureTerminal = undefined;
    this.captureTerminalHost?.remove();
    this.captureTerminalHost = undefined;
    this.runningProcess = undefined;
    this.runLock = undefined;
    this.clonedRepoUrl = undefined;
    this.portalWaiters = [];
    this.stopRuntimeSecurityMonitor();
    this.runtimeSecurityEvidence.clear();
    this.emit({ state: "idle", portalUrl: undefined });
  }
}

export { BLACKLISTED_DEPENDENCIES, SUPPORTED_EXTENSIONS, isSupportedFile };
