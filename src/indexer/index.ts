/**
 * Docs indexer.
 *
 * Walks a docs directory, parses every .mdx / .md file and builds an
 * in-memory DocsIndex keyed by URL path.
 *
 * Public API:
 *   buildIndex(docsDir) → DocsIndex
 *
 * Types:
 *   PageEntry, DocsIndex  (re-exported from ./types)
 */

import fs from "node:fs";
import type { DocsIndex } from "./types.js";
import { walkMdx } from "./walker.js";
import { parseMdx } from "./parser.js";

export type { PageEntry, DocsIndex } from "./types.js";
export { fetchRemoteIndex } from "./remote.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildIndex(docsDir: string): DocsIndex {
  const index: DocsIndex = new Map();

  if (!fs.existsSync(docsDir)) {
    console.warn(`  litmdx agent: docs directory '${docsDir}' not found — index is empty`);
    return index;
  }

  for (const file of walkMdx(docsDir)) {
    const entry = parseMdx(file, docsDir);
    index.set(entry.path, entry);
  }

  return index;
}
