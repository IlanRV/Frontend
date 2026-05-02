import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { AiReadme, Repo } from "@/types";

interface RepoState {
  repo?: Repo;
  aiReadme?: AiReadme;
  error?: string;
  aiError?: string;
  isLoading: boolean;
  isAiLoading: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useRepo(repoId: string | undefined) {
  const [state, setState] = useState<RepoState>({
    isLoading: Boolean(repoId),
    isAiLoading: false,
  });

  const refresh = useCallback(async () => {
    if (!repoId) {
      setState({ isLoading: false, isAiLoading: false, error: "Missing repo id" });
      return;
    }

    setState((current) => ({ ...current, isLoading: true, error: undefined }));

    try {
      const repo = await api.repos.get(repoId);
      setState((current) => ({ ...current, repo, isLoading: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        repo: undefined,
        isLoading: false,
        error: getErrorMessage(error, "Unable to load repo"),
      }));
    }
  }, [repoId]);

  const loadAiReadme = useCallback(async () => {
    if (!repoId) {
      return;
    }

    setState((current) => ({ ...current, isAiLoading: true, aiError: undefined }));

    try {
      const aiReadme = await api.ai.getReadme(repoId);
      setState((current) => ({ ...current, aiReadme, isAiLoading: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isAiLoading: false,
        aiError: getErrorMessage(error, "Unable to load AI README"),
      }));
    }
  }, [repoId]);

  const registerRun = useCallback(
    async (portalUrl: string) => {
      if (!repoId) {
        throw new Error("Missing repo id");
      }

      const repo = await api.repos.run(repoId, portalUrl);
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

  return {
    repo: state.repo,
    aiReadme: state.aiReadme,
    isLoading: state.isLoading,
    isAiLoading: state.isAiLoading,
    error: state.error,
    aiError: state.aiError,
    refresh,
    loadAiReadme,
    registerRun,
    registerStop,
  };
}
