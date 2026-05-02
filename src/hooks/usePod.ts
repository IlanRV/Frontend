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
  const fallbackRepoId = useRef(`temp-${crypto.randomUUID()}`);
  const [snapshot, setSnapshot] = useState<PodSnapshot>(
    createInitialPodSnapshot(repoId ?? fallbackRepoId.current),
  );

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new PodLifecycleManager({
        repoId: repoId ?? fallbackRepoId.current,
        apiKey: browserPodApiKey(),
        onSnapshot: setSnapshot,
      });
    }

    return managerRef.current;
  }, [repoId]);

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
    await managerRef.current?.terminate();
    managerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      void managerRef.current?.terminate();
      managerRef.current = null;
    };
  }, [repoId]);

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
