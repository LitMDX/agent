/**
 * Shared types for the docs indexer.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface PageEntry {
  /** URL path, e.g. "/getting-started" */
  path: string;
  /** From frontmatter or first H1 */
  title: string;
  /** From frontmatter, may be empty */
  description: string;
  /** Cleaned prose text (no MDX/JSX tags) */
  content: string;
  /** Original .mdx source */
  raw: string;
}

export type DocsIndex = Map<string, PageEntry>;
