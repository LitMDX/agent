import type { SnapshotStorage } from "@strands-agents/sdk";
import { resolveS3Storage } from "../session/index.js";
import type { LitmdxAgentPluginOptions } from "./types.js";

type StorageOpts = Pick<LitmdxAgentPluginOptions, "s3Sessions" | "storage">;

/**
 * Resolves the SnapshotStorage backend for the plugin.
 *
 * Priority:
 *   1. `opts.s3Sessions` → constructs S3Storage via shared resolveS3Storage
 *   2. `opts.storage`   → custom user-provided backend
 *   3. `undefined`      → SessionStore will fall back to FileStorage
 */
export async function resolvePluginStorage(
  opts: StorageOpts,
): Promise<SnapshotStorage | undefined> {
  if (opts.s3Sessions) {
    const storage = await resolveS3Storage(opts.s3Sessions);
    console.log(`  litmdx agent: session storage → S3 (bucket: ${opts.s3Sessions.bucket})`);
    return storage;
  }
  return opts.storage;
}
