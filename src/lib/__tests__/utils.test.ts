import { describe, expect, it, vi } from "vitest";

import { cn, createClientId, formatDate, isRecord } from "@/lib/utils";

describe("cn", () => {
  it("merges conditional classes and resolves Tailwind conflicts", () => {
    const shouldHide = false;

    expect(cn("px-2 text-sm", shouldHide ? "hidden" : undefined, "px-4", { block: true })).toBe("text-sm px-4 block");
  });

  it("returns an empty string for empty inputs", () => {
    expect(cn(undefined, null, false)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats valid dates", () => {
    expect(formatDate("2026-05-02T10:20:30.000Z")).toMatch(/May 2, 2026/);
  });

  it("handles invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("Unknown date");
  });
});

describe("createClientId", () => {
  it("prefixes generated UUIDs", () => {
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    expect(createClientId("msg")).toBe("msg-00000000-0000-4000-8000-000000000001");
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({ key: "value" })).toBe(true);
  });

  it("rejects arrays, null, and primitives", () => {
    expect(isRecord(["value"])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("value")).toBe(false);
  });
});
