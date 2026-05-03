import type {
  RunnabilityBlockerDetail,
  RunnabilityResult,
  SandboxSecurityEvent,
  SecurityScan,
  SecuritySeverity,
} from "@/types";

export function requiresSandboxConfirmation(security: SecurityScan | null | undefined) {
  return security?.riskLevel === "critical" || security?.riskLevel === "high";
}

export function runButtonLabel(security: SecurityScan | null | undefined) {
  return requiresSandboxConfirmation(security) ? "Run in BrowserPod sandbox anyway" : "Run";
}

export function normalizeRunnabilityBlockers(runnability: RunnabilityResult | null | undefined): RunnabilityBlockerDetail[] {
  if (!runnability || runnability.canRun) {
    return [];
  }

  if (runnability.blockerDetails?.length) {
    return runnability.blockerDetails.map((blocker) => ({
      ...blocker,
      severity: blocker.severity ?? "unknown",
      evidence: blocker.evidence ?? null,
    }));
  }

  return (runnability.blockers ?? []).map((blocker, index) => ({
    code: `legacy-blocker-${index + 1}`,
    severity: "medium",
    title: "Cannot start automatically",
    description: blocker,
    recommendation: "Review the project startup scripts or add a safe npm dev/start/serve script.",
    evidence: null,
  }));
}

export function suspiciousLogEvent(line: string): SandboxSecurityEvent | undefined {
  const normalized = line.toLowerCase();
  const checks: Array<{ pattern: RegExp; severity: SecuritySeverity; title: string }> = [
    { pattern: /xmrig|coinhive|stratum|cryptominer|crypto miner/, severity: "critical", title: "Mining-related runtime log" },
    { pattern: /(?:\.ssh|\.aws|\.npmrc|\.gitconfig|id_rsa|aws_access_key)/, severity: "high", title: "Credential path access in sandbox log" },
    { pattern: /rm\s+-rf|unlink\s+-rf|rmdir\s+.*home/, severity: "high", title: "Destructive filesystem command in sandbox log" },
    { pattern: /(?:curl|wget)[^|;&]*(?:\|\s*(?:bash|sh)|bash\s+-c|sh\s+-c)/, severity: "high", title: "Pipe-to-shell download pattern in sandbox log" },
    { pattern: /child_process|spawn\(|exec\(|execfile\(/, severity: "medium", title: "Process execution API mentioned in sandbox log" },
    { pattern: /eval\s*\(|atob\s*\(|fromcharcode|base64/, severity: "medium", title: "Obfuscation pattern in sandbox log" },
  ];

  const match = checks.find((check) => check.pattern.test(normalized));

  if (!match) {
    return undefined;
  }

  return {
    id: crypto.randomUUID(),
    code: "suspicious-log",
    severity: match.severity,
    title: match.title,
    description: "BrowserPod observed a suspicious runtime log. This is a sandbox warning, not confirmed malware by itself.",
    evidence: line.slice(0, 500),
    createdAt: new Date().toISOString(),
  };
}

export function severityRank(severity: SecuritySeverity | "unknown") {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}