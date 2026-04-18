/**
 * Vite dev-server proxy configuration for the agent.
 *
 * Rewrites /api/agent/* → http://127.0.0.1:<agentPort>/*
 * and returns a 503 JSON response when the agent server is unreachable.
 */

/** Minimal proxy instance passed to the Vite `configure` callback. */
export interface ViteProxyInstance {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

/** Minimal writable response used in the proxy error handler. */
export interface ProxyErrorResponse {
  writeHead?: (status: number, headers: Record<string, string>) => void;
  end?: (body: string) => void;
}

/**
 * Called when the upstream agent server is unreachable.
 * Writes a 503 JSON body if the response object is writable.
 */
export function handleProxyError(
  _err: unknown,
  _req: unknown,
  res: ProxyErrorResponse,
  agentPort: number,
): void {
  if (res.writeHead && res.end) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Agent server unavailable",
        detail: `Could not reach agent at http://127.0.0.1:${agentPort}. Check your agent config.`,
      }),
    );
  }
}

/** Returns the Vite server.proxy entry for /api/agent. */
export function buildProxyConfig(agentPort: number) {
  return {
    "/api/agent": {
      target: `http://127.0.0.1:${agentPort}`,
      changeOrigin: true as const,
      rewrite: (p: string) => p.replace(/^\/api\/agent/, ""),
      configure: (proxy: ViteProxyInstance) => {
        proxy.on("error", (_err, _req, res) => {
          handleProxyError(_err, _req, res as ProxyErrorResponse, agentPort);
        });
      },
    },
  };
}
