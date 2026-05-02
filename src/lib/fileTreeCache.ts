import { isRecord } from "@/lib/utils";
import type { FileTreeNode } from "@/types";

const CACHE_PREFIX = "devhub:file-tree:";

function cacheKey(repoId: string) {
  return `${CACHE_PREFIX}${repoId}`;
}

function normalizeFileTree(value: unknown): FileTreeNode | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = typeof value.name === "string" ? value.name : undefined;
  const path = typeof value.path === "string" ? value.path : undefined;
  const type = value.type === "file" || value.type === "directory" ? value.type : undefined;

  if (!name || path === undefined || !type) {
    return undefined;
  }

  const children = Array.isArray(value.children)
    ? value.children
        .map((child) => normalizeFileTree(child))
        .filter((child): child is FileTreeNode => Boolean(child))
    : undefined;

  return {
    name,
    path,
    type,
    children,
    extension: typeof value.extension === "string" ? value.extension : undefined,
    size: typeof value.size === "number" ? value.size : undefined,
    supported: typeof value.supported === "boolean" ? value.supported : undefined,
  };
}

export function loadCachedFileTree(repoId: string | undefined) {
  if (!repoId) {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey(repoId));
    return raw ? normalizeFileTree(JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCachedFileTree(repoId: string | undefined, fileTree: FileTreeNode) {
  if (!repoId) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey(repoId), JSON.stringify(fileTree));
  } catch {
    // Cache misses are harmless; BrowserPod/backend can still provide the tree.
  }
}
