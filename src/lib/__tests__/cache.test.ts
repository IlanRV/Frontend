import { describe, expect, it, vi } from "vitest";

import { loadCachedExtraction, saveCachedExtraction } from "@/lib/extractionCache";
import { loadCachedFileTree, saveCachedFileTree } from "@/lib/fileTreeCache";
import { makeExtraction, makeFileTree } from "@/test/factories";

describe("extraction cache", () => {
  it("stores and loads normalized extraction responses", () => {
    const extraction = makeExtraction({ cached: true });

    saveCachedExtraction("repo-1", extraction);

    expect(loadCachedExtraction("repo-1")).toMatchObject({
      extractionId: "extraction-1",
      status: "ready",
      cached: true,
      functions: expect.arrayContaining([expect.objectContaining({ name: "loadRepo" })]),
    });
  });

  it("returns undefined for missing ids, bad JSON, and invalid payloads", () => {
    expect(loadCachedExtraction(undefined)).toBeUndefined();

    window.localStorage.setItem("devhub:extraction:bad", "{");
    expect(loadCachedExtraction("bad")).toBeUndefined();

    window.localStorage.setItem("devhub:extraction:invalid", JSON.stringify({ status: "ready" }));
    expect(loadCachedExtraction("invalid")).toBeUndefined();
  });

  it("ignores localStorage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => saveCachedExtraction("repo-1", makeExtraction())).not.toThrow();
    expect(() => saveCachedExtraction(undefined, makeExtraction())).not.toThrow();
  });
});

describe("file tree cache", () => {
  it("stores and loads normalized file trees", () => {
    const tree = makeFileTree();

    saveCachedFileTree("repo-1", tree);

    expect(loadCachedFileTree("repo-1")).toMatchObject({
      name: "repo",
      type: "directory",
      children: expect.arrayContaining([expect.objectContaining({ path: "README.md" })]),
    });
  });

  it("filters invalid child nodes and bad payloads", () => {
    window.localStorage.setItem(
      "devhub:file-tree:repo-1",
      JSON.stringify({
        name: "repo",
        path: "",
        type: "directory",
        children: [{ bad: true }, { name: "index.ts", path: "index.ts", type: "file" }],
      }),
    );

    expect(loadCachedFileTree("repo-1")?.children).toEqual([
      expect.objectContaining({ name: "index.ts", path: "index.ts" }),
    ]);

    window.localStorage.setItem("devhub:file-tree:repo-2", "{");
    expect(loadCachedFileTree("repo-2")).toBeUndefined();
    expect(loadCachedFileTree(undefined)).toBeUndefined();
  });

  it("ignores file tree write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => saveCachedFileTree("repo-1", makeFileTree())).not.toThrow();
    expect(() => saveCachedFileTree(undefined, makeFileTree())).not.toThrow();
  });
});
