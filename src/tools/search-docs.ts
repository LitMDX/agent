import { tool } from "@strands-agents/sdk";
import type { InvokableTool, JSONValue } from "@strands-agents/sdk";
import { z } from "zod";
import type { DocsIndex } from "../indexer/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function searchDocsImpl(index: DocsIndex, query: string, limit = 5): string {
  // Tokenise: split on whitespace, lowercase, drop tokens shorter than 3 chars
  // (eliminates common stopwords like "en", "de", "la", "in", "of", etc.)
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  // If all tokens were filtered, fall back to the full normalised query as a
  // single token so very short queries ("js", "ok") still work.
  const effectiveTokens = tokens.length > 0 ? tokens : [query.toLowerCase()];

  interface Scored {
    entry: { path: string; title: string; description: string; content: string };
    score: number;
    firstContentToken: string | null;
  }

  const scored: Scored[] = [];

  for (const entry of index.values()) {
    const titleLc = entry.title.toLowerCase();
    const descLc = entry.description.toLowerCase();
    const contentLc = entry.content.toLowerCase();

    let score = 0;
    let firstContentToken: string | null = null;

    for (const token of effectiveTokens) {
      if (titleLc.includes(token)) score += 3;
      if (descLc.includes(token)) score += 2;
      if (contentLc.includes(token)) {
        score += 1;
        if (firstContentToken === null) firstContentToken = token;
      }
    }

    if (score > 0) scored.push({ entry, score, firstContentToken });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return JSON.stringify({ message: `No results found for: "${query}"` });
  }

  const results: SearchResult[] = scored.slice(0, limit).map(({ entry, firstContentToken }) => {
    let excerpt = entry.description;
    if (firstContentToken !== null) {
      const idx = entry.content.toLowerCase().indexOf(firstContentToken);
      const start = Math.max(0, idx - 120);
      const end = Math.min(entry.content.length, idx + 400);
      excerpt = (start > 0 ? "…" : "") + entry.content.slice(start, end).trim();
      if (end < entry.content.length) excerpt += "…";
    }
    return { path: entry.path, title: entry.title, excerpt };
  });

  return JSON.stringify(results);
}

// ---------------------------------------------------------------------------
// Strands tool factory
// ---------------------------------------------------------------------------

export function createSearchDocsTool(
  index: DocsIndex,
): InvokableTool<{ query: string; limit?: number }, JSONValue> {
  return tool({
    name: "search_docs",
    description:
      "Search across all documentation pages for a given text query. " +
      "Returns a JSON array of up to `limit` results (default 5), each with: " +
      "`path` (URL path), `title` (page title), `excerpt` (matching text snippet). " +
      "Prefer this over get_page when you don't know which page contains the answer.",
    inputSchema: z.object({
      query: z.string().describe("Plain text to search for (case-insensitive)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of results to return (default: 5, max: 20)."),
    }),
    callback: ({ query, limit }) => searchDocsImpl(index, query, limit),
  });
}
