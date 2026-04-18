/**
 * Vite plugin for @litmdx/agent — local dev integration.
 *
 * This plugin does three things as a single unit:
 *   1. Starts the agent HTTP server alongside Vite's dev server.
 *   2. Proxies /api/agent/* → the agent port (avoids CORS in dev).
 *   3. Stops the agent server cleanly when Vite closes.
 *
 * ── Usage via litmdx (automatic) ─────────────────────────────────────────────
 * Install @litmdx/agent and set `agent.enabled: true` in litmdx.config.ts.
 * The litmdx CLI lazy-imports this plugin — no manual registration needed.
 *
 * ── Usage standalone (any Vite project) ──────────────────────────────────────
 *   import { litmdxAgentPlugin } from '@litmdx/agent/vite';
 *   // vite.config.ts
 *   export default {
 *     plugins: [litmdxAgentPlugin({ docsDir: './docs', provider: 'openai' })],
 *   }
 */

import type { Plugin } from "vite";
import type { Server } from "node:http";
import { buildProxyConfig } from "./proxy.js";
import { resolvePluginStorage } from "./storage.js";
import type { LitmdxAgentPluginOptions } from "./types.js";

export type { LitmdxAgentPluginOptions };

export function litmdxAgentPlugin(opts: LitmdxAgentPluginOptions): Plugin {
  let agentServer: Server | undefined;
  const agentPort = opts.port ?? 8000;

  return {
    name: "litmdx:agent",
    // Only active during `vite dev` — never runs during builds.
    apply: "serve",

    // ── Step 1: inject proxy config ──────────────────────────────────────────
    config() {
      return {
        server: {
          proxy: buildProxyConfig(agentPort),
        },
      };
    },

    // ── Step 2: start agent server when Vite dev server starts ───────────────
    async configureServer(server) {
      const { createNodeHttpServer } = await import("../adapters/node-http/index.js");
      const { buildIndex, fetchRemoteIndex } = await import("../indexer/index.js");
      const path = await import("node:path");
      const storage = await resolvePluginStorage(opts);

      // Build the index once and share it with both the agent server and the
      // Vite middleware — this avoids reading the filesystem twice and makes
      // the /docs-index.json endpoint available immediately in dev so that
      // LITMDX_AGENT_DOCS_INDEX_URL=http://localhost:5173/docs-index.json works.
      let index;
      if (opts.index) {
        index = opts.index;
      } else if (opts.docsIndexUrl) {
        index = await fetchRemoteIndex(opts.docsIndexUrl);
      } else {
        const docsDir = opts.docsDir ?? "./docs";
        index = buildIndex(path.resolve(docsDir));
      }

      // Expose the index as /docs-index.json so standalone servers and
      // external clients can consume it without a production build.
      const indexJson = JSON.stringify([...index.values()]);
      server.middlewares.use("/docs-index.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(indexJson);
      });

      try {
        agentServer = await createNodeHttpServer({
          ...opts,
          index,
          port: agentPort,
          // Bind to loopback only — Vite proxy forwards requests from the frontend.
          host: "127.0.0.1",
          storage: storage ?? opts.storage,
        });

        // ── Step 3: cleanup ─────────────────────────────────────────────────
        server.httpServer?.on("close", () => {
          agentServer?.close();
        });

        console.log(`\n  litmdx agent: http://127.0.0.1:${agentPort}`);
      } catch (err) {
        console.warn(`\n  ⚠  litmdx agent: failed to start — ${(err as Error).message}\n`);
      }
    },
  };
}
