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
  return Array.isArray(response) ? response : response.messages;
}

export const api = {
  workspaces: {
    list: () => apiFetch<Workspace[]>("/workspaces"),
    create: (payload: CreateWorkspacePayload) =>
      apiFetch<Workspace>("/workspaces", { method: "POST", json: payload }),
    get: (workspaceId: string) => apiFetch<Workspace>(`/workspaces/${workspaceId}`),
    delete: (workspaceId: string) =>
      apiFetch<void>(`/workspaces/${workspaceId}`, { method: "DELETE" }),
  },
  repos: {
    add: (workspaceId: string, payload: AddRepoPayload) =>
      apiFetch<Repo>(`/workspaces/${workspaceId}/repos`, {
        method: "POST",
        json: payload,
      }),
    get: (repoId: string) => apiFetch<Repo>(`/repos/${repoId}`),
    delete: (repoId: string) => apiFetch<void>(`/repos/${repoId}`, { method: "DELETE" }),
    run: (repoId: string, portalUrl: string) =>
      apiFetch<Repo>(`/repos/${repoId}/run`, {
        method: "POST",
        json: { portalUrl },
      }),
    stop: (repoId: string) => apiFetch<Repo>(`/repos/${repoId}/stop`, { method: "POST" }),
  },
  ai: {
    extract: (repoId: string, payload: ExtractAiPayload) =>
      apiFetch<AiReadme>(`/ai/extract/${repoId}`, {
        method: "POST",
        json: payload,
      }),
    getReadme: (repoId: string) => apiFetch<AiReadme>(`/ai/extract/${repoId}`),
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
