import type {
  RepoProjectKind,
  RepoRuntimeSupportLevel,
  RunnabilityBlockerDetail,
  RunnabilityBlockerSeverity,
  RunnabilityResult,
  RuntimeCommandSuggestion,
  RuntimeSecurityEventCategory,
  SandboxSecurityEvent,
  SecurityScan,
  SecuritySeverity,
} from "@/types";

export function requiresSandboxConfirmation(security: SecurityScan | null | undefined) {
  return security?.riskLevel === "critical" || security?.riskLevel === "high";
}

export function runtimeRunLabel(runnability: RunnabilityResult | null | undefined) {
  switch (runnability?.runtimeProfile?.projectKind) {
    case "preview-app":
      return "Run preview in BrowserPod";
    case "api-server":
      return "Run API server in BrowserPod";
    default:
      return "Run in BrowserPod";
  }
}

export function runButtonLabel(security: SecurityScan | null | undefined, runnability?: RunnabilityResult | null) {
  return requiresSandboxConfirmation(security) ? "Run in BrowserPod sandbox anyway" : runnability ? runtimeRunLabel(runnability) : "Run";
}

function cleanCommand(command: string | null | undefined) {
  const trimmed = command?.trim();
  return trimmed ? trimmed : undefined;
}

export function getAutoPreviewCommand(runnability: RunnabilityResult | null | undefined) {
  if (!runnability?.canRun) {
    return undefined;
  }

  const profile = runnability.runtimeProfile;

  if (profile) {
    if (profile.supportLevel !== "auto-preview" || !profile.previewExpected) {
      return undefined;
    }

    return cleanCommand(profile.autoCommand) ?? cleanCommand(runnability.autoCommand);
  }

  return cleanCommand(runnability.autoCommand) ?? cleanCommand(runnability.entryPoint);
}

export function getManualCommands(runnability: RunnabilityResult | null | undefined): RuntimeCommandSuggestion[] {
  const commands = [
    ...(runnability?.runtimeProfile?.manualCommands ?? []),
    ...(runnability?.manualCommands ?? []),
  ];
  const seen = new Set<string>();

  return commands.filter((command) => {
    const value = cleanCommand(command.command);

    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

export function isPreviewCommand(runnability: RunnabilityResult | null | undefined, command: string) {
  const value = cleanCommand(command);

  if (!value) {
    return false;
  }

  const autoCommand = getAutoPreviewCommand(runnability);

  if (autoCommand === value || (runnability?.entryPoint && value === `npm run ${runnability.entryPoint}` && autoCommand === runnability.entryPoint)) {
    return true;
  }

  return getManualCommands(runnability).some((manualCommand) => {
    return cleanCommand(manualCommand.command) === value && manualCommand.previewExpected === true;
  });
}

export function isManualOnly(runnability: RunnabilityResult | null | undefined) {
  return runnability?.runtimeProfile?.supportLevel === "manual-only";
}

export function isAnalysisOnly(runnability: RunnabilityResult | null | undefined) {
  return runnability?.runtimeProfile?.supportLevel === "analysis-only";
}

export function projectKindLabel(kind: RepoProjectKind | undefined) {
  switch (kind) {
    case "preview-app":
      return "Preview app";
    case "api-server":
      return "API server";
    case "library":
      return "Library";
    case "cli":
      return "CLI";
    case "test-only":
      return "Test-only";
    default:
      return "Unknown";
  }
}

export function supportLevelLabel(level: RepoRuntimeSupportLevel | undefined) {
  switch (level) {
    case "auto-preview":
      return "Auto preview";
    case "manual-only":
      return "Manual only";
    case "analysis-only":
      return "Analysis only";
    default:
      return "Unknown support";
  }
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