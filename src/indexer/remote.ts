/**
 * Remote index fetcher.
 *
 * Fetches a `docs-index.json` file from a deployed LitMDX site and
 * reconstructs the in-memory DocsIndex Map.
 *
 * The JSON is an array of PageEntry objects — the same format produced by
 * `litmdx build` when `agent.enabled` is set in litmdx.config.ts.
 *
 * Usage:
 *   const index = await fetchRemoteIndex('https://my-docs.example.com/docs-index.json');
 */

import type { DocsIndex, PageEntry } from "./types.js";

export async function fetchRemoteIndex(url: string): Promise<DocsIndex> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetchRemoteIndex: HTTP ${res.status} fetching '${url}'`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const preview = (await res.text()).slice(0, 120).replace(/\n/g, " ");
    throw new Error(
      `fetchRemoteIndex: expected JSON from '${url}' but got '${contentType}'.\n` +
        `  Response preview: ${preview}\n` +
        `  Tip: run 'litmdx build' first, or use 'docsDir' instead of 'docsIndexUrl' in dev.`,
    );
  }

  const entries = (await res.json()) as PageEntry[];

  if (!Array.isArray(entries)) {
    throw new Error(`fetchRemoteIndex: expected an array from '${url}', got ${typeof entries}`);
  }

  return new Map(entries.map((entry) => [entry.path, entry]));
}
