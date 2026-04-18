# Cloudflare Workers Adapter (Hono)

Deploys the agent as a Cloudflare Worker using [Hono](https://hono.dev).
Also works on Deno Deploy, Bun, and any other runtime that supports Hono
and the Web Fetch API.

```ts
import { createHonoApp } from '@litmdx/agent/adapters/hono';
```

## The filesystem constraint

Cloudflare Workers have **no access to `node:fs`** at request time. This means
you cannot read `.mdx` files from disk. You have two alternatives:

| Strategy | When to use |
|---|---|
| [`docsIndexUrl`](#strategy-1-docsindexurl-recommended) | Docs site and agent are deployed separately (most common) |
| [`index`](#strategy-2-index-bundle-into-the-worker) | You need zero-latency index loading or offline Workers |

---

## Strategy 1: `docsIndexUrl` (recommended)

The agent fetches `docs-index.json` from the live docs site on the first request.
No bundling required — the agent worker stays small.

```ts
// worker.ts
import { createHonoApp } from '@litmdx/agent/adapters/hono';

export default {
  fetch(req: Request, env: Env) {
    const app = createHonoApp({
      docsIndexUrl: 'https://my-docs.pages.dev/docs-index.json',
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      allowedOrigins: ['https://my-docs.pages.dev'],
    });
    return app.fetch(req, env);
  },
};
```

**How `docs-index.json` is generated:**

Add `agent: { enabled: true }` to your `litmdx.config.ts`. Every `litmdx build`
will write `dist/docs-index.json` alongside your static site. Deploy it with
Cloudflare Pages and it will be available at `https://your-site.pages.dev/docs-index.json`.

```ts
// litmdx.config.ts
export default defineConfig({
  agent: {
    enabled: true,
    name: 'Docs Assistant',
    serverUrl: 'https://my-agent.workers.dev',
  },
});
```

The index is fetched **once per Worker instance** (lazy singleton) and cached
in memory. Cloudflare's global network keeps instances warm across requests.

---

## Strategy 2: `index` — bundle into the worker

Use this when you need the index available immediately with no outbound fetch,
or when the docs site is not publicly accessible.

### Step 1 — generate `docs-index.json`

Run the CLI tool from the agent package:

```bash
node dist/bin/build-index.js --docs ./docs --out ./docs-index.json
```

Or use the `build:index` npm script:

```bash
pnpm build:index
```

### Step 2 — import and pass to the adapter

```ts
// worker.ts
import { createHonoApp } from '@litmdx/agent/adapters/hono';
import type { PageEntry } from '@litmdx/agent';
import entries from './docs-index.json';

// Reconstruct the DocsIndex Map at module load time (before first request)
const index = new Map((entries as PageEntry[]).map(e => [e.path, e]));

export default {
  fetch(req: Request, env: Env) {
    const app = createHonoApp({
      index,
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      allowedOrigins: ['https://my-docs.pages.dev'],
    });
    return app.fetch(req, env);
  },
};
```

Add to `wrangler.toml`:

```toml
[build]
command = "pnpm build && pnpm build:index"
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `index` | `DocsIndex` | — | Pre-built `Map<path, PageEntry>`. Highest priority. |
| `docsIndexUrl` | `string` | — | URL of `docs-index.json`. Used when `index` is not provided. |
| `docsDir` | `string` | — | Local docs path. **Not usable on CF Workers.** Node.js only. |
| `provider` | `AgentProvider` | — | `'openai'`, `'anthropic'`, `'bedrock'`, `'gemini'`. |
| `apiKey` | `string` | `''` | API key. Pass via Worker `env` bindings, not hardcoded. |
| `model` | `string` | provider default | Model ID override. |
| `systemPrompt` | `string` | built-in | Override the full system prompt. |
| `windowSize` | `number` | `10` | Conversation history window (messages). |
| `storage` | `SnapshotStorage` | in-memory | Session storage. Provide a persistent backend for multi-instance deployments. |
| `allowedOrigins` | `string \| string[]` | `'*'` | CORS origins. Default `'*'` is safe for public docs. |

## `wrangler.toml` example

```toml
name = "my-docs-agent"
main = "dist/worker.js"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[vars]
# Non-sensitive config only — use Secrets for API keys

[[rules]]
type = "ESModule"
globs = ["**/*.js"]
```

Set the API key as a Secret (never in `wrangler.toml`):

```bash
wrangler secret put OPENAI_API_KEY
```

## Session storage on Workers

The default in-memory storage works fine for single-instance deployments and
demos. For production with multiple Worker instances, sessions are not shared
across instances by default.

Options:
- Use `docsIndexUrl` and make the agent stateless (each message carries full context).
- Implement a `SnapshotStorage` backed by Cloudflare KV or Durable Objects and pass it via `storage`.
- Set a large `windowSize` and accept that sessions may reset when a request
  lands on a different instance.

## Compatibility flags

Add `nodejs_compat` to your `wrangler.toml` to enable Node.js polyfills
required by the Strands SDK:

```toml
compatibility_flags = ["nodejs_compat"]
```
