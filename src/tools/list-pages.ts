import { tool } from "@strands-agents/sdk";
import type { InvokableTool, JSONValue } from "@strands-agents/sdk";
import { z } from "zod";
import type { DocsIndex } from "../indexer/index.js";

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function listPagesImpl(index: DocsIndex): string {
  const pages = Array.from(index.values()).map((e) => ({
    path: e.path,
    title: e.title,
    description: e.description,
  }));
  return JSON.stringify(pages);
}

// ---------------------------------------------------------------------------
// Strands tool factory
// ---------------------------------------------------------------------------

export function createListPagesTool(
  index: DocsIndex,
): InvokableTool<Record<string, never>, JSONValue> {
  return tool({
    name: "list_pages",
    description:
      "List all documentation pages available for this project. " +
      "Returns a JSON array of objects, each with: " +
      "`path` (URL path to pass to get_page), `title` (page title), `description` (short summary). " +
      "Use this to discover what topics are covered before diving into specifics.",
    inputSchema: z.object({}),
    callback: () => listPagesImpl(index),
  });
}
