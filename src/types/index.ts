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
  | ".txt"
  | ".lock"
  | ".sh"
  | ".bash"
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
  fileTree?: FileTreeNode | null;
  analysis?: ExtractionResult | null;
  analysisUpdatedAt?: string | null;
  analysisModel?: string | null;
  analysisError?: string | null;
  analysisProgress?: AnalysisProgress | null;
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
  blockerDetails?: RunnabilityBlockerDetail[];
  previewPath?: string;
  previewPaths?: string[];
}

export type RunnabilityBlockerSeverity = SecuritySeverity | "warning" | "error" | "unknown";

export interface RunnabilityBlockerDetail {
  code: string;
  severity: RunnabilityBlockerSeverity;
  title: string;
  description: string;
  recommendation: string;
  evidence?: string | null;
}

export type AnalysisProgressPhase = "queued" | "scanning" | "querying" | "saving" | "readme" | "complete" | "error";

export interface AnalysisProgress {
  phase: AnalysisProgressPhase;
  percent: number;
  message: string;
  updatedAt: string;
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
  securityEvents?: SandboxSecurityEvent[];
  terminal: TerminalLine[];
}

export type SandboxSecurityEventCode =
  | "install-timeout"
  | "startup-timeout"
  | "suspicious-log"
  | "process-error"
  | "unsafe-install-retry";

export type RuntimeSecurityEventPhase = "clone" | "install" | "start" | "preview" | "stop" | "runtime";
export type RuntimeSecurityEventCategory = "filesystem" | "network" | "process" | "resource" | "install" | "sandbox" | "runtime" | "other";

export interface RuntimeSecurityEventPayload {
  source: "browserpod";
  phase: RuntimeSecurityEventPhase;
  category: RuntimeSecurityEventCategory;
  severity: SecuritySeverity;
  title: string;
  description: string;
  evidence?: string;
  command?: string;
}

export interface RuntimeSecurityEvent extends RuntimeSecurityEventPayload {
  id?: string;
  eventId?: string;
  repoId?: string;
  createdAt: string;
}

export interface RuntimeSecuritySummary {
  riskLevel: SecuritySeverity | "unknown";
  eventCount: number;
  latestEventAt: string | null;
  events: RuntimeSecurityEvent[];
}

export interface RepoSecurityResponse {
  success: boolean;
  repoId: string;
  staticSecurity: SecurityScan | null;
  runtimeSecurity: RuntimeSecuritySummary;
  runnability: RunnabilityResult | null;
}

export interface RegisterSecurityEventResponse {
  success: boolean;
  event: RuntimeSecurityEvent;
  runtimeSecurity: RuntimeSecuritySummary;
}

export interface RegisterRunOptions {
  sandboxConfirmed?: boolean;
  manualOverride?: boolean;
}

export interface SandboxSecurityEvent extends RuntimeSecurityEventPayload {
  id: string;
  code: SandboxSecurityEventCode;
  createdAt: string;
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

export interface TechStack {
  language: string;
  framework: string | null;
  runtime: string;
  buildTool: string | null;
  testingFramework: string | null;
  database: string | null;
  otherTools: string[];
}

export interface Overview {
  oneLiner: string;
  summary: string;
  purpose: string;
  targetUsers: string;
}

export interface FunctionDoc {
  name: string;
  type: "function" | "class" | "method";
  file: string;
  line: number;
  signature: string;
  description: string;
  params: Array<{ name: string; type: string; description: string }>;
  returns: { type: string; description: string };
  throws: string[];
  dependencies: string[];
}

export interface ExtractionResult {
  techStack: TechStack;
  overview: Overview;
  functions: FunctionDoc[];
  dependencies: Record<string, string>;
  security: SecurityScan;
}

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";
export type SecurityConfidence = "high" | "medium" | "low";
export type SecurityCategory =
  | "dependency"
  | "script"
  | "secret"
  | "network"
  | "execution"
  | "obfuscation"
  | "supply-chain"
  | "malware"
  | "config"
  | "other";

export interface SecurityFinding {
  title: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  file: string;
  line: number | null;
  evidence: string;
  impact: string;
  recommendation: string;
  confidence: SecurityConfidence;
}

export interface SecurityDependencyRisk {
  packageName: string;
  version: string | null;
  severity: SecuritySeverity;
  risk: string;
  reason: string;
  recommendation: string;
  confidence: SecurityConfidence;
}

export interface SecurityScan {
  riskLevel: SecuritySeverity | "unknown";
  summary: string;
  findings: SecurityFinding[];
  dependencyRisks: SecurityDependencyRisk[];
  scannedFiles: string[];
  notes: string[];
}

export interface ExtractAiPayload {
  fileTree: FileTreeNode | string;
  files: Array<{
    path: string;
    content: string;
  }>;
}

export interface ExtractAiResponse {
  success: boolean;
  extractionId: string;
  status: RepoStatus;
  cached?: boolean;
  deduped?: boolean;
  analysisProgress?: AnalysisProgress | null;
}

export interface ExtractionResponse extends ExtractAiResponse {
  aiReadmeStatus?: "pending" | "ready" | "error" | string | null;
  techStack: TechStack | null;
  overview: Overview | null;
  functions: FunctionDoc[];
  dependencies: Record<string, string>;
  security: SecurityScan | null;
  aiReadme: string | null;
  runnability?: RunnabilityResult | null;
  analysisUpdatedAt?: string | null;
  analysisModel?: string | null;
  analysisError?: string | null;
  analysisProgress?: AnalysisProgress | null;
}

export interface RepoFileResponse {
  path: string;
  content: string;
  size: number;
  updatedAt: string;
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
  degraded?: boolean;
  cached?: boolean;
}

export interface ApiErrorShape {
  message?: string;
  error?: string;
  details?: unknown;
}
