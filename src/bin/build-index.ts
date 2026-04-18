#!/usr/bin/env node
/**
 * build-index.js — pre-generates a docs-index.json for edge runtimes.
 *
 * Edge runtimes such as Cloudflare Workers have no access to node:fs at
 * request time, so the DocsIndex must be built at deploy time and bundled
 * into the worker as a static asset.
 *
 * Usage:
 *   node dist/bin/build-index.js --docs ./docs --out ./docs-index.json
 *
 * Options:
 *   --docs <dir>   Path to the docs directory (default: ./docs)
 *   --out  <file>  Output JSON file path    (default: ./docs-index.json)
 *
 * The JSON format is an array of PageEntry objects:
 *   [{ path, title, description, content, raw }, ...]
 *
 * In your worker, reconstruct the Map:
 *   import entries from "./docs-index.json";
 *   const index = new Map(entries.map(e => [e.path, e]));
 */

import path from "node:path";
import fs from "node:fs";
import { buildIndex } from "../indexer/index.js";

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const docsDir = path.resolve(get("--docs") ?? "./docs");
const outFile = path.resolve(get("--out") ?? "./docs-index.json");

// ── Build ─────────────────────────────────────────────────────────────────────

console.log(`  litmdx build-index: reading '${docsDir}'`);

const index = buildIndex(docsDir);

if (index.size === 0) {
  console.warn(`  litmdx build-index: no pages found — writing empty index`);
}

// Map → Array<PageEntry> (JSON-serializable)
const entries = Array.from(index.values());

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(entries, null, 2), "utf-8");

console.log(`  litmdx build-index: ${entries.length} page(s) → '${outFile}'`);
