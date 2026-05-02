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

const IDLE_TERMINATE_DELAY_MS = 10 * 60 * 1000;

interface PodRegistryEntry {
  manager: PodLifecycleManager;
  snapshot: PodSnapshot;
  subscribers: Set<(snapshot: PodSnapshot) => void>;
  terminateTimer?: number;
}

const podRegistry = new Map<string, PodRegistryEntry>();

function shouldKeepPodWarm(snapshot: PodSnapshot) {
  return snapshot.state === "running" || snapshot.state === "installing";
}

function getPodEntry(repoId: string) {
  const existingEntry = podRegistry.get(repoId);

  if (existingEntry) {
    return existingEntry;
  }

  const entry: PodRegistryEntry = {
    manager: undefined as unknown as PodLifecycleManager,
    snapshot: createInitialPodSnapshot(repoId),
    subscribers: new Set(),
  };

  entry.manager = new PodLifecycleManager({
    repoId,
    apiKey: browserPodApiKey(),
    onSnapshot: (snapshot) => {
      entry.snapshot = snapshot;
      entry.subscribers.forEach((subscriber) => subscriber(snapshot));
    },
  });

  podRegistry.set(repoId, entry);
  return entry;
}

function cancelTerminate(entry: PodRegistryEntry) {
  if (entry.terminateTimer === undefined) {
    return;
  }

  window.clearTimeout(entry.terminateTimer);
  entry.terminateTimer = undefined;
}

function scheduleTerminate(repoId: string, entry: PodRegistryEntry) {
  if (entry.terminateTimer !== undefined || shouldKeepPodWarm(entry.snapshot)) {
    return;
  }

  entry.terminateTimer = window.setTimeout(() => {
    entry.terminateTimer = undefined;

    if (entry.subscribers.size > 0 || shouldKeepPodWarm(entry.snapshot)) {
      return;
    }

    podRegistry.delete(repoId);
    void entry.manager.terminate().catch((error: unknown) => {
      console.debug("[BrowserPod] scheduled cleanup failed:", error);
    });
  }, IDLE_TERMINATE_DELAY_MS);
}

export function usePod(repoId: string | undefined) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const fallbackRepoId = useRef(`temp-${crypto.randomUUID()}`);
  const currentRepoId = repoId ?? fallbackRepoId.current;
  const [snapshot, setSnapshot] = useState<PodSnapshot>(
    () => getPodEntry(currentRepoId).snapshot,
  );

  const getManager = useCallback(() => {
    const entry = getPodEntry(currentRepoId);
    cancelTerminate(entry);
    return entry.manager;
  }, [currentRepoId]);

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
    const entry = getPodEntry(currentRepoId);
    cancelTerminate(entry);
    podRegistry.delete(currentRepoId);
    await entry.manager.terminate();
  }, [currentRepoId]);

  useEffect(() => {
    const entry = getPodEntry(currentRepoId);
    cancelTerminate(entry);
    setSnapshot(entry.snapshot);
    entry.subscribers.add(setSnapshot);

    return () => {
      entry.subscribers.delete(setSnapshot);
      scheduleTerminate(currentRepoId, entry);
    };
  }, [currentRepoId]);

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
