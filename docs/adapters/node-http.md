# Node HTTP Adapter

Runs the agent as a plain Node.js HTTP server. The simplest option for
self-hosted deployments on a VPS, Railway, Render, Fly.io, etc.

```ts
import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';
```

## Usage

```ts
import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';

const server = await createNodeHttpServer({
  docsDir: './docs',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  port: 8000,
  allowedOrigins: ['https://my-docs.example.com'],
});
// server is a node:http.Server — already listening
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `docsDir` | `string` | — | Path to the `.mdx` docs directory. Required unless `docsIndexUrl` is set. |
| `docsIndexUrl` | `string` | — | URL of `docs-index.json`. Takes precedence over `docsDir`. |
| `provider` | `AgentProvider` | — | LLM provider: `'openai'`, `'anthropic'`, `'bedrock'`, `'gemini'`. |
| `apiKey` | `string` | `''` | API key. Defaults to the provider's standard env var. |
| `model` | `string` | provider default | Model ID override. |
| `port` | `number` | `8000` | Port to listen on. |
| `host` | `string` | `'0.0.0.0'` | Host to bind to. |
| `projectTitle` | `string` | `basename(docsDir)` | Title used in the default system prompt. |
| `systemPrompt` | `string` | built-in | Override the full system prompt. |
| `windowSize` | `number` | `10` | Conversation history window (messages). |
| `sessionsDir` | `string` | — | Directory for session snapshot files. |
| `storage` | `SnapshotStorage` | — | Custom session storage (overrides `sessionsDir`). |
| `allowedOrigins` | `string[]` | `[]` | Extra CORS origins. `localhost:5173` and `127.0.0.1:5173` are always included. |

## Index source

The adapter supports two ways to load the documentation index.

### `docsDir` (default for local / self-hosted)

The agent reads all `.mdx` files from the directory at startup:

```ts
createNodeHttpServer({
  docsDir: './docs',   // reads ./docs/**/*.mdx synchronously
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
});
```

### `docsIndexUrl` (separate deployment)

When the docs site and the agent are deployed independently, let the agent
fetch the pre-built index from the live site instead:

```ts
createNodeHttpServer({
  docsDir: './docs',                                    // fallback if fetch fails
  docsIndexUrl: 'https://my-docs.example.com/docs-index.json',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
});
```

The index is fetched once at startup. The `docsDir` value is only used to
derive the default system prompt title when `docsIndexUrl` is set.

## Dev server CLI

You can run the adapter without writing any code using the built-in CLI:

```bash
# From source
node dist/bin/server.js --docs ./docs --provider openai --port 8000

# With env file
node --env-file=.env dist/bin/server.js --docs ./docs
```

| Flag | Env var fallback | Default |
|---|---|---|
| `--docs <path>` | `LITMDX_AGENT_DOCS_DIR` | `./docs` |
| `--provider <name>` | `LITMDX_AGENT_PROVIDER` | `openai` |
| `--api-key <key>` | `LITMDX_AGENT_API_KEY` → provider env | — |
| `--model <id>` | `LITMDX_AGENT_MODEL` | provider default |
| `--port <number>` | `LITMDX_AGENT_PORT` | `8000` |
| `--title <string>` | — | `basename(docsDir)` |
| `--sessions <path>` | `LITMDX_AGENT_SESSIONS_DIR` | — |

## Integration with LitMDX dev server

When `agent.enabled: true` in `litmdx.config.ts`, the LitMDX dev server proxies
`/api/agent/*` → `agent.serverUrl` (default `http://localhost:8000`), so the chat
widget works without CORS issues during local development.

```ts
// litmdx.config.ts
export default defineConfig({
  agent: {
    enabled: true,
    serverUrl: 'http://localhost:8000',
  },
});
```

Start both processes in parallel:

```bash
# Terminal 1
pnpm litmdx dev

# Terminal 2
node dist/bin/server.js --docs ./docs
```
