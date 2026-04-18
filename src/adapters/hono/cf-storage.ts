/**
 * Cloudflare Workers SnapshotStorage implementations.
 *
 * KVStorage  — Cloudflare KV Namespace. Simple; 25 MB per-value limit.
 * R2Storage  — Cloudflare R2 Bucket. No size limit; better for large histories.
 *
 * Both implement the Strands `SnapshotStorage` interface and can be passed
 * directly to the `storage` option of `createHonoApp`.
 *
 * Usage:
 *   import { createHonoApp, KVStorage, R2Storage } from '@litmdx/agent/adapters/hono';
 *
 *   export default {
 *     fetch(req, env) {
 *       return createHonoApp({
 *         docsIndexUrl: '...',
 *         provider: 'openai',
 *         apiKey: env.OPENAI_API_KEY,
 *         storage: new KVStorage(env.SESSIONS_KV),
 *         // — or —
 *         storage: new R2Storage(env.SESSIONS_R2),
 *       }).fetch(req, env);
 *     },
 *   };
 *
 * wrangler.toml:
 *   [[kv_namespaces]]
 *   binding = "SESSIONS_KV"
 *   id = "<your-kv-namespace-id>"
 *
 *   [[r2_buckets]]
 *   binding = "SESSIONS_R2"
 *   bucket_name = "<your-bucket>"
 */

import type {
  SnapshotStorage,
  SnapshotLocation,
  Snapshot,
  SnapshotManifest,
} from "@strands-agents/sdk";
import type { CFKVNamespace, CFR2Bucket } from "./cf-types.js";
import {
  latestKey,
  historyKey,
  historyPrefix,
  manifestKey,
  sessionPrefix,
  applyPagination,
} from "./cf-storage-keys.js";

export type { CFKVNamespace, CFR2Bucket } from "./cf-types.js";

const DEFAULT_MANIFEST: SnapshotManifest = {
  schemaVersion: "1.0",
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// KVStorage
// ---------------------------------------------------------------------------

/**
 * SnapshotStorage backed by a Cloudflare KV Namespace.
 *
 * Each snapshot is stored as a JSON string. KV's 25 MB per-value limit is
 * more than sufficient for typical conversation snapshots.
 *
 * @example
 *   storage: new KVStorage(env.SESSIONS_KV)
 */
export class KVStorage implements SnapshotStorage {
  constructor(private readonly kv: CFKVNamespace) {}

  async saveSnapshot(params: {
    location: SnapshotLocation;
    snapshotId: string;
    isLatest: boolean;
    snapshot: Snapshot;
  }): Promise<void> {
    const key = params.isLatest
      ? latestKey(params.location)
      : historyKey(params.location, params.snapshotId);
    await this.kv.put(key, JSON.stringify(params.snapshot));
  }

  async loadSnapshot(params: {
    location: SnapshotLocation;
    snapshotId?: string;
  }): Promise<Snapshot> {
    const key = params.snapshotId
      ? historyKey(params.location, params.snapshotId)
      : latestKey(params.location);
    const raw = await this.kv.get(key, "text");
    if (!raw)
      throw new Error(
        `KVStorage: snapshot '${params.snapshotId ?? "latest"}' not found for session '${params.location.sessionId}'`,
      );
    return JSON.parse(raw) as Snapshot;
  }

  async listSnapshotIds(params: {
    location: SnapshotLocation;
    limit?: number;
    startAfter?: string;
  }): Promise<string[]> {
    // KV returns keys alphabetically. UUID v7 keys are chronologically sorted
    // lexicographically, so no secondary sort is needed.
    const prefix = historyPrefix(params.location);
    const all: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.kv.list({ prefix, limit: 1000, cursor });
      for (const k of page.keys) all.push(k.name.slice(prefix.length));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return applyPagination(all, params.startAfter, params.limit);
  }

  async deleteSession(params: { sessionId: string }): Promise<void> {
    const prefix = sessionPrefix(params.sessionId);
    let cursor: string | undefined;
    do {
      const page = await this.kv.list({ prefix, limit: 1000, cursor });
      for (const k of page.keys) await this.kv.delete(k.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }

  async loadManifest(params: { location: SnapshotLocation }): Promise<SnapshotManifest> {
    const raw = await this.kv.get(manifestKey(params.location), "text");
    return raw ? (JSON.parse(raw) as SnapshotManifest) : DEFAULT_MANIFEST;
  }

  async saveManifest(params: {
    location: SnapshotLocation;
    manifest: SnapshotManifest;
  }): Promise<void> {
    await this.kv.put(manifestKey(params.location), JSON.stringify(params.manifest));
  }
}

// ---------------------------------------------------------------------------
// R2Storage
// ---------------------------------------------------------------------------

/**
 * SnapshotStorage backed by a Cloudflare R2 Bucket.
 *
 * No per-object size limit. Better choice when snapshots can be large or
 * when you need a full immutable history audit trail. Key layout mirrors
 * FileStorage / S3Storage for portability.
 *
 * @example
 *   storage: new R2Storage(env.SESSIONS_R2)
 */
export class R2Storage implements SnapshotStorage {
  constructor(private readonly bucket: CFR2Bucket) {}

  async saveSnapshot(params: {
    location: SnapshotLocation;
    snapshotId: string;
    isLatest: boolean;
    snapshot: Snapshot;
  }): Promise<void> {
    const key = params.isLatest
      ? latestKey(params.location)
      : historyKey(params.location, params.snapshotId);
    await this.bucket.put(key, JSON.stringify(params.snapshot));
  }

  async loadSnapshot(params: {
    location: SnapshotLocation;
    snapshotId?: string;
  }): Promise<Snapshot> {
    const key = params.snapshotId
      ? historyKey(params.location, params.snapshotId)
      : latestKey(params.location);
    const obj = await this.bucket.get(key);
    if (!obj)
      throw new Error(
        `R2Storage: snapshot '${params.snapshotId ?? "latest"}' not found for session '${params.location.sessionId}'`,
      );
    return JSON.parse(await obj.text()) as Snapshot;
  }

  async listSnapshotIds(params: {
    location: SnapshotLocation;
    limit?: number;
    startAfter?: string;
  }): Promise<string[]> {
    const prefix = historyPrefix(params.location);
    const all: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor, limit: 1000 });
      for (const obj of page.objects) all.push(obj.key.slice(prefix.length));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return applyPagination(all, params.startAfter, params.limit);
  }

  async deleteSession(params: { sessionId: string }): Promise<void> {
    const prefix = sessionPrefix(params.sessionId);
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor, limit: 1000 });
      const keys = page.objects.map((o) => o.key);
      if (keys.length > 0) await this.bucket.delete(keys);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }

  async loadManifest(params: { location: SnapshotLocation }): Promise<SnapshotManifest> {
    const obj = await this.bucket.get(manifestKey(params.location));
    if (!obj) return DEFAULT_MANIFEST;
    return JSON.parse(await obj.text()) as SnapshotManifest;
  }

  async saveManifest(params: {
    location: SnapshotLocation;
    manifest: SnapshotManifest;
  }): Promise<void> {
    await this.bucket.put(manifestKey(params.location), JSON.stringify(params.manifest));
  }
}
