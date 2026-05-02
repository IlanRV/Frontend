import type {
  ChatMessage,
  ExtractionResponse,
  FileTreeNode,
  Repo,
  RunnabilityResult,
  Workspace,
} from "@/types";

export function makeFileTree(): FileTreeNode {
  return {
    name: "repo",
    path: "",
    type: "directory",
    children: [
      {
        name: "src",
        path: "src",
        type: "directory",
        children: [
          {
            name: "App.tsx",
            path: "src/App.tsx",
            type: "file",
            extension: ".tsx",
            supported: true,
            size: 120,
          },
          {
            name: "secret.bin",
            path: "src/secret.bin",
            type: "file",
            extension: ".bin",
            supported: false,
            size: 40,
          },
        ],
      },
      {
        name: "README.md",
        path: "README.md",
        type: "file",
        extension: ".md",
        supported: true,
        size: 80,
      },
      {
        name: "package.json",
        path: "package.json",
        type: "file",
        extension: ".json",
        supported: true,
        size: 200,
      },
    ],
  };
}

export function makeRunnability(overrides: Partial<RunnabilityResult> = {}): RunnabilityResult {
  return {
    canRun: true,
    entryPoint: "dev",
    blockers: [],
    previewPath: "/api/health",
    previewPaths: ["/api/health", "/docs"],
    ...overrides,
  };
}

export function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: "repo-1",
    repoId: "repo-1",
    workspaceId: "workspace-1",
    name: "frontend",
    githubUrl: "https://github.com/acme/frontend",
    status: "ready",
    runnable: true,
    runnability: makeRunnability(),
    fileTree: makeFileTree(),
    aiReadmeStatus: "ready",
    aiReadme: "# AI README\n\nHello",
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    workspaceId: "workspace-1",
    name: "Workspace One",
    description: "Main workspace",
    repoCount: 1,
    repos: [makeRepo()],
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

export function makeExtraction(overrides: Partial<ExtractionResponse> = {}): ExtractionResponse {
  return {
    success: true,
    extractionId: "extraction-1",
    status: "ready",
    aiReadmeStatus: "ready",
    techStack: {
      language: "TypeScript",
      framework: "React",
      runtime: "Node.js",
      buildTool: "Vite",
      testingFramework: "Vitest",
      database: null,
      otherTools: ["Tailwind"],
    },
    overview: {
      oneLiner: "A DevHub frontend",
      summary: "Frontend for repo browsing",
      purpose: "Test repositories",
      targetUsers: "Developers",
    },
    functions: [
      {
        name: "loadRepo",
        type: "function",
        file: "src/lib/api.ts",
        line: 12,
        signature: "function loadRepo(id: string): Promise<Repo>",
        description: "Loads one repo",
        params: [{ name: "id", type: "string", description: "Repo id" }],
        returns: { type: "Promise<Repo>", description: "The repo" },
        throws: ["ApiError"],
        dependencies: ["fetch"],
      },
      {
        name: "RepoService",
        type: "class",
        file: "src/lib/repo.ts",
        line: 4,
        signature: "class RepoService",
        description: "Handles repos",
        params: [],
        returns: { type: "void", description: "" },
        throws: [],
        dependencies: [],
      },
    ],
    dependencies: { react: "^18.3.1" },
    aiReadme: "# AI README\n\nGenerated docs",
    runnability: makeRunnability(),
    analysisUpdatedAt: "2026-05-01T12:00:00.000Z",
    analysisModel: "test-model",
    analysisError: null,
    ...overrides,
  };
}

export function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    messageId: "msg-1",
    role: "assistant",
    content: "Hello from AI",
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}
