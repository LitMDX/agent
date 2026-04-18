/**
 * Arg / env resolution for the standalone dev server.
 *
 * Pure functions — no side effects, no I/O — so they can be unit-tested
 * independently of the Node.js http server.
 */

import path from "node:path";
import type { AgentProvider } from "../model/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerConfig {
  provider: AgentProvider;
  docsDir: string;
  docsIndexUrl: string | undefined;
  port: number;
  apiKey: string | undefined;
  model: string | undefined;
  projectTitle: string | undefined;
  sessionsDir: string | undefined;
  s3Bucket: string | undefined;
  s3Region: string | undefined;
  s3Prefix: string | undefined;
  /** Enable Context7 MCP client for live library documentation lookup. */
  context7: boolean;
  /** Enable the notebook vended tool for persistent agent scratchpad. */
  notebook: boolean;
}

// ---------------------------------------------------------------------------
// Arg parsing (no external deps)
// ---------------------------------------------------------------------------

/**
 * Parses a `--key value` style argv array into a plain object.
 * Flags without a following value are ignored.
 */
export function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        result[key] = value;
        i++;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Merges CLI args with environment variables to produce a complete
 * `ServerConfig`. Priority: CLI arg → env var → default.
 */
export function resolveServerConfig(
  args: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  return {
    provider: (args["provider"] ?? env["LITMDX_AGENT_PROVIDER"] ?? "openai") as AgentProvider,
    docsDir: path.resolve(args["docs"] ?? env["LITMDX_AGENT_DOCS_DIR"] ?? "docs"),
    docsIndexUrl: args["docs-index-url"] ?? env["LITMDX_AGENT_DOCS_INDEX_URL"],
    port: parseInt(args["port"] ?? env["LITMDX_AGENT_PORT"] ?? "8000", 10),
    apiKey: args["api-key"] ?? env["LITMDX_AGENT_API_KEY"],
    model: args["model"] ?? env["LITMDX_AGENT_MODEL"],
    projectTitle: args["title"] ?? env["LITMDX_AGENT_TITLE"],
    sessionsDir: args["sessions"] ?? env["LITMDX_AGENT_SESSIONS_DIR"],
    s3Bucket: args["s3-bucket"] ?? env["LITMDX_AGENT_S3_BUCKET"],
    s3Region: args["s3-region"] ?? env["LITMDX_AGENT_S3_REGION"] ?? env["AWS_REGION"],
    s3Prefix: args["s3-prefix"] ?? env["LITMDX_AGENT_S3_PREFIX"],
    context7:
      (args["context7"] ?? env["LITMDX_AGENT_CONTEXT7"] ?? "false").toLowerCase() !== "false",
    notebook:
      (args["notebook"] ?? env["LITMDX_AGENT_NOTEBOOK"] ?? "false").toLowerCase() !== "false",
  };
}
