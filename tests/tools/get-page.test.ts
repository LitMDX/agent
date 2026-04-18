import { describe, it, expect } from "vitest";
import type { DocsIndex } from "../../src/indexer/types.js";
import { getPageImpl, rawToMarkdown } from "../../src/tools/get-page.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndex(
  entries: Array<{ path: string; title: string; content?: string; raw?: string }>,
): DocsIndex {
  const index: DocsIndex = new Map();
  for (const e of entries) {
    index.set(e.path, {
      path: e.path,
      title: e.title,
      description: "",
      content: e.content ?? "",
      raw: e.raw ?? e.content ?? "",
    });
  }
  return index;
}

// ---------------------------------------------------------------------------
// getPageImpl — success cases
// ---------------------------------------------------------------------------

describe("getPageImpl — success", () => {
  it("strips frontmatter and returns clean markdown", () => {
    const raw = "---\ntitle: Introduction\n---\n\n# Introduction\n\nWelcome to the docs.";
    const index = makeIndex([{ path: "/intro", title: "Introduction", raw }]);
    const result = getPageImpl(index, "/intro");
    expect(result).not.toContain("---");
    expect(result).toContain("# Introduction");
    expect(result).toContain("Welcome to the docs.");
  });

  it("preserves headings and code blocks", () => {
    const raw = "# Guide\n\n## Step 1\n\n```bash\nnpm install\n```\n\n## Step 2\n\nDone.";
    const index = makeIndex([{ path: "/guide", title: "Guide", raw }]);
    const result = getPageImpl(index, "/guide");
    expect(result).toContain("## Step 1");
    expect(result).toContain("```bash");
    expect(result).toContain("## Step 2");
  });

  it("returns empty string when raw is empty", () => {
    const index = makeIndex([{ path: "/p", title: "T", raw: "" }]);
    expect(getPageImpl(index, "/p")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// rawToMarkdown — MDX stripping
// ---------------------------------------------------------------------------

describe("rawToMarkdown — frontmatter", () => {
  it("strips YAML frontmatter block", () => {
    const result = rawToMarkdown("---\ntitle: Foo\n---\n\n# Foo\n");
    expect(result).not.toContain("---");
    expect(result).toContain("# Foo");
  });

  it("returns content unchanged when no frontmatter present", () => {
    const result = rawToMarkdown("# Foo\n\nBar.");
    expect(result).toBe("# Foo\n\nBar.");
  });
});

describe("rawToMarkdown — imports", () => {
  it("strips MDX import lines", () => {
    const result = rawToMarkdown("import Foo from './Foo'\n\n# Page\n");
    expect(result).not.toContain("import");
    expect(result).toContain("# Page");
  });
});

describe("rawToMarkdown — Callout components", () => {
  it('converts <Callout type="note"> to **Note:** + content', () => {
    const result = rawToMarkdown('<Callout type="note">Remember to save.</Callout>');
    expect(result).toContain("**Note:**");
    expect(result).toContain("Remember to save.");
    expect(result).not.toContain("<Callout");
  });

  it('converts <Callout type="tip"> to **Tip:**', () => {
    const result = rawToMarkdown('<Callout type="tip">Use the CLI.</Callout>');
    expect(result).toContain("**Tip:**");
  });

  it('converts <Callout type="warning"> to **Warning:**', () => {
    const result = rawToMarkdown('<Callout type="warning">Deprecated API.</Callout>');
    expect(result).toContain("**Warning:**");
  });

  it('converts <Callout type="danger"> to **Danger:**', () => {
    const result = rawToMarkdown('<Callout type="danger">Breaking change.</Callout>');
    expect(result).toContain("**Danger:**");
  });

  it("preserves multi-line callout body", () => {
    const src = '<Callout type="note">\nLine one.\nLine two.\n</Callout>';
    const result = rawToMarkdown(src);
    expect(result).toContain("Line one.");
    expect(result).toContain("Line two.");
  });

  it("capitalises type label regardless of input case", () => {
    const result = rawToMarkdown('<Callout type="NOTE">Text.</Callout>');
    expect(result).toContain("**Note:**");
  });
});

describe("rawToMarkdown — remaining JSX tags", () => {
  it("strips self-closing JSX components", () => {
    const result = rawToMarkdown('Some text.\n\n<Badge variant="new" />\n\nMore text.');
    expect(result).not.toContain("<Badge");
    expect(result).toContain("Some text.");
    expect(result).toContain("More text.");
  });

  it("strips paired JSX components", () => {
    const result = rawToMarkdown("<Tabs>\n  <Tab>Content</Tab>\n</Tabs>");
    expect(result).not.toContain("<Tabs");
  });
});

// ---------------------------------------------------------------------------
// getPageImpl — error cases
// ---------------------------------------------------------------------------

describe("getPageImpl — error", () => {
  it("throws when page path does not exist", () => {
    const index = makeIndex([{ path: "/exists", title: "Exists" }]);
    expect(() => getPageImpl(index, "/missing")).toThrow();
  });

  it("error message includes the requested path", () => {
    const index = makeIndex([{ path: "/exists", title: "Exists" }]);
    expect(() => getPageImpl(index, "/not-found")).toThrowError("/not-found");
  });

  it("error message lists available paths", () => {
    const index = makeIndex([
      { path: "/alpha", title: "Alpha" },
      { path: "/beta", title: "Beta" },
    ]);
    expect(() => getPageImpl(index, "/missing")).toThrowError("/alpha");
  });

  it("throws with empty index and mentions no pages indexed", () => {
    const index = makeIndex([]);
    expect(() => getPageImpl(index, "/any")).toThrowError("no pages indexed");
  });
});
