import { tool } from "@strands-agents/sdk";
import type { InvokableTool, JSONValue } from "@strands-agents/sdk";
import { z } from "zod";
import type { DocsIndex } from "../indexer/index.js";

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function getPageImpl(index: DocsIndex, pagePath: string): string {
  const entry = index.get(pagePath);
  if (!entry) {
    const available = Array.from(index.keys()).join(", ") || "(no pages indexed)";
    throw new Error(`Page '${pagePath}' not found. Available paths: ${available}`);
  }
  return rawToMarkdown(entry.raw);
}

/**
 * Convert raw MDX source to clean Markdown the agent can reproduce:
 *  - Strip YAML frontmatter
 *  - Strip MDX import lines
 *  - Convert <Callout type="X">…</Callout> → bold label + content
 *  - Strip remaining JSX/HTML tags
 */
export function rawToMarkdown(raw: string): string {
  let md = raw;

  // Strip frontmatter
  md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

  // Strip import lines
  md = md.replace(/^import\s+.*$/gm, "");

  // Convert Callout components to bold-label + content
  md = md.replace(
    /<Callout(?:[^>]*?)type="([^"]*)"[^>]*>([\s\S]*?)<\/Callout>/gi,
    (_match, type: string, content: string) => {
      const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      return `**${label}:** ${content.trim()}`;
    },
  );

  // Strip remaining self-closing JSX components  (<Badge /> etc.)
  md = md.replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, "");
  // Strip remaining paired JSX components (<Tabs>…</Tabs>)
  md = md.replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, "");
  // Strip stray closing tags
  md = md.replace(/<\/[A-Z][A-Za-z]*>/g, "");

  // Collapse 3+ blank lines to 2
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

// ---------------------------------------------------------------------------
// Strands tool factory
// ---------------------------------------------------------------------------

export function createGetPageTool(index: DocsIndex): InvokableTool<{ path: string }, JSONValue> {
  return tool({
    name: "get_page",
    description:
      "Return the full Markdown content of a documentation page given its URL path. " +
      "Returns the page body with headings, code blocks, tables, and lists. " +
      "Use list_pages first if you are not sure which paths exist.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("URL path of the page, e.g. '/getting-started' or '/reference/configuration'."),
    }),
    callback: ({ path }) => getPageImpl(index, path),
  });
}
