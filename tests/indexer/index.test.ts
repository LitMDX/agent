import { describe, it, expect, vi } from "vitest";
import { buildIndex } from "../../src/indexer/index.js";
import { makeTmpDocs, withFrontmatter } from "./fixtures.js";

// ---------------------------------------------------------------------------
// buildIndex — happy path
// ---------------------------------------------------------------------------

describe("buildIndex", () => {
  it("returns an empty map for a non-existent directory", () => {
    const index = buildIndex("/absolutely/nonexistent/path");
    expect(index.size).toBe(0);
  });

  it("returns an empty map for an empty directory", () => {
    const dir = makeTmpDocs({});
    const index = buildIndex(dir);
    expect(index.size).toBe(0);
  });

  it("indexes a single .mdx file at the root", () => {
    const dir = makeTmpDocs({
      "intro.mdx": withFrontmatter({ title: "Introduction", body: "Welcome." }),
    });
    const index = buildIndex(dir);
    expect(index.size).toBe(1);
    expect(index.has("/intro")).toBe(true);
  });

  it("indexes multiple .mdx files", () => {
    const dir = makeTmpDocs({
      "getting-started.mdx": withFrontmatter({ title: "Getting Started", body: "." }),
      "reference/cli.mdx": withFrontmatter({ title: "CLI Reference", body: "." }),
    });
    const index = buildIndex(dir);
    expect(index.size).toBe(2);
    expect(index.has("/getting-started")).toBe(true);
    expect(index.has("/reference/cli")).toBe(true);
  });

  it("indexes .md files alongside .mdx files", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "MDX Page", body: "." }),
      "notes.md": "# Notes\nContent.",
    });
    const index = buildIndex(dir);
    expect(index.size).toBe(2);
    expect(index.has("/notes")).toBe(true);
  });

  it("key matches PageEntry.path", () => {
    const dir = makeTmpDocs({
      "guide.mdx": withFrontmatter({ title: "Guide", body: "." }),
    });
    const index = buildIndex(dir);
    const entry = index.get("/guide")!;
    expect(entry.path).toBe("/guide");
  });

  // ── PageEntry fields ──────────────────────────────────────────────────────

  it("entry.title reflects frontmatter title", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "My Title", body: "Content." }),
    });
    const entry = buildIndex(dir).get("/page")!;
    expect(entry.title).toBe("My Title");
  });

  it("entry.description reflects frontmatter description", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "T", description: "Short desc", body: "." }),
    });
    const entry = buildIndex(dir).get("/page")!;
    expect(entry.description).toBe("Short desc");
  });

  it("entry.content does not contain raw frontmatter", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "T", body: "Hello world." }),
    });
    const entry = buildIndex(dir).get("/page")!;
    expect(entry.content).not.toContain("---");
    expect(entry.content).not.toContain("title:");
  });

  it("entry.raw is the original file source", () => {
    const src = withFrontmatter({ title: "T", body: "Raw content." });
    const dir = makeTmpDocs({ "page.mdx": src });
    const entry = buildIndex(dir).get("/page")!;
    expect(entry.raw).toBe(src);
  });

  // ── Nested directories ────────────────────────────────────────────────────

  it("recursively indexes files in nested directories", () => {
    const dir = makeTmpDocs({
      "a/b/c/deep.mdx": withFrontmatter({ title: "Deep", body: "." }),
    });
    const index = buildIndex(dir);
    expect(index.has("/a/b/c/deep")).toBe(true);
  });

  it("maps index.mdx files to their parent path", () => {
    const dir = makeTmpDocs({
      "section/index.mdx": withFrontmatter({ title: "Section", body: "." }),
    });
    const index = buildIndex(dir);
    expect(index.has("/section")).toBe(true);
    expect(index.has("/section/index")).toBe(false);
  });

  it("maps root index.mdx to /", () => {
    const dir = makeTmpDocs({
      "index.mdx": withFrontmatter({ title: "Home", body: "." }),
    });
    const index = buildIndex(dir);
    expect(index.has("/")).toBe(true);
  });

  // ── Non-matching files are ignored ────────────────────────────────────────

  it("ignores files with non-.mdx / non-.md extensions", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "T", body: "." }),
      "image.png": "binary",
      "config.json": "{}",
      "script.ts": "code",
    });
    const index = buildIndex(dir);
    expect(index.size).toBe(1);
  });

  // ── Console.warn for missing directory ───────────────────────────────────

  it("emits a console.warn for a non-existent directory", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    buildIndex("/does/not/exist");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("not found");
    warn.mockRestore();
  });
});
