import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { CreateWorkspacePayload, Repo, Workspace } from "@/types";

interface AsyncState<T> {
  data?: T;
  error?: string;
  isLoading: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useWorkspaces() {
  const [state, setState] = useState<AsyncState<Workspace[]>>({
    isLoading: true,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: undefined }));

    try {
      const workspaces = await api.workspaces.list();
      setState({ data: workspaces, isLoading: false });
    } catch (error) {
      setState({
        data: undefined,
        isLoading: false,
        error: getErrorMessage(error, "Unable to load workspaces"),
      });
    }
  }, []);

  const createWorkspace = useCallback(async (payload: CreateWorkspacePayload) => {
    const workspace = await api.workspaces.create(payload);
    setState((current) => ({
      ...current,
      data: current.data ? [workspace, ...current.data] : [workspace],
    }));
    return workspace;
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
  };
}

export function useWorkspace(workspaceId: string | undefined) {
  const [state, setState] = useState<AsyncState<Workspace>>({
    isLoading: Boolean(workspaceId),
  });

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setState({ isLoading: false, error: "Missing workspace id" });
      return;
    }

    setState((current) => ({ ...current, isLoading: true, error: undefined }));

    try {
      const workspace = await api.workspaces.get(workspaceId);
      setState({ data: workspace, isLoading: false });
    } catch (error) {
      setState({
        data: undefined,
        isLoading: false,
        error: getErrorMessage(error, "Unable to load workspace"),
      });
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    workspace: state.data,
    repos: state.data?.repos ?? [],
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    addRepo,
    updateRepo,
  };
}
