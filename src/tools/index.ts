import type { Tool } from "@strands-agents/sdk";
import type { DocsIndex } from "../indexer/index.js";
import { createListPagesTool } from "./list-pages.js";
import { createGetPageTool } from "./get-page.js";
import { createSearchDocsTool } from "./search-docs.js";

export { listPagesImpl, createListPagesTool } from "./list-pages.js";
export { getPageImpl, createGetPageTool } from "./get-page.js";
export type { SearchResult } from "./search-docs.js";
export { searchDocsImpl, createSearchDocsTool } from "./search-docs.js";
export { createContext7Client, CONTEXT7_URL } from "./context7.js";

export function createTools(index: DocsIndex): Tool[] {
  return [createListPagesTool(index), createGetPageTool(index), createSearchDocsTool(index)];
}
