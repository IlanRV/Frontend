import type {
  AddRepoPayload,
  AiReadme,
  ApiErrorShape,
  ChatHistoryResponse,
  ChatMessage,
  ChatReplyResponse,
  CreateWorkspacePayload,
  ExtractAiPayload,
  Repo,
  Workspace,
} from "@/types";
import { isRecord } from "@/lib/utils";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001/api").replace(
  /\/$/,
  "",
);

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

function normalizeAiReadme(payload: unknown): AiReadme {
  if (typeof payload === "string") {
    return { raw: payload };
  }

  if (!isRecord(payload)) {
    return payload as AiReadme;
  }

  if (typeof payload.aiReadme === "string") {
    return {
      ...(payload as AiReadme),
      title: readString(payload, "title") ?? "AI README",
      raw: payload.aiReadme,
    };
  }

  return payload as AiReadme;
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

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(resolvePath(path), {
    ...options,
    method: options.method ?? "GET",
    headers,
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
    delete: (repoId: string) => apiFetch<void>(`/repos/${repoId}`, { method: "DELETE" }),
    run: (repoId: string, portalUrl: string) =>
      apiFetch<unknown>(`/repos/${repoId}/run`, {
        method: "POST",
        json: { portalUrl },
      }).then(normalizeRepo),
    stop: (repoId: string) =>
      apiFetch<unknown>(`/repos/${repoId}/stop`, { method: "POST" }).then(normalizeRepo),
  },
  ai: {
    extract: (repoId: string, payload: ExtractAiPayload) =>
      apiFetch<unknown>(`/ai/extract/${repoId}`, {
        method: "POST",
        json: payload,
      }).then(normalizeAiReadme),
    getReadme: (repoId: string) =>
      apiFetch<unknown>(`/ai/extract/${repoId}`).then(normalizeAiReadme),
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
