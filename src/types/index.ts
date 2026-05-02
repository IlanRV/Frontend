export type RepoStatus = "cloning" | "analyzing" | "ready" | "running" | "error";

export type FileNodeType = "file" | "directory";

export type SupportedExtension =
  | ".js"
  | ".ts"
  | ".tsx"
  | ".jsx"
  | ".json"
  | ".md"
  | ".css"
  | ".html"
  | ".py"
  | ".yml"
  | ".yaml"
  | ".env"
  | ".gitignore";

export interface FileTreeNode {
  name: string;
  path: string;
  type: FileNodeType;
  children?: FileTreeNode[];
  extension?: string;
  size?: number;
  supported?: boolean;
}

export interface Workspace {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  repoCount: number;
  createdAt: string;
  updatedAt?: string;
  repos?: Repo[];
}

export interface Repo {
  id: string;
  repoId: string;
  workspaceId: string;
  name: string;
  githubUrl: string;
  status: RepoStatus;
  description?: string;
  runnable?: boolean;
  runnability?: RunnabilityResult | null;
  runScript?: string;
  portalUrl?: string;
  aiReadme?: string | null;
  aiReadmeStatus?: "pending" | "ready" | "error" | string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateWorkspacePayload {
  name: string;
  description: string;
}

export interface AddRepoPayload {
  githubUrl: string;
}

export interface RunnabilityResult {
  canRun: boolean;
  entryPoint?: "dev" | "start" | "serve" | string | null;
  blockers: string[];
}

export interface TerminalLine {
  id: string;
  stream: "system" | "stdout" | "stderr";
  text: string;
  createdAt: string;
}

export interface PodSnapshot {
  repoId: string;
  state:
    | "idle"
    | "booting"
    | "cloning"
    | "ready"
    | "installing"
    | "running"
    | "stopping"
    | "error";
  fileTree?: FileTreeNode;
  runnability?: RunnabilityResult;
  portalUrl?: string;
  error?: string;
  terminal: TerminalLine[];
}

export interface AiReadme {
  title?: string;
  summary?: string;
  stack?: string[];
  setup?: string[];
  runCommand?: string;
  notableFiles?: Array<{
    path: string;
    note: string;
  }>;
  risks?: string[];
  raw?: string;
}

export interface ExtractAiPayload {
  fileTree: FileTreeNode;
  files: Array<{
    path: string;
    content: string;
  }>;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  messageId?: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  timestamp?: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

export interface ChatReplyResponse {
  reply: string;
}

export interface ApiErrorShape {
  message?: string;
  error?: string;
  details?: unknown;
}
