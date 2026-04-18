import { describe, it, expect } from "vitest";
import { walkMdx } from "../../src/indexer/walker.js";
import { makeTmpDocs } from "./fixtures.js";

// ---------------------------------------------------------------------------
// walkMdx
// ---------------------------------------------------------------------------

describe("walkMdx", () => {
  it("yields .mdx files at the root level", () => {
    const dir = makeTmpDocs({
      "getting-started.mdx": "# Hello",
      "intro.mdx": "# Intro",
    });

    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".mdx"))).toBe(true);
  });

  it("yields .md files at the root level", () => {
    const dir = makeTmpDocs({
      "README.md": "# Readme",
    });

    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/README\.md$/);
  });

  it("yields both .mdx and .md files", () => {
    const dir = makeTmpDocs({
      "page.mdx": "# MDX",
      "notes.md": "# MD",
    });

    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(2);
  });

  it("recurses into sub-directories", () => {
    const dir = makeTmpDocs({
      "index.mdx": "# Root",
      "reference/cli.mdx": "# CLI",
      "reference/api.mdx": "# API",
    });

    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(3);
  });

  it("recurses into deeply nested directories", () => {
    const dir = makeTmpDocs({
      "a/b/c/deep.mdx": "# Deep",
    });

    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("deep.mdx");
  });

  it("skips files with other extensions", () => {
    const dir = makeTmpDocs({
      "page.mdx": "# MDX",
      "ignored.txt": "plain text",
      "also-ignored.ts": "code",
      "image.png": "binary",
    });

    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/page\.mdx$/);
  });

  it("returns absolute paths", () => {
    const dir = makeTmpDocs({ "page.mdx": "# Page" });

    const files = [...walkMdx(dir)];
    expect(files[0]).toMatch(/^\//);
  });

  it("returns an empty iterator for an empty directory", () => {
    const dir = makeTmpDocs({});
    const files = [...walkMdx(dir)];
    expect(files).toHaveLength(0);
  });

  it("does not yield directory paths themselves", () => {
    const dir = makeTmpDocs({
      "sub/page.mdx": "# Page",
    });

    const files = [...walkMdx(dir)];
    expect(files.every((f) => !f.endsWith("/"))).toBe(true);
    expect(files.every((f) => f.endsWith(".mdx") || f.endsWith(".md"))).toBe(true);
  });
});
