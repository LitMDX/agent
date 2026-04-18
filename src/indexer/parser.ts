/**
 * MDX / Markdown file parser.
 *
 * Extracts frontmatter metadata, strips MDX/JSX syntax from the prose body,
 * and derives a canonical URL path from the file's location inside the docs
 * directory.
 */

import fs from "node:fs";
import path from "node:path";
import type { PageEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseMdx(filePath: string, docsDir: string): PageEntry {
  const raw = fs.readFileSync(filePath, "utf-8");

  // ── Frontmatter extraction ───────────────────────────────────────────────
  let title = "";
  let description = "";
  let body = raw;

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const titleMatch = fm.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    const descMatch = fm.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
    if (titleMatch) title = titleMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
    body = raw.slice(fmMatch[0].length).trim();
  }

  // Fall back to first H1 as title
  if (!title) {
    const h1 = body.match(/^#{1}\s+(.+)/m);
    if (h1) title = h1[1].trim();
  }

  // ── Content cleaning ─────────────────────────────────────────────────────
  const content = cleanBody(body);

  // ── URL path from file path ──────────────────────────────────────────────
  const urlPath = deriveUrlPath(filePath, docsDir);

  return {
    path: urlPath,
    title: title || path.basename(filePath, ".mdx"),
    description,
    content,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cleanBody(body: string): string {
  return body
    .replace(/^import\s+.+$/gm, "") // MDX import statements
    .replace(/<[^>]+>/g, " ") // JSX / HTML tags
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => code.trim()) // fenced code blocks → keep content
    .replace(/`([^`]+)`/g, "$1") // inline code → keep content
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/\n{3,}/g, "\n\n") // excess blank lines
    .trim();
}

function deriveUrlPath(filePath: string, docsDir: string): string {
  const rel = path.relative(docsDir, filePath);
  const urlPath =
    "/" +
    rel
      .replace(/\\/g, "/")
      .replace(/\.(mdx|md)$/, "")
      .replace(/\/index$/, "")
      .replace(/^index$/, "");

  return urlPath || "/";
}
