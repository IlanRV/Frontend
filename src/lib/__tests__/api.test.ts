import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, apiFetch, normalizeChatMessages } from "@/lib/api";
import { makeChatMessage, makeRepo, makeWorkspace } from "@/test/factories";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  globalThis.fetch = fetchMock;
});

describe("apiFetch", () => {
  it("sends JSON requests and unwraps data envelopes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    await expect(apiFetch<{ ok: boolean }>("/demo", { method: "POST", json: { name: "DevHub" } })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/demo", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "DevHub" }),
    }));
    const [, options] = fetchMock.mock.calls[0];
    expect((options?.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("returns null for empty responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(apiFetch<null>("/empty")).resolves.toBeNull();
  });

  it("throws ApiError with backend message and details", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Nope", details: { field: "name" } }, { status: 422 }));

    await expect(apiFetch("/broken")).rejects.toMatchObject({
      name: "ApiError",
      message: "Nope",
      status: 422,
      details: { error: "Nope", details: { field: "name" } },
    });
  });

  it("uses a fallback message for non-object errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));

    try {
      await apiFetch("/broken");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 502, message: "Request failed with status 502" });
    }
  });
});

describe("api endpoint contracts", () => {
  it("normalizes workspaces and nested repos", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { ...makeWorkspace(), id: "server-workspace", workspaceId: undefined, repos: [{ ...makeRepo(), id: "server-repo", repoId: undefined }] },
    ]));

    await expect(api.workspaces.list()).resolves.toEqual([
      expect.objectContaining({
        id: "server-workspace",
        workspaceId: "server-workspace",
        repoCount: 1,
        repos: [expect.objectContaining({ id: "server-repo", repoId: "server-repo" })],
      }),
    ]);
  });

  it("calls repo run and stop endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: makeRepo({ status: "running" }) }))
      .mockResolvedValueOnce(jsonResponse({ data: makeRepo({ status: "ready" }) }));

    await expect(api.repos.run("repo-1", "https://portal.example", { sandboxConfirmed: true, manualOverride: true })).resolves.toMatchObject({ status: "running" });
    await expect(api.repos.stop("repo-1")).resolves.toMatchObject({ status: "ready" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/repos/repo-1/run", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0][1]?.body as string))).toEqual({
      portalUrl: "https://portal.example",
      sandboxConfirmed: true,
      manualOverride: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/repos/repo-1/stop", expect.objectContaining({ method: "POST" }));
  });

  it("calls repo security summary and runtime event endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        repoId: "repo-1",
        staticSecurity: null,
        runtimeSecurity: {
          riskLevel: "high",
          eventCount: 1,
          latestEventAt: "2026-05-03T00:00:00.000Z",
          events: [{
            id: "evt-1",
            source: "browserpod",
            phase: "install",
            category: "resource",
            severity: "high",
            title: "Install timed out",
            description: "The install command did not finish before the safety timeout.",
            evidence: "npm install exceeded 60000ms",
            command: "npm install --ignore-scripts",
            createdAt: "2026-05-03T00:00:00.000Z",
          }],
        },
        runnability: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true, event: {}, runtimeSecurity: { riskLevel: "high", eventCount: 1, latestEventAt: "2026-05-03T00:00:00.000Z" } }));

    await expect(api.repos.getSecurity("repo-1")).resolves.toMatchObject({
      runtimeSecurity: {
        riskLevel: "high",
        eventCount: 1,
        events: [expect.objectContaining({ title: "Install timed out" })],
      },
    });

    await api.repos.reportSecurityEvent("repo-1", {
      source: "browserpod",
      phase: "install",
      category: "resource",
      severity: "high",
      title: "Install timed out",
      description: "The install command did not finish before the safety timeout.",
      evidence: "npm install exceeded 60000ms",
      command: "npm install --ignore-scripts",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/repos/repo-1/security", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/repos/repo-1/security-events", expect.objectContaining({ method: "POST" }));
  });

  it("encodes repo file paths", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ path: "src/App.tsx", content: "export {}", size: 9, updatedAt: "now" }));

    await api.repos.getFile("repo-1", "src/App.tsx");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/repos/repo-1/file?path=src%2FApp.tsx",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normalizes AI extraction and README payloads", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ extractionId: "ext-1", status: "ready", aiReadme: "# Docs" }))
      .mockResolvedValueOnce(jsonResponse({ extractionId: "ext-1", status: "ready", aiReadme: "# Docs" }));

    await expect(api.ai.getExtraction("repo-1")).resolves.toMatchObject({
      success: true,
      extractionId: "ext-1",
      aiReadme: "# Docs",
      functions: [],
      dependencies: {},
    });
    await expect(api.ai.getReadme("repo-1")).resolves.toMatchObject({ title: "AI README", raw: "# Docs" });
  });

  it("normalizes chat history from arrays and envelopes", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    expect(normalizeChatMessages({ messages: [makeChatMessage({ id: "id-1", messageId: undefined })] })).toEqual([
      expect.objectContaining({ id: "id-1", messageId: "id-1" }),
    ]);
    expect(normalizeChatMessages([{ role: "assistant", content: "Hi" } as never])).toEqual([
      expect.objectContaining({ id: "msg-00000000-0000-4000-8000-000000000001" }),
    ]);
  });
});
