/**
 * Duck-typed Cloudflare Workers API interfaces.
 *
 * These interfaces capture the minimal subset of the Cloudflare KV and R2
 * APIs that the storage implementations need. Using duck types instead of
 * `@cloudflare/workers-types` keeps this package free of a direct CF
 * dependency — the real CF bindings satisfy these interfaces at runtime.
 */

/** Minimal subset of the Cloudflare KV Namespace API. */
export interface CFKVNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor: string }>;
}

/** Minimal subset of the Cloudflare R2 Bucket API. */
export interface CFR2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(opts?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}
