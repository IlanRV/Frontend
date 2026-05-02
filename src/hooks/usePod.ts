import { useCallback, useEffect, useRef, useState } from "react";

import {
  createInitialPodSnapshot,
  PodLifecycleManager,
} from "@/lib/browserpod";
import type { FileTreeNode, PodSnapshot, RunnabilityResult } from "@/types";

interface BootstrapResult {
  fileTree: FileTreeNode;
  runnability: RunnabilityResult;
}

function browserPodApiKey() {
  return import.meta.env.VITE_BP_APIKEY ?? "";
}

export function usePod(repoId: string | undefined) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<PodLifecycleManager | null>(null);
  const terminateTimerRef = useRef<number | undefined>();
  const fallbackRepoId = useRef(`temp-${crypto.randomUUID()}`);
  const managerRepoIdRef = useRef(repoId ?? fallbackRepoId.current);
  const [snapshot, setSnapshot] = useState<PodSnapshot>(
    createInitialPodSnapshot(repoId ?? fallbackRepoId.current),
  );

  const cancelPendingTerminate = useCallback(() => {
    if (terminateTimerRef.current === undefined) {
      return;
    }

    window.clearTimeout(terminateTimerRef.current);
    terminateTimerRef.current = undefined;
  }, []);

  const getManager = useCallback(() => {
    cancelPendingTerminate();

    const nextRepoId = repoId ?? fallbackRepoId.current;

    if (managerRef.current && managerRepoIdRef.current !== nextRepoId) {
      void managerRef.current.terminate().catch((error: unknown) => {
        console.debug("[BrowserPod] previous manager cleanup failed:", error);
      });
      managerRef.current = null;
    }

    if (!managerRef.current) {
      managerRepoIdRef.current = nextRepoId;
      managerRef.current = new PodLifecycleManager({
        repoId: nextRepoId,
        apiKey: browserPodApiKey(),
        onSnapshot: setSnapshot,
      });
    }

    return managerRef.current;
  }, [cancelPendingTerminate, repoId]);

  const scheduleTerminate = useCallback(() => {
    if (terminateTimerRef.current !== undefined || !managerRef.current) {
      return;
    }

    const manager = managerRef.current;

    terminateTimerRef.current = window.setTimeout(() => {
      terminateTimerRef.current = undefined;

      if (managerRef.current === manager) {
        managerRef.current = null;
      }

      void manager.terminate().catch((error: unknown) => {
        console.debug("[BrowserPod] scheduled cleanup failed:", error);
      });
    }, 500);
  }, []);

  const boot = useCallback(async () => {
    if (!terminalRef.current) {
      throw new Error("Terminal host is not mounted yet");
    }

    return getManager().boot(terminalRef.current);
  }, [getManager]);

  const bootstrapRepo = useCallback(
    async (repoUrl: string): Promise<BootstrapResult> => {
      await boot();
      return getManager().cloneRepo(repoUrl);
    },
    [boot, getManager],
  );

  const readFile = useCallback(
    async (path: string) => {
      return getManager().readRepoFile(path);
    },
    [getManager],
  );

  const refreshFileTree = useCallback(async () => {
    return getManager().refreshFileTree();
  }, [getManager]);

  const checkRunnability = useCallback(async () => {
    return getManager().checkRunnability();
  }, [getManager]);

  const collectAiExtractionPayload = useCallback(
    async (fileTree: FileTreeNode) => {
      return getManager().collectAiExtractionPayload(fileTree);
    },
    [getManager],
  );

  const runProject = useCallback(
    async (entryPoint: NonNullable<RunnabilityResult["entryPoint"]>) => {
      return getManager().runProject(entryPoint);
    },
    [getManager],
  );

  const stopProject = useCallback(async () => {
    return getManager().stopProject();
  }, [getManager]);

  const terminate = useCallback(async () => {
    cancelPendingTerminate();

    const manager = managerRef.current;
    managerRef.current = null;
    await manager?.terminate();
  }, [cancelPendingTerminate]);

  useEffect(() => {
    cancelPendingTerminate();

    return () => {
      scheduleTerminate();
    };
  }, [cancelPendingTerminate, scheduleTerminate]);

  return {
    terminalRef,
    snapshot,
    boot,
    bootstrapRepo,
    readFile,
    refreshFileTree,
    checkRunnability,
    collectAiExtractionPayload,
    runProject,
    stopProject,
    terminate,
  };
}
