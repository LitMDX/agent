import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseMdx } from "../../src/indexer/parser.js";
import { makeTmpDocs, withFrontmatter } from "./fixtures.js";

// ---------------------------------------------------------------------------
// parseMdx — frontmatter
// ---------------------------------------------------------------------------

describe("parseMdx — frontmatter", () => {
  it("extracts title from frontmatter", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "My Page", body: "Some content." }),
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.title).toBe("My Page");
  });

  it("extracts description from frontmatter", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "T", description: "A great page", body: "." }),
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.description).toBe("A great page");
  });

  it("description is empty string when absent from frontmatter", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "T", body: "." }),
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.description).toBe("");
  });

  it("strips frontmatter from content", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "T", body: "Hello world." }),
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toContain("---");
    expect(entry.content).not.toContain("title:");
  });

  it("preserves raw with frontmatter intact", () => {
    const src = withFrontmatter({ title: "T", body: "Body." });
    const dir = makeTmpDocs({ "page.mdx": src });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.raw).toBe(src);
  });

  it("handles frontmatter with quoted title values", () => {
    const dir = makeTmpDocs({
      "page.mdx": '---\ntitle: "Quoted Title"\n---\nBody.',
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.title).toBe("Quoted Title");
  });

  it("handles frontmatter with single-quoted title values", () => {
    const dir = makeTmpDocs({
      "page.mdx": "---\ntitle: 'Single Quoted'\n---\nBody.",
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.title).toBe("Single Quoted");
  });
});

// ---------------------------------------------------------------------------
// parseMdx — title fallback
// ---------------------------------------------------------------------------

describe("parseMdx — title fallback", () => {
  it("falls back to first H1 when no frontmatter title", () => {
    const dir = makeTmpDocs({ "page.mdx": "# Hello from H1\nSome text." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.title).toBe("Hello from H1");
  });

  it("falls back to filename stem when neither frontmatter nor H1", () => {
    const dir = makeTmpDocs({ "my-page.mdx": "Just some prose." });
    const entry = parseMdx(path.join(dir, "my-page.mdx"), dir);
    expect(entry.title).toBe("my-page");
  });

  it("frontmatter title takes precedence over H1", () => {
    const dir = makeTmpDocs({
      "page.mdx": withFrontmatter({ title: "FM Title", body: "# H1 Title\nContent." }),
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.title).toBe("FM Title");
  });
});

// ---------------------------------------------------------------------------
// parseMdx — content cleaning
// ---------------------------------------------------------------------------

describe("parseMdx — content cleaning", () => {
  it("removes MDX import statements", () => {
    const dir = makeTmpDocs({
      "page.mdx": 'import Comp from "./Comp.tsx"\n\nHello world.',
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toContain("import");
  });

  it("removes JSX / HTML tags", () => {
    const dir = makeTmpDocs({
      "page.mdx": '<MyComponent prop="x" />\nPlain text.',
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toContain("<MyComponent");
    expect(entry.content).toContain("Plain text.");
  });

  it("preserves content of fenced code blocks", () => {
    const dir = makeTmpDocs({
      "page.mdx": "Intro\n\n```ts\nconst x = 1;\n```\n\nOutro.",
    });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).toContain("const x = 1;");
    expect(entry.content).not.toContain("```");
  });

  it("strips backticks from inline code but keeps the text", () => {
    const dir = makeTmpDocs({ "page.mdx": "Use `npm install` to install." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).toContain("npm install");
    expect(entry.content).not.toContain("`");
  });

  it("converts markdown links to plain text", () => {
    const dir = makeTmpDocs({ "page.mdx": "See [the docs](https://example.com) for more." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).toContain("the docs");
    expect(entry.content).not.toContain("https://example.com");
  });

  it("removes heading markers", () => {
    const dir = makeTmpDocs({ "page.mdx": "## Section Title\nContent." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toContain("##");
    expect(entry.content).toContain("Section Title");
  });

  it("removes bold markers", () => {
    const dir = makeTmpDocs({ "page.mdx": "This is **bold** text." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toContain("**");
    expect(entry.content).toContain("bold");
  });

  it("removes italic markers", () => {
    const dir = makeTmpDocs({ "page.mdx": "This is *italic* text." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toContain("*italic*");
    expect(entry.content).toContain("italic");
  });

  it("collapses excessive blank lines to at most two newlines", () => {
    const dir = makeTmpDocs({ "page.mdx": "A\n\n\n\n\nB" });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.content).not.toMatch(/\n{3,}/);
  });
});

// ---------------------------------------------------------------------------
// parseMdx — URL path derivation
// ---------------------------------------------------------------------------

describe("parseMdx — URL path derivation", () => {
  it("derives path from filename relative to docsDir", () => {
    const dir = makeTmpDocs({ "getting-started.mdx": "." });
    const entry = parseMdx(path.join(dir, "getting-started.mdx"), dir);
    expect(entry.path).toBe("/getting-started");
  });

  it("includes sub-directory segments in the path", () => {
    const dir = makeTmpDocs({ "reference/cli.mdx": "." });
    const entry = parseMdx(path.join(dir, "reference/cli.mdx"), dir);
    expect(entry.path).toBe("/reference/cli");
  });

  it("strips the .md extension", () => {
    const dir = makeTmpDocs({ "notes.md": "." });
    const entry = parseMdx(path.join(dir, "notes.md"), dir);
    expect(entry.path).toBe("/notes");
  });

  it("collapses /index suffix into the parent path", () => {
    const dir = makeTmpDocs({ "docs/index.mdx": "." });
    const entry = parseMdx(path.join(dir, "docs/index.mdx"), dir);
    expect(entry.path).toBe("/docs");
  });

  it("maps a root index.mdx to /", () => {
    const dir = makeTmpDocs({ "index.mdx": "." });
    const entry = parseMdx(path.join(dir, "index.mdx"), dir);
    expect(entry.path).toBe("/");
  });

  it("paths always start with /", () => {
    const dir = makeTmpDocs({ "page.mdx": "." });
    const entry = parseMdx(path.join(dir, "page.mdx"), dir);
    expect(entry.path).toMatch(/^\//);
  });
});
