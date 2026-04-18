/**
 * Standalone dev/production server for @litmdx/agent.
 *
 * Usage:
 *   node dist/bin/server.js [options]
 *
 * Options (all optional — fall back to env vars or defaults):
 *   --docs            <path>   Docs directory to index. Default: ./docs
 *   --docs-index-url  <url>    Remote docs-index.json URL (overrides --docs).
 *   --provider        <name>   openai | anthropic | bedrock | gemini. Default: openai
 *   --api-key         <key>    API key (overrides env var).
 *   --model           <id>     Model ID override.
 *   --port            <number> Port to listen on. Default: 8000
 *   --title           <string> Project title for the system prompt.
 *   --sessions        <path>   Directory for session snapshots (FileStorage).
 *   --s3-bucket       <name>   S3 bucket for session snapshots (overrides --sessions).
 *   --s3-region       <region> AWS region for S3 (falls back to AWS_REGION env var).
 *   --s3-prefix       <prefix> Key prefix inside the S3 bucket.
 *   --context7        true     Enable Context7 MCP client for live library docs lookup.
 *
 * API key resolution order: --api-key flag → LITMDX_AGENT_API_KEY env var
 *   → provider-specific env var (OPENAI_API_KEY | ANTHROPIC_API_KEY | GEMINI_API_KEY)
 *
 * Env vars (all optional):
 *   LITMDX_AGENT_PROVIDER, LITMDX_AGENT_API_KEY, LITMDX_AGENT_MODEL,
 *   LITMDX_AGENT_DOCS_DIR, LITMDX_AGENT_DOCS_INDEX_URL,
 *   LITMDX_AGENT_PORT, LITMDX_AGENT_TITLE, LITMDX_AGENT_SESSIONS_DIR,
 *   LITMDX_AGENT_S3_BUCKET, LITMDX_AGENT_S3_REGION, LITMDX_AGENT_S3_PREFIX,
 *   LITMDX_AGENT_CONTEXT7
 */

import { createNodeHttpServer } from "../adapters/node-http/index.js";
import { parseArgs, resolveServerConfig } from "./config.js";
import { createContext7Client } from "../tools/context7.js";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const config = resolveServerConfig(args);

const {
  provider,
  docsDir,
  docsIndexUrl,
  port,
  apiKey,
  model,
  projectTitle,
  sessionsDir,
  s3Bucket,
  s3Region,
  s3Prefix,
  context7,
  notebook,
} = config;

const mcpClients = context7 ? [createContext7Client()] : undefined;

const s3Sessions = s3Bucket ? { bucket: s3Bucket, region: s3Region, prefix: s3Prefix } : undefined;

console.log(`\n  @litmdx/agent starting...`);
console.log(`  provider:  ${provider}`);
if (docsIndexUrl) {
  console.log(`  index:     ${docsIndexUrl}`);
} else {
  console.log(`  docs:      ${docsDir}`);
}
if (s3Bucket) console.log(`  storage:   S3 (bucket: ${s3Bucket})`);
if (context7) console.log(`  context7:  enabled (https://mcp.context7.com/mcp)`);
if (notebook) console.log(`  notebook:  enabled (vended tool)`);
console.log(`  port:      ${port}\n`);

const server = await createNodeHttpServer({
  docsDir,
  docsIndexUrl,
  provider,
  apiKey,
  port,
  model,
  projectTitle,
  sessionsDir: s3Sessions ? undefined : sessionsDir,
  s3Sessions,
  host: "127.0.0.1",
  mcpClients,
  notebook,
});

console.log(`  ➜  Agent: http://127.0.0.1:${port}`);
console.log(`  ➜  Health: http://127.0.0.1:${port}/health\n`);

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
