/**
 * Storage key layout for Cloudflare KV and R2 backends.
 *
 * All keys follow the same hierarchical structure used by FileStorage and
 * S3Storage so that snapshots are portable across backends:
 *
 *   sessions/<sessionId>/scopes/<scope>/<scopeId>/snapshots/latest
 *   sessions/<sessionId>/scopes/<scope>/<scopeId>/snapshots/history/<snapshotId>
 *   sessions/<sessionId>/scopes/<scope>/<scopeId>/manifest
 */

import type { SnapshotLocation } from "@strands-agents/sdk";

const base = (loc: SnapshotLocation) =>
  `sessions/${loc.sessionId}/scopes/${loc.scope}/${loc.scopeId}`;

/** Key for the mutable latest snapshot (`snapshot_latest`). */
export const latestKey = (loc: SnapshotLocation) => `${base(loc)}/snapshots/latest`;

/** Key for a specific immutable snapshot in history. */
export const historyKey = (loc: SnapshotLocation, snapshotId: string) =>
  `${base(loc)}/snapshots/history/${snapshotId}`;

/** Prefix that enumerates all immutable history keys for a scope. */
export const historyPrefix = (loc: SnapshotLocation) => `${base(loc)}/snapshots/history/`;

/** Key for the scope manifest. */
export const manifestKey = (loc: SnapshotLocation) => `${base(loc)}/manifest`;

/** Prefix that covers all keys belonging to a session (for deleteSession). */
export const sessionPrefix = (sessionId: string) => `sessions/${sessionId}/`;

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

/**
 * Applies cursor-based pagination to a pre-collected list of IDs.
 * IDs must already be in chronological order (UUID v7 lexicographic sort).
 */
export function applyPagination(
  ids: string[],
  startAfter: string | undefined,
  limit: number | undefined,
): string[] {
  let result = ids;
  if (startAfter !== undefined) {
    const idx = result.indexOf(startAfter);
    result = idx === -1 ? [] : result.slice(idx + 1);
  }
  if (limit !== undefined) result = result.slice(0, limit);
  return result;
}
