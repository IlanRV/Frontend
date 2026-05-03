import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { loadCachedExtraction, saveCachedExtraction } from "@/lib/extractionCache";
import type { AiReadme, ExtractionResponse, RegisterRunOptions, Repo, RepoSecurityResponse, RuntimeSecurityEventPayload } from "@/types";

interface RepoState {
  repo?: Repo;
  extraction?: ExtractionResponse;
  security?: RepoSecurityResponse;
  aiReadme?: AiReadme;
  error?: string;
  aiError?: string;
  securityError?: string;
  isLoading: boolean;
  isAiLoading: boolean;
  isSecurityLoading: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function aiReadmeFromExtraction(extraction: ExtractionResponse | undefined): AiReadme | undefined {
  if (!extraction?.aiReadme?.trim()) {
    return undefined;
  }

  return {
    title: "AI README",
    raw: extraction.aiReadme,
  };
}

function extractionFromRepo(repo: Repo): ExtractionResponse | undefined {
  if (!repo.analysis && !repo.aiReadme && !repo.analysisError) {
    return undefined;
  }

  return {
    success: true,
    extractionId: repo.id,
    status: repo.status,
    aiReadmeStatus: repo.aiReadmeStatus ?? null,
    techStack: repo.analysis?.techStack ?? null,
    overview: repo.analysis?.overview ?? null,
    functions: repo.analysis?.functions ?? [],
    dependencies: repo.analysis?.dependencies ?? {},
    security: repo.analysis?.security ?? null,
    aiReadme: repo.aiReadme ?? null,
    runnability: repo.runnability ?? null,
    analysisUpdatedAt: repo.analysisUpdatedAt ?? null,
    analysisModel: repo.analysisModel ?? null,
    analysisError: repo.analysisError ?? null,
    analysisProgress: repo.analysisProgress ?? null,
  };
}

function initialState(repoId: string | undefined): RepoState {
  const extraction = loadCachedExtraction(repoId);

  return {
    extraction,
    aiReadme: aiReadmeFromExtraction(extraction),
    isLoading: Boolean(repoId),
    isAiLoading: false,
    isSecurityLoading: false,
  };
}

export function useRepo(repoId: string | undefined) {
  const [state, setState] = useState<RepoState>(() => initialState(repoId));
  const [pollAttempt, setPollAttempt] = useState(0);

  useEffect(() => {
    setState(initialState(repoId));
    setPollAttempt(0);
  }, [repoId]);

  const refresh = useCallback(async () => {
    if (!repoId) {
      setState({ isLoading: false, isAiLoading: false, isSecurityLoading: false, error: "Missing repo id" });
      return;
    }

    setState((current) => ({ ...current, isLoading: true, error: undefined }));

    try {
      const repo = await api.repos.get(repoId);
      const repoExtraction = extractionFromRepo(repo);

      if (repoExtraction) {
        saveCachedExtraction(repo.id, repoExtraction);
      }

      setState((current) => {
        const extraction = repoExtraction ?? current.extraction;
        return {
          ...current,
          repo,
          extraction,
          aiReadme: aiReadmeFromExtraction(extraction) ?? current.aiReadme,
          isLoading: false,
        };
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        repo: undefined,
        isLoading: false,
        error: getErrorMessage(error, "Unable to load repo"),
      }));
    }
  }, [repoId]);

  const loadExtraction = useCallback(async () => {
    if (!repoId) {
      return;
    }

    setState((current) => ({ ...current, isAiLoading: true, aiError: undefined }));

    try {
      const extraction = await api.ai.getExtraction(repoId);
      saveCachedExtraction(repoId, extraction);
      setState((current) => ({
        ...current,
        extraction,
        aiReadme: aiReadmeFromExtraction(extraction) ?? current.aiReadme,
        isAiLoading: false,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isAiLoading: false,
        aiError: getErrorMessage(error, "Unable to load AI README"),
      }));
    }
  }, [repoId]);

  const loadAiReadme = loadExtraction;

  const loadSecurity = useCallback(async () => {
    if (!repoId) {
      return undefined;
    }

    setState((current) => ({ ...current, isSecurityLoading: true, securityError: undefined }));

    try {
      const security = await api.repos.getSecurity(repoId);
      setState((current) => ({
        ...current,
        security,
        isSecurityLoading: false,
      }));
      return security;
    } catch (error) {
      setState((current) => ({
        ...current,
        isSecurityLoading: false,
        securityError: getErrorMessage(error, "Unable to load security events"),
      }));
      return undefined;
    }
  }, [repoId]);

  const reportSecurityEvent = useCallback(async (payload: RuntimeSecurityEventPayload) => {
    if (!repoId) {
      throw new Error("Missing repo id");
    }

    await api.repos.reportSecurityEvent(repoId, payload);
    return loadSecurity();
  }, [loadSecurity, repoId]);

  const registerRun = useCallback(
    async (portalUrl: string, options: RegisterRunOptions = {}) => {
      if (!repoId) {
        throw new Error("Missing repo id");
      }

      const repo = await api.repos.run(repoId, portalUrl, options);
      setState((current) => ({ ...current, repo }));
      return repo;
    },
    [repoId],
  );

  const registerStop = useCallback(async () => {
    if (!repoId) {
      throw new Error("Missing repo id");
    }

    const repo = await api.repos.stop(repoId);
    setState((current) => ({ ...current, repo }));
    return repo;
  }, [repoId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const status = state.repo?.status;

    if (!repoId || (status !== "cloning" && status !== "analyzing")) {
      if (pollAttempt !== 0) {
        setPollAttempt(0);
      }
      return;
    }

    const delay = Math.min(8000, 2000 * 2 ** Math.min(pollAttempt, 2));
    const timeoutId = window.setTimeout(() => {
      void refresh().finally(() => setPollAttempt((attempt) => attempt + 1));
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [pollAttempt, refresh, repoId, state.repo?.status]);

  return {
    repo: state.repo,
    extraction: state.extraction,
    security: state.security,
    aiReadme: state.aiReadme,
    isLoading: state.isLoading,
    isAiLoading: state.isAiLoading,
    isSecurityLoading: state.isSecurityLoading,
    error: state.error,
    aiError: state.aiError,
    securityError: state.securityError,
    refresh,
    loadExtraction,
    loadAiReadme,
    loadSecurity,
    reportSecurityEvent,
    registerRun,
    registerStop,
  };
}
