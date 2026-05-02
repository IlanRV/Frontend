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

interface PodLifecycleManagerOptions {
  repoId: string;
  apiKey: string;
  onSnapshot: (snapshot: PodSnapshot) => void;
}

interface PodRunOptions {
  cwd?: string;
  echo?: boolean;
}

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

function buildTreeScript(outputPath: string) {
  return `
const fs = require("fs");
const path = require("path");

const root = "/repo";
const supported = new Set(${JSON.stringify(SUPPORTED_EXTENSIONS)});
const ignored = new Set(${JSON.stringify(IGNORED_DIRECTORIES)});

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

fs.writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(walk(root)));
`;
}

export class PodLifecycleManager {
  private pod?: BrowserPod;
  private terminal?: Terminal;
  private runningProcess?: Process;
  private snapshot: PodSnapshot;
  private readonly apiKey: string;
  private readonly onSnapshot: (snapshot: PodSnapshot) => void;

  constructor(options: PodLifecycleManagerOptions) {
    this.apiKey = options.apiKey;
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

    this.log(`$ ${[command, ...args].join(" ")}`);

    return this.pod.run(command, args, {
      terminal: this.terminal,
      cwd: options.cwd,
      echo: options.echo ?? true,
    });
  }

  async boot(terminalHost: HTMLElement) {
    if (this.pod) {
      return this.pod;
    }

    if (!this.apiKey || this.apiKey === "your_browserpod_api_key") {
      throw new Error("Set VITE_BP_APIKEY in .env before booting BrowserPod");
    }

    this.emit({ state: "booting", error: undefined });
    this.log("Booting BrowserPod with Node 22");

    try {
      this.pod = await BrowserPod.boot({
        apiKey: this.apiKey,
        nodeVersion: "22",
      });
      this.terminal = await this.pod.createDefaultTerminal(terminalHost);
      this.pod.onPortal(({ url }) => {
        this.emit({ portalUrl: url });
        this.log(`Portal opened: ${url}`);
      });
      this.emit({ state: "ready" });
      this.log("BrowserPod ready");
      return this.pod;
    } catch (error) {
      const message = error instanceof Error ? error.message : "BrowserPod failed to boot";
      this.emit({ state: "error", error: message });
      this.log(message, "stderr");
      throw error;
    }
  }

  async cloneRepo(repoUrl: string) {
    this.emit({ state: "cloning", error: undefined, fileTree: undefined });
    this.log(`Cloning ${repoUrl}`);

    try {
      await this.runCommand("rm", ["-rf", "/repo"], { echo: false });
      await this.runCommand("git", ["clone", "--depth", "1", repoUrl, "/repo"]);
      const fileTree = await this.refreshFileTree();
      const runnability = await this.checkRunnability();
      this.emit({ state: "ready", fileTree, runnability });
      return { fileTree, runnability };
    } catch (error) {
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

    const file = await this.pod.openFile(path, "utf-8");

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

  async readRepoFile(path: string) {
    const normalized = path.replace(/^\/+/, "");
    return this.readTextFile(`/repo/${normalized}`);
  }

  async refreshFileTree() {
    const outputPath = `/tmp/devhub-tree-${crypto.randomUUID()}.json`;
    const scriptPath = `/tmp/devhub-tree-${crypto.randomUUID()}.js`;

    await this.writeTextFile(scriptPath, buildTreeScript(outputPath));
    await this.runCommand("node", [scriptPath], { cwd: "/repo", echo: false });

    const tree = normalizeFileTree(JSON.parse(await this.readTextFile(outputPath)));
    this.emit({ fileTree: tree });
    return tree;
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
    this.emit({ state: "installing", error: undefined });
    this.log("Installing npm dependencies");
    await this.runCommand("npm", ["install"], { cwd: "/repo" });

    this.emit({ state: "running", portalUrl: undefined });
    this.log(`Starting npm script: ${entryPoint}`);

    const runPromise = this.runCommand("npm", ["run", entryPoint], { cwd: "/repo" });

    void runPromise
      .then((process) => {
        this.runningProcess = process;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Project process stopped";
        if (this.snapshot.state === "running") {
          this.emit({ state: "error", error: message });
        }
        this.log(message, "stderr");
      });
  }

  async stopProject() {
    this.emit({ state: "stopping" });
    this.log("Stopping project");

    const process = this.runningProcess as KillableProcess | undefined;
    const maybeKill = process?.kill ?? process?.terminate ?? process?.close;

    if (maybeKill) {
      await maybeKill.call(process);
    } else {
      try {
        await this.runCommand("pkill", ["-f", "npm run"], { cwd: "/repo", echo: false });
      } catch {
        this.log("No killable BrowserPod process handle was available");
      }
    }

    this.runningProcess = undefined;
    this.emit({ state: "ready", portalUrl: undefined });
  }

  async terminate() {
    if (this.snapshot.state === "running" || this.snapshot.state === "installing") {
      await this.stopProject();
    }

    const pod = this.pod as TerminablePod | undefined;
    const maybeTerminate = pod?.terminate ?? pod?.close;

    if (maybeTerminate) {
      await maybeTerminate.call(pod);
    }

    this.pod = undefined;
    this.terminal = undefined;
    this.runningProcess = undefined;
    this.emit({ state: "idle", portalUrl: undefined });
  }
}

export { BLACKLISTED_DEPENDENCIES, SUPPORTED_EXTENSIONS, isSupportedFile };
