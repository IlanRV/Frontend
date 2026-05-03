import type {
  RunnabilityBlockerDetail,
  RunnabilityBlockerSeverity,
  RunnabilityResult,
  RuntimeSecurityEventCategory,
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

function normalizeBlockerSeverity(severity: RunnabilityBlockerSeverity | string | undefined): RunnabilityBlockerSeverity {
  if (
    severity === "critical" ||
    severity === "high" ||
    severity === "medium" ||
    severity === "low" ||
    severity === "info" ||
    severity === "warning" ||
    severity === "error"
  ) {
    return severity;
  }

  return "unknown";
}

export function normalizeRunnabilityBlockers(runnability: RunnabilityResult | null | undefined): RunnabilityBlockerDetail[] {
  if (!runnability || runnability.canRun) {
    return [];
  }

  if (runnability.blockerDetails?.length) {
    return runnability.blockerDetails.map((blocker) => ({
      ...blocker,
      severity: normalizeBlockerSeverity(blocker.severity),
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
  const checks: Array<{
    pattern: RegExp;
    severity: SecuritySeverity;
    phase: SandboxSecurityEvent["phase"];
    category: RuntimeSecurityEventCategory;
    title: string;
    description: string;
  }> = [
    {
      pattern: /rm\s+-rf|unlink\s+-rf|rmdir\s+.*home/,
      severity: "critical",
      phase: "runtime",
      category: "filesystem",
      title: "Destructive filesystem command detected",
      description: "The sandbox logs included a destructive filesystem command. The command is isolated to BrowserPod's virtual filesystem.",
    },
    {
      pattern: /(?:\.ssh|\.aws|\.npmrc|\.gitconfig|id_rsa|aws_access_key)/,
      severity: "high",
      phase: "runtime",
      category: "filesystem",
      title: "Suspicious credential path access",
      description: "The sandbox logs referenced sensitive credential paths. BrowserPod isolates these paths from the real machine.",
    },
    {
      pattern: /xmrig|coinhive|stratum|cryptominer|crypto miner/,
      severity: "critical",
      phase: "runtime",
      category: "resource",
      title: "Mining-related runtime log",
      description: "The sandbox logs referenced cryptocurrency mining behavior. BrowserPod contains this activity inside the sandbox.",
    },
    {
      pattern: /(?:curl|wget|fetch\(|https?:\/\/|beacon|telemetry|exfiltrat)/,
      severity: "medium",
      phase: "runtime",
      category: "network",
      title: "Suspicious network activity",
      description: "The project attempted network activity that may be telemetry, beaconing, or exfiltration. BrowserPod networking is proxied.",
    },
    {
      pattern: /child_process|spawn\(|exec\(|execfile\(/,
      severity: "medium",
      phase: "runtime",
      category: "process",
      title: "Process execution API mentioned in sandbox log",
      description: "The sandbox logs referenced process execution APIs. Review this behavior before trusting the project.",
    },
    {
      pattern: /eval\s*\(|atob\s*\(|fromcharcode|base64/,
      severity: "medium",
      phase: "runtime",
      category: "runtime",
      title: "Obfuscation pattern in sandbox log",
      description: "The sandbox logs referenced obfuscation patterns. This is suspicious but not confirmed malware by itself.",
    },
  ];

  const match = checks.find((check) => check.pattern.test(normalized));

  if (!match) {
    return undefined;
  }

  return {
    id: crypto.randomUUID(),
    code: "suspicious-log",
    source: "browserpod",
    phase: match.phase,
    category: match.category,
    severity: match.severity,
    title: match.title,
    description: match.description,
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