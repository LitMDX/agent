/**
 * Shared test helpers for indexer-related tests.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Temporary docs directory
// ---------------------------------------------------------------------------

/**
 * Creates a temporary directory populated with the given files.
 * Keys are relative paths; values are file contents.
 * Returns the absolute path to the temp directory.
 *
 * The caller is responsible for cleanup (Vitest does not auto-clean).
 */
export function makeTmpDocs(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litmdx-indexer-test-"));
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(dir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
  return dir;
}

// ---------------------------------------------------------------------------
// MDX content builders
// ---------------------------------------------------------------------------

export function withFrontmatter(opts: {
  title?: string;
  description?: string;
  body?: string;
}): string {
  const lines: string[] = ["---"];
  if (opts.title) lines.push(`title: ${opts.title}`);
  if (opts.description) lines.push(`description: ${opts.description}`);
  lines.push("---");
  if (opts.body) lines.push("", opts.body);
  return lines.join("\n");
}
