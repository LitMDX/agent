/**
 * Context7 MCP client factory.
 *
 * Context7 is a public MCP server that provides up-to-date library documentation
 * via Streamable HTTP transport — no auth, no install, works in every runtime
 * (Node.js, AWS Lambda, Cloudflare Workers, Hono).
 *
 * Usage:
 *   import { createContext7Client } from './tools/context7.js';
 *   const client = createContext7Client();
 *   // Pass to mcpClients: [client] when creating the agent/server.
 */

import { McpClient } from "@strands-agents/sdk";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const CONTEXT7_URL = "https://mcp.context7.com/mcp";

/**
 * Creates a McpClient connected to Context7 via Streamable HTTP.
 * The client is lazy — it connects on first use.
 *
 * @param url Override the default Context7 endpoint (useful for testing).
 */
export function createContext7Client(url = CONTEXT7_URL): McpClient {
  return new McpClient({
    transport: new StreamableHTTPClientTransport(new URL(url)),
  });
}
