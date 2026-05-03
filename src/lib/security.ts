import type {
  RunnabilityBlockerDetail,
  RunnabilityResult,
  SandboxSecurityEvent,
  SecurityScan,
  SecuritySeverity,
} from "@/types";

export function requiresSandboxConfirmation(_security: SecurityScan | null | undefined) {
  throw new Error("Not implemented");
}

export function runButtonLabel(_security: SecurityScan | null | undefined) {
  throw new Error("Not implemented");
}

export function normalizeRunnabilityBlockers(_runnability: RunnabilityResult | null | undefined): RunnabilityBlockerDetail[] {
  throw new Error("Not implemented");
}

export function suspiciousLogEvent(_line: string): SandboxSecurityEvent | undefined {
  throw new Error("Not implemented");
}

export function severityRank(_severity: SecuritySeverity | "unknown") {
  throw new Error("Not implemented");
}