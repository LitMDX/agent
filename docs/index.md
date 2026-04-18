# @litmdx/agent

AI documentation assistant powered by [Strands Agents](https://strandsagents.com).
Exposes a streaming chat API (`POST /chat/stream`) that answers questions about a LitMDX
documentation site.

## Adapters

| Adapter | Module | Runtime |
|---|---|---|
| [Node HTTP](./adapters/node-http.md) | `@litmdx/agent/adapters/node-http` | Node.js 18+ |
| [AWS Lambda](./adapters/lambda.md) | `@litmdx/agent/adapters/lambda` | Lambda + API Gateway / Function URL |
| [Hono](./adapters/cloudflare-workers.md) | `@litmdx/agent/adapters/hono` | Cloudflare Workers, Deno Deploy, Bun |

## How the agent gets the documentation index

All adapters need to know which documentation pages exist and what they contain.
There are three ways to provide this, in priority order:

### 1. `index` — pre-built in memory _(Hono only)_

```ts
import entries from './docs-index.json';
const index = new Map(entries.map(e => [e.path, e]));

createHonoApp({ index, provider: 'openai', apiKey: env.OPENAI_API_KEY });
```

Use when:
- Running on **Cloudflare Workers** (no filesystem at request time).
- You bundled `docs-index.json` as a static import via Wrangler or esbuild.
- You need zero cold-start latency for index loading.

The agent skips all index-loading logic and uses the Map directly.

---

### 2. `docsIndexUrl` — fetch from the live docs site

```ts
createHonoApp({
  docsIndexUrl: 'https://my-docs.example.com/docs-index.json',
  provider: 'openai',
  apiKey: env.OPENAI_API_KEY,
});
```

Use when:
- The **agent and the docs site are deployed independently**.
- You don't want to bundle the index into the agent at build time.
- Works on any runtime with a Web-standard `fetch` API (CF Workers, Lambda, Node.js 18+).

`litmdx build` generates `dist/docs-index.json` automatically when `agent.enabled: true`
in `litmdx.config.ts`. Deploy it with the rest of your static files and point
`docsIndexUrl` at the public URL.

The index is fetched **once** on the first request (lazy singleton), then cached
in memory for the lifetime of the process or worker instance.

See [docs-index.md](./docs-index.md) for the JSON format and how litmdx generates it.

---

### 3. `docsDir` — read `.mdx` files from disk

```ts
createNodeHttpServer({
  docsDir: './docs',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
});
```

Use when:
- Running on **Node.js** with filesystem access.
- Developing locally alongside your docs.
- The agent and the docs source live in the same environment.

The index is built synchronously at startup by reading and parsing every `.mdx` file
under `docsDir`. Not available on Cloudflare Workers.

---

## Providers

| Provider | `provider` value | Default env var |
|---|---|---|
| OpenAI | `'openai'` | `OPENAI_API_KEY` |
| Anthropic | `'anthropic'` | `ANTHROPIC_API_KEY` |
| Amazon Bedrock | `'bedrock'` | AWS SDK credentials |
| Google Gemini | `'gemini'` | `GEMINI_API_KEY` |

## Quick start (Node.js)

```bash
pnpm add @litmdx/agent
```

```ts
import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';

await createNodeHttpServer({
  docsDir: './docs',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  port: 8000,
  allowedOrigins: ['http://localhost:5173'],
});
```

Or use the built-in CLI server:

```bash
OPENAI_API_KEY=sk-... node dist/bin/server.js --docs ./docs --port 8000
```

## Chat API

All adapters expose the same endpoint:

```
POST /chat/stream
Content-Type: application/json

{ "message": "How do I configure the sidebar?", "session_id": "abc123" }
```

Response: Server-Sent Events stream.

```
data: Here is how
data:  to configure
data:  the sidebar…
data: [DONE]
```
