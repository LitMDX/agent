import type { NodeHttpAdapterOptions } from "../adapters/node-http/index.js";

export interface LitmdxAgentPluginOptions extends Omit<NodeHttpAdapterOptions, "host"> {
  /**
   * S3 session storage config.
   * When provided, uses S3Storage instead of FileStorage.
   * @aws-sdk/client-s3 is lazily imported — no manual install required.
   */
  s3Sessions?: {
    bucket: string;
    prefix?: string;
    region?: string;
  };
}
