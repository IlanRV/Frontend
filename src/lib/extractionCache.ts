import { isRecord } from "@/lib/utils";
import type { ExtractionResponse } from "@/types";

const CACHE_PREFIX = "devhub:extraction:";

function cacheKey(repoId: string) {
  return `${CACHE_PREFIX}${repoId}`;
}

function normalizeExtraction(value: unknown): ExtractionResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const extractionId = typeof value.extractionId === "string" ? value.extractionId : undefined;
  const status = typeof value.status === "string" ? value.status : undefined;

  if (!extractionId || !status) {
    return undefined;
  }

  return {
    success: value.success !== false,
    extractionId,
    status: status as ExtractionResponse["status"],
    aiReadmeStatus: typeof value.aiReadmeStatus === "string" ? value.aiReadmeStatus : null,
    techStack: isRecord(value.techStack) ? (value.techStack as unknown as ExtractionResponse["techStack"]) : null,
    overview: isRecord(value.overview) ? (value.overview as unknown as ExtractionResponse["overview"]) : null,
    functions: Array.isArray(value.functions) ? (value.functions as ExtractionResponse["functions"]) : [],
    dependencies: isRecord(value.dependencies) ? (value.dependencies as Record<string, string>) : {},
    security: isRecord(value.security) ? (value.security as unknown as ExtractionResponse["security"]) : null,
    aiReadme: typeof value.aiReadme === "string" && value.aiReadme.trim().length > 0 ? value.aiReadme : null,
    runnability: isRecord(value.runnability)
      ? (value.runnability as unknown as ExtractionResponse["runnability"])
      : null,
    analysisUpdatedAt: typeof value.analysisUpdatedAt === "string" ? value.analysisUpdatedAt : null,
    analysisModel: typeof value.analysisModel === "string" ? value.analysisModel : null,
    analysisError: typeof value.analysisError === "string" ? value.analysisError : null,
    cached: typeof value.cached === "boolean" ? value.cached : undefined,
    deduped: typeof value.deduped === "boolean" ? value.deduped : undefined,
  };
}

export function loadCachedExtraction(repoId: string | undefined) {
  if (!repoId) {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey(repoId));
    return raw ? normalizeExtraction(JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCachedExtraction(repoId: string | undefined, extraction: ExtractionResponse) {
  if (!repoId) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey(repoId), JSON.stringify(extraction));
  } catch {
    // Cache misses are harmless; the backend stores canonical extraction results.
  }
}