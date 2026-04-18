import { describe, it, expect } from "vitest";
import type { DocsIndex } from "../../src/indexer/types.js";
import { searchDocsImpl } from "../../src/tools/search-docs.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndex(
  entries: Array<{ path: string; title: string; description?: string; content?: string }>,
): DocsIndex {
  const index: DocsIndex = new Map();
  for (const e of entries) {
    index.set(e.path, {
      path: e.path,
      title: e.title,
      description: e.description ?? "",
      content: e.content ?? "",
      raw: "",
    });
  }
  return index;
}

// ---------------------------------------------------------------------------
// searchDocsImpl — matching
// ---------------------------------------------------------------------------

describe("searchDocsImpl — matching", () => {
  it("returns results matching query in title", () => {
    const index = makeIndex([
      { path: "/guide", title: "Getting Started", content: "Install the SDK." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "getting started"));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/guide");
    expect(results[0].title).toBe("Getting Started");
  });

  it("returns results matching query in description", () => {
    const index = makeIndex([
      { path: "/faq", title: "FAQ", description: "Frequently asked questions about config." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "frequently asked"));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/faq");
  });

  it("returns results matching query in content", () => {
    const index = makeIndex([
      {
        path: "/ref",
        title: "Reference",
        content: "Use the bedrockModel option to configure the model.",
      },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "bedrockmodel"));
    expect(results).toHaveLength(1);
    expect(results[0].excerpt).toContain("bedrockModel");
  });

  it("is case-insensitive", () => {
    const index = makeIndex([{ path: "/p", title: "Authentication", content: "Auth setup." }]);
    const upper = JSON.parse(searchDocsImpl(index, "AUTHENTICATION"));
    expect(upper).toHaveLength(1);
  });

  it("returns no-results message when nothing matches", () => {
    const index = makeIndex([{ path: "/p", title: "Hello", content: "World" }]);
    const result = JSON.parse(searchDocsImpl(index, "nonexistent query xyz"));
    expect(result).toHaveProperty("message");
    expect(result.message).toContain("nonexistent query xyz");
  });

  it("returns empty result message for empty index", () => {
    const index = makeIndex([]);
    const result = JSON.parse(searchDocsImpl(index, "anything"));
    expect(result).toHaveProperty("message");
  });
});

// ---------------------------------------------------------------------------
// searchDocsImpl — result shape
// ---------------------------------------------------------------------------

describe("searchDocsImpl — result shape", () => {
  it("each result has path, title, and excerpt fields", () => {
    const index = makeIndex([
      { path: "/intro", title: "Intro", content: "Some intro content here." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "intro content"));
    expect(results[0]).toHaveProperty("path");
    expect(results[0]).toHaveProperty("title");
    expect(results[0]).toHaveProperty("excerpt");
  });

  it("uses description as excerpt when match is only in title or description", () => {
    const index = makeIndex([
      { path: "/p", title: "Target Page", description: "Desc text", content: "Unrelated body." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "target page"));
    expect(results[0].excerpt).toBe("Desc text");
  });

  it("uses content excerpt when match is in content", () => {
    const index = makeIndex([
      {
        path: "/p",
        title: "Page",
        description: "Short desc",
        content: "The quick brown fox jumps over the lazy dog.",
      },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "quick brown fox"));
    expect(results[0].excerpt).toContain("quick brown fox");
  });
});

// ---------------------------------------------------------------------------
// searchDocsImpl — limit parameter
// ---------------------------------------------------------------------------

describe("searchDocsImpl — limit parameter", () => {
  it("defaults to 5 results", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      path: `/page-${i}`,
      title: `Common Title ${i}`,
      content: "searchable content",
    }));
    const index = makeIndex(entries);
    const results = JSON.parse(searchDocsImpl(index, "searchable"));
    expect(results).toHaveLength(5);
  });

  it("respects custom limit below default", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      path: `/page-${i}`,
      title: `Item ${i}`,
      content: "findable text",
    }));
    const index = makeIndex(entries);
    const results = JSON.parse(searchDocsImpl(index, "findable", 2));
    expect(results).toHaveLength(2);
  });

  it("respects custom limit above default", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      path: `/page-${i}`,
      title: `Item ${i}`,
      content: "findable text",
    }));
    const index = makeIndex(entries);
    const results = JSON.parse(searchDocsImpl(index, "findable", 10));
    expect(results).toHaveLength(10);
  });

  it("returns fewer results than limit when not enough matches", () => {
    const index = makeIndex([
      { path: "/a", title: "Alpha", content: "unique term" },
      { path: "/b", title: "Beta", content: "other content" },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "unique term", 5));
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// searchDocsImpl — multi-word tokenised queries
// ---------------------------------------------------------------------------

describe("searchDocsImpl — multi-word tokenised queries", () => {
  it("matches when only one token is found (OR semantics across tokens)", () => {
    // "webmcp en litmdx": "en" is short (< 3 chars), "webmcp" and "litmdx" are tokens.
    // The WebMCP page only contains "webmcp" — it must still be returned.
    const index = makeIndex([
      { path: "/features/webmcp", title: "WebMCP", description: "Expose docs as MCP tools." },
      { path: "/intro", title: "Getting Started", description: "How to create a project." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "webmcp en litmdx"));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/features/webmcp");
  });

  it("drops stopword-length tokens (< 3 chars) from matching", () => {
    // "en" (2 chars) should be dropped; only "cli" (3 chars) should be used.
    const index = makeIndex([
      { path: "/cli", title: "CLI Reference", description: "Command line interface." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "cli en"));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/cli");
  });

  it("ranks title matches above content-only matches", () => {
    const index = makeIndex([
      {
        path: "/content-match",
        title: "Unrelated Page",
        content: "This mentions webmcp somewhere in the text.",
      },
      { path: "/title-match", title: "WebMCP Feature", description: "Native browser MCP API." },
    ]);
    const results = JSON.parse(searchDocsImpl(index, "webmcp feature"));
    // title-match has title hit (score 6) vs content-match's content hit (score 1)
    expect(results[0].path).toBe("/title-match");
  });

  it("falls back to full query as token when all tokens are < 3 chars", () => {
    // "ok" is only 2 chars; effectiveTokens falls back to ["ok"]
    const index = makeIndex([{ path: "/status", title: "Status", content: "Everything is ok." }]);
    const results = JSON.parse(searchDocsImpl(index, "ok"));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/status");
  });

  it("returns no results when no token matches any page", () => {
    const index = makeIndex([{ path: "/p", title: "Hello", content: "World" }]);
    const result = JSON.parse(searchDocsImpl(index, "nonexistent xyz"));
    expect(result).toHaveProperty("message");
  });
});
