import type {
  AddRepoPayload,
  AnalysisProgress,
  AiReadme,
  ApiErrorShape,
  ChatHistoryResponse,
  ChatMessage,
  ChatReplyResponse,
  CreateWorkspacePayload,
  ExtractAiResponse,
  ExtractAiPayload,
  ExtractionResponse,
  Repo,
  RepoFileResponse,
  RepoProjectKind,
  RegisterRunOptions,
  RegisterSecurityEventResponse,
  RepoSecurityResponse,
  RepoRuntimeProfile,
  RepoRuntimeSupportLevel,
  RunnabilityBlockerSeverity,
  RunnabilityResult,
  RuntimeCommandConfidence,
  RuntimeCommandSource,
  RuntimeCommandSuggestion,
  SecurityConfidence,
  SecurityScan,
  SecuritySeverity,
  RuntimeSecurityEvent,
  RuntimeSecurityEventPayload,
  RuntimeSecuritySummary,
  Workspace,
} from "@/types";
import { isRecord } from "@/lib/utils";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001/api").replace(
  /\/$/,
  "",
);
const API_TIMEOUT_MS = 90_000;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiFetchOptions extends Omit<RequestInit, "body" | "method"> {
  method?: HttpMethod;
  json?: unknown;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function resolvePath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrapData<T>(payload: unknown): T {
  if (isRecord(payload) && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeRepo(payload: unknown): Repo {
  if (!isRecord(payload)) {
    return payload as Repo;
  }

  const repoId = readString(payload, "repoId") ?? readString(payload, "id") ?? "";

  return {
    ...(payload as unknown as Repo),
    id: repoId,
    repoId,
    runnability: normalizeRunnability(payload.runnability),
    analysisProgress: normalizeAnalysisProgress(payload.analysisProgress),
  };
}

function normalizeWorkspace(payload: unknown): Workspace {
  if (!isRecord(payload)) {
    return payload as Workspace;
  }

  const workspaceId = readString(payload, "workspaceId") ?? readString(payload, "id") ?? "";
  const repos = Array.isArray(payload.repos) ? payload.repos.map(normalizeRepo) : undefined;

  return {
    ...(payload as unknown as Workspace),
    id: workspaceId,
    workspaceId,
    repoCount: typeof payload.repoCount === "number" ? payload.repoCount : repos?.length ?? 0,
    repos,
  };
}

function normalizeChatMessage(payload: unknown): ChatMessage {
  if (!isRecord(payload)) {
    return payload as ChatMessage;
  }

  const messageId = readString(payload, "messageId") ?? readString(payload, "id") ?? createFallbackId("msg");
  const createdAt = readString(payload, "createdAt") ?? readString(payload, "timestamp") ?? new Date().toISOString();

  return {
    ...(payload as unknown as ChatMessage),
    id: messageId,
    messageId,
    createdAt,
    timestamp: readString(payload, "timestamp") ?? createdAt,
  };
}

function normalizeAnalysisProgress(payload: unknown): AnalysisProgress | null {
  if (!isRecord(payload)) {
    return null;
  }

  const phase = readString(payload, "phase");
  const message = readString(payload, "message");
  const updatedAt = readString(payload, "updatedAt");
  const percent = typeof payload.percent === "number" ? payload.percent : Number(payload.percent);

  if (!phase || !message || !updatedAt || !Number.isFinite(percent)) {
    return null;
  }

  return {
    phase: phase as AnalysisProgress["phase"],
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    message,
    updatedAt,
  };
}

function normalizeSeverity(value: unknown): SecuritySeverity {
  return value === "critical" || value === "high" || value === "medium" || value === "low" || value === "info"
    ? value
    : "info";
}

function normalizeConfidence(value: unknown): SecurityConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeProjectKind(value: unknown): RepoProjectKind {
  return value === "preview-app" || value === "api-server" || value === "library" || value === "cli" || value === "test-only" || value === "unknown"
    ? value
    : "unknown";
}

function normalizeSupportLevel(value: unknown): RepoRuntimeSupportLevel {
  return value === "auto-preview" || value === "manual-only" || value === "analysis-only"
    ? value
    : "analysis-only";
}

function normalizeCommandConfidence(value: unknown): RuntimeCommandConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeCommandSource(value: unknown): RuntimeCommandSource {
  return value === "package-script" || value === "package-manager" || value === "readme" || value === "static-analysis" || value === "ai" || value === "unknown"
    ? value
    : "unknown";
}

function normalizeRuntimeCommandSuggestion(payload: unknown): RuntimeCommandSuggestion | null {
  if (!isRecord(payload)) {
    return null;
  }

  const command = readString(payload, "command")?.trim();

  if (!command) {
    return null;
  }

  return {
    command,
    label: readString(payload, "label") ?? null,
    description: readString(payload, "description") ?? null,
    source: normalizeCommandSource(payload.source),
    confidence: normalizeCommandConfidence(payload.confidence),
    reason: readString(payload, "reason") ?? null,
    evidence: readString(payload, "evidence") ?? null,
    previewExpected: typeof payload.previewExpected === "boolean" ? payload.previewExpected : undefined,
  };
}

function normalizeRuntimeCommands(value: unknown) {
  return Array.isArray(value)
    ? value.map(normalizeRuntimeCommandSuggestion).filter((item): item is RuntimeCommandSuggestion => Boolean(item))
    : [];
}

function normalizeRuntimeProfile(payload: unknown): RepoRuntimeProfile | null {
  if (!isRecord(payload)) {
    return null;
  }

  return {
    projectKind: normalizeProjectKind(payload.projectKind),
    supportLevel: normalizeSupportLevel(payload.supportLevel),
    previewExpected: payload.previewExpected === true,
    autoCommand: readString(payload, "autoCommand") ?? null,
    manualCommands: normalizeRuntimeCommands(payload.manualCommands),
    evidence: normalizeStringArray(payload.evidence),
    reasoning: readString(payload, "reasoning") ?? null,
  };
}

function normalizeRunnability(payload: unknown): RunnabilityResult | null {
  if (!isRecord(payload)) {
    return null;
  }

  const entryPoint = payload.entryPoint;
  const runtimeProfile = normalizeRuntimeProfile(payload.runtimeProfile);
  const blockerDetails = Array.isArray(payload.blockerDetails)
    ? payload.blockerDetails.filter(isRecord).map((blocker) => ({
        code: readString(blocker, "code") ?? "runtime-blocker",
        severity: (readString(blocker, "severity") ?? "unknown") as RunnabilityBlockerSeverity,
        title: readString(blocker, "title") ?? "Cannot start automatically",
        description: readString(blocker, "description") ?? "DevHub could not start this repository automatically.",
        recommendation: readString(blocker, "recommendation") ?? "Review the startup scripts manually.",
        evidence: readString(blocker, "evidence") ?? null,
      }))
    : undefined;

  return {
    canRun: payload.canRun === true,
    entryPoint: typeof entryPoint === "string" ? entryPoint : null,
    autoCommand: readString(payload, "autoCommand") ?? runtimeProfile?.autoCommand ?? null,
    blockers: normalizeStringArray(payload.blockers),
    blockerDetails,
    previewPath: readString(payload, "previewPath"),
    previewPaths: normalizeStringArray(payload.previewPaths),
    manualCommands: normalizeRuntimeCommands(payload.manualCommands),
    runtimeProfile,
  };
}

function normalizeSecurityScan(payload: unknown): SecurityScan | null {
  if (!isRecord(payload)) {
    return null;
  }

  const riskLevel = readString(payload, "riskLevel");
  const normalizedRiskLevel =
    riskLevel === "critical" || riskLevel === "high" || riskLevel === "medium" || riskLevel === "low" || riskLevel === "info" || riskLevel === "unknown"
      ? riskLevel
      : "unknown";

  return {
    riskLevel: normalizedRiskLevel,
    summary: readString(payload, "summary") ?? "No security summary was returned.",
    findings: Array.isArray(payload.findings)
      ? payload.findings.filter(isRecord).map((finding) => ({
          title: readString(finding, "title") ?? "Security finding",
          severity: normalizeSeverity(finding.severity),
          category: (readString(finding, "category") ?? "other") as SecurityScan["findings"][number]["category"],
          file: readString(finding, "file") ?? "unknown",
          line: typeof finding.line === "number" ? finding.line : null,
          evidence: readString(finding, "evidence") ?? "No evidence returned.",
          impact: readString(finding, "impact") ?? "Impact was not described.",
          recommendation: readString(finding, "recommendation") ?? "Review manually.",
          confidence: normalizeConfidence(finding.confidence),
        }))
      : [],
    dependencyRisks: Array.isArray(payload.dependencyRisks)
      ? payload.dependencyRisks.filter(isRecord).map((risk) => ({
          packageName: readString(risk, "packageName") ?? "unknown",
          version: readString(risk, "version") ?? null,
          severity: normalizeSeverity(risk.severity),
          risk: readString(risk, "risk") ?? "Dependency risk",
          reason: readString(risk, "reason") ?? "No reason returned.",
          recommendation: readString(risk, "recommendation") ?? "Review manually.",
          confidence: normalizeConfidence(risk.confidence),
        }))
      : [],
    scannedFiles: normalizeStringArray(payload.scannedFiles),
    notes: normalizeStringArray(payload.notes),
  };
}

function normalizeRuntimeEvent(payload: unknown): RuntimeSecurityEvent {
  if (!isRecord(payload)) {
    return {
      source: "browserpod",
      phase: "runtime",
      category: "other",
      severity: "info",
      title: "Runtime sandbox event",
      description: "A BrowserPod runtime event was reported.",
      createdAt: new Date().toISOString(),
    };
  }

  return {
    ...(payload as unknown as RuntimeSecurityEvent),
    id: readString(payload, "id") ?? readString(payload, "eventId"),
    eventId: readString(payload, "eventId") ?? readString(payload, "id"),
    source: "browserpod",
    phase: (readString(payload, "phase") ?? "runtime") as RuntimeSecurityEvent["phase"],
    category: (readString(payload, "category") ?? "other") as RuntimeSecurityEvent["category"],
    severity: normalizeSeverity(payload.severity),
    title: readString(payload, "title") ?? "Runtime sandbox event",
    description: readString(payload, "description") ?? "A BrowserPod runtime event was reported.",
    evidence: readString(payload, "evidence"),
    command: readString(payload, "command"),
    createdAt: readString(payload, "createdAt") ?? new Date().toISOString(),
  };
}

function normalizeRuntimeSecurity(payload: unknown): RuntimeSecuritySummary {
  if (!isRecord(payload)) {
    return {
      riskLevel: "unknown",
      eventCount: 0,
      latestEventAt: null,
      events: [],
    };
  }

  const riskLevel = readString(payload, "riskLevel");
  const eventCount = typeof payload.eventCount === "number" ? payload.eventCount : Number(payload.eventCount);

  return {
    riskLevel: riskLevel === "critical" || riskLevel === "high" || riskLevel === "medium" || riskLevel === "low" || riskLevel === "info" || riskLevel === "unknown"
      ? riskLevel
      : "unknown",
    eventCount: Number.isFinite(eventCount) ? eventCount : 0,
    latestEventAt: readString(payload, "latestEventAt") ?? null,
    events: Array.isArray(payload.events) ? payload.events.map(normalizeRuntimeEvent) : [],
  };
}

function normalizeRepoSecurityResponse(payload: unknown): RepoSecurityResponse {
  if (!isRecord(payload)) {
    return payload as RepoSecurityResponse;
  }

  return {
    success: payload.success !== false,
    repoId: readString(payload, "repoId") ?? "",
    staticSecurity: normalizeSecurityScan(payload.staticSecurity),
    runtimeSecurity: normalizeRuntimeSecurity(payload.runtimeSecurity),
    runnability: normalizeRunnability(payload.runnability),
  };
}

function normalizeRegisterSecurityEventResponse(payload: unknown): RegisterSecurityEventResponse {
  if (!isRecord(payload)) {
    return payload as RegisterSecurityEventResponse;
  }

  return {
    success: payload.success !== false,
    event: normalizeRuntimeEvent(payload.event),
    runtimeSecurity: normalizeRuntimeSecurity(payload.runtimeSecurity),
  };
}

function createFetchTimeout(parentSignal?: AbortSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortFromParent = () => controller.abort(parentSignal?.reason);

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, API_TIMEOUT_MS);
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    clear: () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function normalizeAiReadme(payload: unknown): AiReadme | undefined {
  if (typeof payload === "string") {
    return payload.trim().length > 0 ? { raw: payload } : undefined;
  }

  if (!isRecord(payload)) {
    return undefined;
  }

  if (typeof payload.aiReadme === "string") {
    if (payload.aiReadme.trim().length === 0) {
      return undefined;
    }

    return {
      ...(payload as AiReadme),
      title: readString(payload, "title") ?? "AI README",
      raw: payload.aiReadme,
    };
  }

  if (typeof payload.raw === "string" && payload.raw.trim().length > 0) {
    return payload as AiReadme;
  }

  return undefined;
}

function normalizeExtractionResponse(payload: unknown): ExtractionResponse {
  if (!isRecord(payload)) {
    return payload as ExtractionResponse;
  }

  return {
    success: payload.success !== false,
    extractionId: readString(payload, "extractionId") ?? "",
    status: (readString(payload, "status") ?? "ready") as ExtractionResponse["status"],
    aiReadmeStatus: readString(payload, "aiReadmeStatus") ?? null,
    techStack: isRecord(payload.techStack) ? (payload.techStack as unknown as ExtractionResponse["techStack"]) : null,
    overview: isRecord(payload.overview) ? (payload.overview as unknown as ExtractionResponse["overview"]) : null,
    functions: Array.isArray(payload.functions) ? (payload.functions as ExtractionResponse["functions"]) : [],
    dependencies: isRecord(payload.dependencies) ? (payload.dependencies as Record<string, string>) : {},
    security: normalizeSecurityScan(payload.security),
    aiReadme: typeof payload.aiReadme === "string" && payload.aiReadme.trim().length > 0 ? payload.aiReadme : null,
    runnability: normalizeRunnability(payload.runnability),
    analysisUpdatedAt: readString(payload, "analysisUpdatedAt") ?? null,
    analysisModel: readString(payload, "analysisModel") ?? null,
    analysisError: readString(payload, "analysisError") ?? null,
    analysisProgress: normalizeAnalysisProgress(payload.analysisProgress),
    cached: typeof payload.cached === "boolean" ? payload.cached : undefined,
    deduped: typeof payload.deduped === "boolean" ? payload.deduped : undefined,
  };
}

function createFallbackId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback;
  }

  const shape = payload as ApiErrorShape;
  return shape.message ?? shape.error ?? fallback;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const timeout = createFetchTimeout(options.signal ?? undefined);

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(resolvePath(path), {
      ...options,
      method: options.method ?? "GET",
      cache: options.cache ?? "no-store",
      headers,
      signal: timeout.signal,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new ApiError(
        getErrorMessage(payload, `Request failed with status ${response.status}`),
        response.status,
        payload,
      );
    }

    return unwrapData<T>(payload);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ApiError("Request timed out. Please retry once the current operation has settled.", 408);
    }

    throw error;
  } finally {
    timeout.clear();
  }
}

export function normalizeChatMessages(response: ChatHistoryResponse | ChatMessage[]) {
  const messages = Array.isArray(response) ? response : response.messages;
  return messages.map(normalizeChatMessage);
}

export const api = {
  workspaces: {
    list: async () => (await apiFetch<unknown[]>("/workspaces")).map(normalizeWorkspace),
    create: (payload: CreateWorkspacePayload) =>
      apiFetch<unknown>("/workspaces", { method: "POST", json: payload }).then(normalizeWorkspace),
    get: (workspaceId: string) =>
      apiFetch<unknown>(`/workspaces/${workspaceId}`).then(normalizeWorkspace),
    delete: (workspaceId: string) =>
      apiFetch<void>(`/workspaces/${workspaceId}`, { method: "DELETE" }),
  },
  repos: {
    add: (workspaceId: string, payload: AddRepoPayload) =>
      apiFetch<unknown>(`/workspaces/${workspaceId}/repos`, {
        method: "POST",
        json: payload,
      }).then(normalizeRepo),
    get: (repoId: string) => apiFetch<unknown>(`/repos/${repoId}`).then(normalizeRepo),
    getFile: (repoId: string, path: string) =>
      apiFetch<RepoFileResponse>(`/repos/${repoId}/file?path=${encodeURIComponent(path)}`),
    delete: (repoId: string) => apiFetch<void>(`/repos/${repoId}`, { method: "DELETE" }),
    run: (repoId: string, portalUrl: string, options: RegisterRunOptions = {}) =>
      apiFetch<unknown>(`/repos/${repoId}/run`, {
        method: "POST",
        json: {
          portalUrl,
          ...(options.sandboxConfirmed ? { sandboxConfirmed: true } : {}),
          ...(options.manualOverride ? { manualOverride: true } : {}),
        },
      }).then(normalizeRepo),
    stop: (repoId: string) =>
      apiFetch<unknown>(`/repos/${repoId}/stop`, { method: "POST" }).then(normalizeRepo),
    getSecurity: (repoId: string) =>
      apiFetch<unknown>(`/repos/${repoId}/security`).then(normalizeRepoSecurityResponse),
    reportSecurityEvent: (repoId: string, payload: RuntimeSecurityEventPayload) =>
      apiFetch<unknown>(`/repos/${repoId}/security-events`, {
        method: "POST",
        json: payload,
      }).then(normalizeRegisterSecurityEventResponse),
  },
  ai: {
    extract: (repoId: string, payload: ExtractAiPayload) =>
      apiFetch<ExtractAiResponse>(`/ai/extract/${repoId}`, {
        method: "POST",
        json: payload,
      }),
    extractStored: (repoId: string) =>
      apiFetch<ExtractAiResponse>(`/ai/extract/${repoId}`, {
        method: "POST",
        json: { useStoredFiles: true },
      }),
    getExtraction: (repoId: string) =>
      apiFetch<unknown>(`/ai/extract/${repoId}`).then(normalizeExtractionResponse),
    getReadme: (repoId: string) =>
      apiFetch<unknown>(`/ai/extract/${repoId}`).then((payload) =>
        normalizeAiReadme(normalizeExtractionResponse(payload)),
      ),
  },
  chat: {
    getWorkspace: (workspaceId: string) =>
      apiFetch<ChatHistoryResponse | ChatMessage[]>(`/chat/workspace/${workspaceId}`),
    sendWorkspace: (workspaceId: string, message: string) =>
      apiFetch<ChatReplyResponse>(`/chat/workspace/${workspaceId}`, {
        method: "POST",
        json: { message },
      }),
    getRepo: (repoId: string) =>
      apiFetch<ChatHistoryResponse | ChatMessage[]>(`/chat/repo/${repoId}`),
    sendRepo: (repoId: string, message: string) =>
      apiFetch<ChatReplyResponse>(`/chat/repo/${repoId}`, {
        method: "POST",
        json: { message },
      }),
  },
};
