/**
 * In-memory SnapshotStorage implementation.
 *
 * Stores all snapshot data in Maps — no Node.js filesystem APIs, no network
 * calls. Safe on every runtime: Node.js, Cloudflare Workers, Deno Deploy, Bun,
 * and the browser.
 *
 * Snapshots survive only for the lifetime of the current process / Worker
 * instance. Use FileStorage (Node.js), S3Storage (Lambda), KVStorage or
 * R2Storage (CF Workers) when cross-restart or cross-instance persistence is
 * required.
 */

import type {
  SnapshotStorage,
  SnapshotLocation,
  Snapshot,
  SnapshotManifest,
} from "@strands-agents/sdk";

interface ScopeEntry {
  latest: Snapshot | null;
  /** Insertion-ordered Map — UUID v7 IDs are already chronologically sorted. */
  history: Map<string, Snapshot>;
  manifest: SnapshotManifest | null;
}

function toKey(loc: SnapshotLocation): string {
  return `${loc.sessionId}::${loc.scope}::${loc.scopeId}`;
}

export class MemoryStorage implements SnapshotStorage {
  private readonly _data = new Map<string, ScopeEntry>();

  private _scope(loc: SnapshotLocation): ScopeEntry {
    const k = toKey(loc);
    if (!this._data.has(k)) {
      this._data.set(k, { latest: null, history: new Map(), manifest: null });
    }
    return this._data.get(k)!;
  }

  async saveSnapshot(params: {
    location: SnapshotLocation;
    snapshotId: string;
    isLatest: boolean;
    snapshot: Snapshot;
  }): Promise<void> {
    const s = this._scope(params.location);
    if (params.isLatest) {
      s.latest = params.snapshot;
    } else {
      s.history.set(params.snapshotId, params.snapshot);
    }
  }

  async loadSnapshot(params: {
    location: SnapshotLocation;
    snapshotId?: string;
  }): Promise<Snapshot> {
    const s = this._scope(params.location);
    if (params.snapshotId) {
      const snap = s.history.get(params.snapshotId);
      if (!snap) throw new Error(`MemoryStorage: snapshot '${params.snapshotId}' not found`);
      return snap;
    }
    if (!s.latest)
      throw new Error(`MemoryStorage: no snapshot_latest for ${toKey(params.location)}`);
    return s.latest;
  }

  async listSnapshotIds(params: {
    location: SnapshotLocation;
    limit?: number;
    startAfter?: string;
  }): Promise<string[]> {
    const s = this._scope(params.location);
    let ids = Array.from(s.history.keys());
    if (params.startAfter) {
      const idx = ids.indexOf(params.startAfter);
      ids = idx === -1 ? [] : ids.slice(idx + 1);
    }
    if (params.limit !== undefined) ids = ids.slice(0, params.limit);
    return ids;
  }

  async deleteSession(params: { sessionId: string }): Promise<void> {
    for (const key of this._data.keys()) {
      if (key.startsWith(`${params.sessionId}::`)) {
        this._data.delete(key);
      }
    }
  }

  async loadManifest(params: { location: SnapshotLocation }): Promise<SnapshotManifest> {
    const s = this._scope(params.location);
    return s.manifest ?? { schemaVersion: "1.0", updatedAt: new Date().toISOString() };
  }

  async saveManifest(params: {
    location: SnapshotLocation;
    manifest: SnapshotManifest;
  }): Promise<void> {
    this._scope(params.location).manifest = params.manifest;
  }
}
