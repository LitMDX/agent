/**
 * Hono adapter for @litmdx/agent.
 *
 * Works on Cloudflare Workers, Deno Deploy, Bun, Node.js — any runtime
 * that supports the Hono framework and the Web Fetch API.
 *
 * Usage (Cloudflare Worker):
 *   import { createHonoApp } from '@litmdx/agent/adapters/hono';
 *
 *   export default createHonoApp({
 *     docsDir: './docs',   // bundled into the worker via wrangler assets
 *     provider: 'openai',
 *     apiKey: env.OPENAI_API_KEY,
 *     allowedOrigins: ['https://my-docs.pages.dev'],
 *   });
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { createGetStore } from "./store.js";
import type { HonoAdapterOptions } from "./types.js";

export type { HonoAdapterOptions };
export { KVStorage, R2Storage } from "./cf-storage.js";
export type { CFKVNamespace, CFR2Bucket } from "./cf-types.js";

export function createHonoApp(opts: HonoAdapterOptions): Hono {
  const app = new Hono();
  const getStore = createGetStore(opts);

  // CORS middleware — applied to all routes
  const origins = opts.allowedOrigins ?? "*";
  app.use(
    "/*",
    cors({
      origin: origins,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  // ── GET /health ──────────────────────────────────────────────────────────
  app.get("/health", async (c) => {
    const { dispatch: d } = await getStore();
    const result = await d({
      method: "GET",
      pathname: "/health",
      searchParams: new URLSearchParams(),
      body: {},
      origin: c.req.header("origin") ?? "",
    });
    if (result.kind === "json")
      return c.json(result.body as Record<string, unknown>, result.status as 200);
    return c.json({ error: "unexpected" }, 500);
  });

  // ── POST /chat ────────────────────────────────────────────────────────────
  app.post("/chat", async (c) => {
    const { dispatch: d } = await getStore();
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    const result = await d({
      method: "POST",
      pathname: "/chat",
      searchParams: new URLSearchParams(),
      body,
      origin: c.req.header("origin") ?? "",
    });
    if (result.kind === "json")
      return c.json(result.body as Record<string, unknown>, result.status as 200 | 400 | 404);
    return c.json({ error: "unexpected" }, 500);
  });

  // ── POST /chat/stream ─────────────────────────────────────────────────────
  app.post("/chat/stream", async (c) => {
    const { dispatch: d } = await getStore();
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    const result = await d({
      method: "POST",
      pathname: "/chat/stream",
      searchParams: new URLSearchParams(),
      body,
      origin: c.req.header("origin") ?? "",
    });

    if (result.kind === "json") {
      return c.json(result.body as Record<string, unknown>, result.status as 400 | 404);
    }

    // Hono streaming helper — works on Cloudflare Workers + Node.js
    return stream(c, async (s) => {
      for await (const chunk of result.body) {
        await s.write(chunk);
      }
    });
  });

  // ── DELETE /session ────────────────────────────────────────────────────────
  app.delete("/session", async (c) => {
    const { dispatch: d } = await getStore();
    const qs = new URLSearchParams(new URL(c.req.url).search);
    const result = await d({
      method: "DELETE",
      pathname: "/session",
      searchParams: qs,
      body: {},
      origin: c.req.header("origin") ?? "",
    });
    if (result.kind === "json")
      return c.json(result.body as Record<string, unknown>, result.status as 200 | 404);
    return c.json({ error: "unexpected" }, 500);
  });

  return app;
}
