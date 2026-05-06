import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { Repo, Workspace } from "@/types";

const ACTIVE_REPO_STATUSES = new Set(["cloning", "analyzing"]);
export const WORKSPACE_LIMIT = 3;

interface AsyncState<T> {
  data?: T;
  error?: string;
  isLoading: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readSessionCache<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSessionCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage may be full or unavailable — non-critical.
  }
}

export function useWorkspaces() {
  const cacheKey = "devhub:workspaces";
  const [state, setState] = useState<AsyncState<Workspace[]>>(() => {
    const cached = readSessionCache<Workspace[]>(cacheKey);
    return {
      data: cached,
      isLoading: !cached,
    };
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: !current.data, error: undefined }));

    try {
      const workspaces = await api.workspaces.list();
      writeSessionCache(cacheKey, workspaces);
      setState({ data: workspaces, isLoading: false });
    } catch (error) {
      setState((current) => ({
        data: current.data,
        isLoading: false,
        error: getErrorMessage(error, "Unable to load workspaces"),
      }));
    }
  }, []);

  const createWorkspace = useCallback(async (payload: { name: string; description: string }) => {
    const workspace = await api.workspaces.create(payload);
    setState((current) => ({
      ...current,
      data: current.data ? [workspace, ...current.data] : [workspace],
    }));
    return workspace;
  }, []);

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    await api.workspaces.delete(workspaceId);
    setState((current) => ({
      ...current,
      data: current.data?.filter((workspace) => workspace.id !== workspaceId),
    }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    workspaces: state.data ?? [],
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    createWorkspace,
    deleteWorkspace,
  };
}

export function useWorkspace(workspaceId: string | undefined) {
  const cacheKey = workspaceId ? `devhub:workspace:${workspaceId}` : "";
  const [state, setState] = useState<AsyncState<Workspace>>(() => {
    const cached = cacheKey ? readSessionCache<Workspace>(cacheKey) : undefined;
    return {
      data: cached,
      isLoading: Boolean(workspaceId) && !cached,
    };
  });

  useEffect(() => {
    const cached = cacheKey ? readSessionCache<Workspace>(cacheKey) : undefined;
    setState({
      data: cached,
      isLoading: Boolean(workspaceId) && !cached,
    });
  }, [cacheKey, workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setState({ isLoading: false, error: "Missing workspace id" });
      return;
    }

    setState((current) => ({ ...current, isLoading: !current.data, error: undefined }));

    try {
      const workspace = await api.workspaces.get(workspaceId);
      writeSessionCache(`devhub:workspace:${workspaceId}`, workspace);
      setState({ data: workspace, isLoading: false });
    } catch (error) {
      setState((current) => ({
        data: current.data,
        isLoading: false,
        error: getErrorMessage(error, "Unable to load workspace"),
      }));
    }
  }, [workspaceId]);

  const addRepo = useCallback(
    async (githubUrl: string) => {
      if (!workspaceId) {
        throw new Error("Missing workspace id");
      }

      const repo = await api.repos.add(workspaceId, { githubUrl });
      setState((current) => {
        if (!current.data) {
          return current;
        }

        const repos = [repo, ...(current.data.repos ?? [])];

        return {
          ...current,
          data: {
            ...current.data,
            repos,
            repoCount: repos.length,
          },
        };
      });
      return repo;
    },
    [workspaceId],
  );

  const updateRepo = useCallback((repo: Repo) => {
    setState((current) => {
      if (!current.data) {
        return current;
      }

      const repos = (current.data.repos ?? []).map((existingRepo) =>
        existingRepo.id === repo.id ? repo : existingRepo,
      );

      return {
        ...current,
        data: {
          ...current.data,
          repos,
        },
      };
    });
  }, []);

  const deleteRepo = useCallback(
    async (repoId: string) => {
      if (!workspaceId) {
        throw new Error("Missing workspace id");
      }

      await api.repos.deleteFromWorkspace(workspaceId, repoId);
      setState((current) => {
        if (!current.data) {
          return current;
        }

        const repos = (current.data.repos ?? []).filter((repo) => repo.id !== repoId && repo.repoId !== repoId);

        return {
          ...current,
          data: {
            ...current.data,
            repos,
            repoCount: repos.length,
          },
        };
      });
    },
    [workspaceId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const hasActiveRepo = (state.data?.repos ?? []).some((repo) => ACTIVE_REPO_STATUSES.has(repo.status));

    if (!hasActiveRepo) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [refresh, state.data?.repos]);

  return {
    workspace: state.data,
    repos: state.data?.repos ?? [],
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    addRepo,
    updateRepo,
    deleteRepo,
  };
}
