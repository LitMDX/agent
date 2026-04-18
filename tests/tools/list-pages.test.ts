import { describe, it, expect } from "vitest";
import type { DocsIndex } from "../../src/indexer/types.js";
import { listPagesImpl } from "../../src/tools/list-pages.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndex(
  entries: Array<{ path: string; title: string; description?: string }>,
): DocsIndex {
  const index: DocsIndex = new Map();
  for (const e of entries) {
    index.set(e.path, {
      path: e.path,
      title: e.title,
      description: e.description ?? "",
      content: "",
      raw: "",
    });
  }
  return index;
}

// ---------------------------------------------------------------------------
// listPagesImpl
// ---------------------------------------------------------------------------

describe("listPagesImpl", () => {
  it("returns a JSON array", () => {
    const index = makeIndex([{ path: "/intro", title: "Intro" }]);
    const result = JSON.parse(listPagesImpl(index));
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns one entry per page in the index", () => {
    const index = makeIndex([
      { path: "/a", title: "A" },
      { path: "/b", title: "B" },
      { path: "/c", title: "C" },
    ]);
    const result = JSON.parse(listPagesImpl(index));
    expect(result).toHaveLength(3);
  });

  it("each entry has path, title, and description fields", () => {
    const index = makeIndex([{ path: "/guide", title: "Guide", description: "A guide." }]);
    const [entry] = JSON.parse(listPagesImpl(index));
    expect(entry).toHaveProperty("path", "/guide");
    expect(entry).toHaveProperty("title", "Guide");
    expect(entry).toHaveProperty("description", "A guide.");
  });

  it("does not include content or raw fields", () => {
    const index = makeIndex([{ path: "/p", title: "P" }]);
    const [entry] = JSON.parse(listPagesImpl(index));
    expect(entry).not.toHaveProperty("content");
    expect(entry).not.toHaveProperty("raw");
  });

  it("returns an empty array for an empty index", () => {
    const index = makeIndex([]);
    const result = JSON.parse(listPagesImpl(index));
    expect(result).toEqual([]);
  });
});
