# @litmdx/agent

AI documentation assistant powered by [Strands Agents](https://strandsagents.com).  
Answers questions about a LitMDX documentation site via a streaming chat API (`POST /chat/stream`).

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Adapters](#adapters)
  - [Node.js HTTP](#nodejs-http)
  - [AWS Lambda](#aws-lambda)
  - [Hono (Cloudflare Workers / Deno / Bun)](#hono-cloudflare-workers--deno--bun)
- [Documentation Index](#documentation-index)
- [Model Providers](#model-providers)
- [Session & Storage](#session--storage)
- [Multi-Agent Mode](#multi-agent-mode)
- [Plugins](#plugins)
  - [SkillsPlugin](#skillsplugin)
  - [RetryPlugin](#retryplugin)
  - [InterruptPlugin](#interruptplugin)
- [MCP Clients](#mcp-clients)
- [Built-in Tools](#built-in-tools)
- [Vite Plugin (Dev Integration)](#vite-plugin-dev-integration)
- [Standalone CLI Server](#standalone-cli-server)
- [HTTP API Reference](#http-api-reference)
- [Custom Integrations](#custom-integrations)
- [Environment Variables](#environment-variables)

---

## Overview

`@litmdx/agent` wraps the [Strands Agents TypeScript SDK](https://strandsagents.com) to provide a ready-to-deploy documentation assistant. It:

- **Indexes** your `.mdx` documentation files and exposes them as tools the model can call.
- **Answers** user questions by searching and reading docs at runtime — never from training knowledge.
- **Streams** responses token-by-token over Server-Sent Events (SSE).
- **Persists** conversation history across requests using configurable session storage.
- Ships three **deployment adapters**: Node.js HTTP, AWS Lambda, and Hono.

---

## Quick Start

```bash
npm install @litmdx/agent
```

```typescript
// server.ts
import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';

const server = await createNodeHttpServer({
  docsDir: './docs',
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
```

```bash
npx litmdx-agent --docs ./docs --provider anthropic
```

---

## Adapters

### Node.js HTTP

Runs a native `node:http` server. Ideal for local dev, Docker, and any Node.js 18+ environment.

```typescript
import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';

await createNodeHttpServer({
  docsDir: './docs',            // or docsIndexUrl: 'https://...'
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  port: 8000,                   // default: 8000
  host: '0.0.0.0',              // default: '0.0.0.0'
  allowedOrigins: ['https://my-docs.example.com'],
});
```

**Key options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `docsDir` | `string` | `'./docs'` | Path to `.mdx` files |
| `docsIndexUrl` | `string` | — | Fetch pre-built index from a live site |
| `provider` | `AgentProvider` | — | `'openai'` \| `'anthropic'` \| `'bedrock'` \| `'gemini'` |
| `apiKey` | `string` | env var | Provider API key |
| `model` | `string` | provider default | Model ID override |
| `port` | `number` | `8000` | Port to bind |
| `projectTitle` | `string` | docs basename | Used in the default system prompt |
| `systemPrompt` | `string` | built-in SOP | Custom system prompt |
| `windowSize` | `number` | `10` | Sliding-window conversation history |
| `sessionsDir` | `string` | OS temp | FileStorage directory |
| `s3Sessions` | `object` | — | S3 session storage shorthand |
| `allowedOrigins` | `string[]` | localhost | CORS allowed origins |
| `mcpClients` | `McpClient[]` | — | External MCP tool sources |
| `subAgents` | `SubAgentConfig[]` | — | Enable orchestrator/specialist mode |
| `interceptToolCall` | `ToolInterceptFn` | — | Block or audit tool calls |
| `logging` | `boolean` | `true` | Structured lifecycle logging |
| `sdkLogging` | `boolean \| Logger` | — | Strands SDK observability logs |
| `notebook` | `boolean` | — | Enable the Strands notebook vended tool |

---

### AWS Lambda

Supports two response modes:

- **Response Streaming** (default) — requires Lambda Function URL with `InvokeMode: RESPONSE_STREAM`
- **Buffered** — for API Gateway / standard Lambda URLs

```typescript
import { createLambdaHandler } from '@litmdx/agent/adapters/lambda';

export const handler = createLambdaHandler({
  docsDir: './docs',
  provider: 'anthropic',
  // API key from ANTHROPIC_API_KEY env var — no need to hard-code
});

// Buffered mode (API Gateway):
export const handler = createLambdaHandler({
  docsDir: './docs',
  provider: 'bedrock',     // No API key needed — uses IAM role
  streaming: false,
});
```

**S3 session storage** is auto-configured from env vars or the `s3Sessions` shorthand:

```typescript
createLambdaHandler({
  docsDir: './docs',
  provider: 'bedrock',
  s3Sessions: { bucket: 'my-sessions', region: 'us-east-1' },
});
```

---

### Hono (Cloudflare Workers / Deno / Bun)

Works on any runtime that supports the Hono framework and the Web Fetch API. No filesystem access required.

```typescript
import { createHonoApp } from '@litmdx/agent/adapters/hono';

export default {
  fetch: createHonoApp({
    docsIndexUrl: 'https://my-docs.pages.dev/docs-index.json',
    provider: 'openai',
    apiKey: env.OPENAI_API_KEY,
    allowedOrigins: ['https://my-docs.pages.dev'],
  }).fetch,
};
```

**Cloudflare-native session storage** (exported from this adapter):

```typescript
import { createHonoApp, KVStorage, R2Storage } from '@litmdx/agent/adapters/hono';

createHonoApp({
  docsIndexUrl: '...',
  provider: 'openai',
  apiKey: env.OPENAI_API_KEY,
  storage: new KVStorage(env.SESSIONS_KV),   // Cloudflare KV
  // storage: new R2Storage(env.SESSIONS_R2), // Cloudflare R2
});
```

---

## Documentation Index

All adapters need the documentation index. Three strategies, in priority order:

### 1. `index` — pre-built Map (Hono)

```typescript
import entries from './docs-index.json';
const index = new Map(entries.map(e => [e.path, e]));
createHonoApp({ index, ... });
```

Zero cold-start latency. Required on Cloudflare Workers (no filesystem at request time).

### 2. `docsIndexUrl` — fetch from the live site

```typescript
createHonoApp({ docsIndexUrl: 'https://my-docs.example.com/docs-index.json', ... });
```

Fetched once on the first request and cached in memory. Works on all runtimes. The `docs-index.json` is generated automatically by `litmdx build` when `agent.enabled: true` in `litmdx.config.ts`.

### 3. `docsDir` — read `.mdx` files from disk

```typescript
createNodeHttpServer({ docsDir: './docs', ... });
```

Built synchronously at startup. Node.js only.

---

## Model Providers

| Provider | Value | Default Model | Peer Dependency |
|---|---|---|---|
| Anthropic | `'anthropic'` | `claude-3-5-sonnet-20241022` | `@anthropic-ai/sdk` |
| OpenAI | `'openai'` | `gpt-4o` | `openai` |
| Google Gemini | `'gemini'` | `gemini-1.5-flash` | `@google/generative-ai` |
| Amazon Bedrock | `'bedrock'` | `claude-3-5-sonnet` (cross-region) | — (uses IAM) |

API key resolution order: explicit `apiKey` option → `LITMDX_AGENT_API_KEY` env var → provider-specific env var (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`).

---

## Session & Storage

Conversation history is persisted per `session_id` using the Strands `SessionManager` + `SnapshotStorage` API.

**Conversation managers:**

- `'sliding-window'` (default) — discards the oldest messages when the context window fills up.
- `'summarizing'` — summarizes the oldest messages with a model call before discarding. Requires additional model tokens but preserves more context.

**Storage backends:**

| Backend | How to configure | Runtime |
|---|---|---|
| `MemoryStorage` | default on Hono/Workers | all (in-process only) |
| `FileStorage` | default on Node.js (OS temp dir) | Node.js |
| `S3Storage` | `s3Sessions: { bucket, region? }` | Lambda / Node.js |
| `KVStorage` | `storage: new KVStorage(env.KV)` | Cloudflare Workers |
| `R2Storage` | `storage: new R2Storage(env.R2)` | Cloudflare Workers |

**Clearing a session:** `DELETE /session?session_id=<id>`

---

## Multi-Agent Mode

Configure `subAgents` to switch from a single agent to an **orchestrator + specialist** pattern. The orchestrator delegates domain tasks to specialists rather than calling built-in tools directly.

```typescript
import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';

await createNodeHttpServer({
  docsDir: './docs',
  provider: 'anthropic',
  subAgents: [
    {
      name: 'docs_specialist',
      description: 'Search and retrieve documentation pages.',
      // systemPrompt: auto-generated if omitted
    },
    {
      name: 'code_specialist',
      description: 'Write working code examples from docs and library references.',
      systemPrompt: 'You are a code example specialist…',
      tools: [getPageTool, createContext7Client()],
    },
  ],
});
```

**Auto-injection:** If `subAgents` is non-empty and no sub-agent named `docs_specialist` is present, one is injected automatically with the built-in tools and default prompt.

**Prompts:** Use `defaultDocsSpecialistSystemPrompt()` and `defaultOrchestratorSystemPrompt(name, specialistNames)` as starting points for custom orchestration.

---

## Plugins

Plugins implement the Strands `Plugin` interface and are wired in automatically by the adapters based on the options you provide.

### SkillsPlugin

TypeScript port of the Python SDK's `AgentSkills` pattern. Injects an `<available_skills>` XML block into the system prompt and exposes a `skills` tool the model calls to load full instructions on demand.

```typescript
import { SkillsPlugin } from '@litmdx/agent';
import { Agent } from '@strands-agents/sdk';

const agent = new Agent({
  model,
  plugins: [
    new SkillsPlugin([
      {
        name: 'mdx-troubleshooting',
        description: 'Diagnose and fix MDX compilation errors.',
        instructions: '# MDX Troubleshooting\n…',
      },
    ]),
  ],
});
```

Or via adapter options:

```typescript
createNodeHttpServer({
  ...
  skills: [{ name: 'mdx-troubleshooting', description: '…', instructions: '…' }],
});
```

### RetryPlugin

Automatic retry of `ModelThrottledError` with exponential backoff. Implements `AfterModelCallEvent` hook — the TypeScript equivalent of the Python SDK's `ModelRetryStrategy`.

```typescript
import { RetryPlugin } from '@litmdx/agent';

new Agent({
  model, tools,
  plugins: [new RetryPlugin({ maxRetries: 3, retryDelayMs: 1000 })],
});
```

Or via adapter options:

```typescript
createNodeHttpServer({
  maxRetries: 3,
  retryDelayMs: 1000,
  ...
});
```

### InterruptPlugin

Intercept and optionally cancel tool calls before they execute. Implements `BeforeToolCallEvent` hook.

```typescript
import { InterruptPlugin } from '@litmdx/agent';

new Agent({
  model, tools,
  plugins: [
    new InterruptPlugin(({ name }) =>
      name === 'get_page' ? 'Access restricted.' : null
    ),
  ],
});
```

Or via adapter options:

```typescript
createNodeHttpServer({
  interceptToolCall: ({ name, input }) => {
    if (name === 'search_docs') return 'Search is temporarily disabled.';
    return null; // allow
  },
});
```

Return values: `string` → cancel with that message | `true` → cancel with default message | `null`/`undefined`/`false` → allow.

---

## MCP Clients

Any Strands `McpClient` can be passed as additional tool sources. The clients are connected lazily on first request.

```typescript
import { McpClient } from '@strands-agents/sdk';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

createNodeHttpServer({
  docsDir: './docs',
  provider: 'openai',
  mcpClients: [
    new McpClient({
      transport: new SSEClientTransport(new URL('http://localhost:3001/sse')),
    }),
  ],
});
```

### Context7

Built-in factory for the [Context7](https://mcp.context7.com) public MCP server — provides up-to-date library documentation with no auth or installation.

```typescript
import { createContext7Client } from '@litmdx/agent';

createNodeHttpServer({
  docsDir: './docs',
  provider: 'openai',
  mcpClients: [createContext7Client()],
});
```

Enable via the CLI: `npx litmdx-agent --context7 true`

---

## Built-in Tools

The agent has three built-in tools backed by the documentation index:

| Tool | Description |
|---|---|
| `search_docs` | Tokenized search across page titles, descriptions, and content. Returns ranked results with excerpts. |
| `get_page` | Returns the full Markdown content of a page (MDX stripped: no frontmatter, no JSX tags, `<Callout>` converted to bold labels). |
| `list_pages` | Returns all indexed pages with their path, title, and description. |

**Search scoring:** `title match +3` · `description match +2` · `content match +1` per token. Multi-word queries are tokenized and scored independently (OR semantics), then sorted descending.

---

## Vite Plugin (Dev Integration)

Starts the agent server alongside Vite's dev server and proxies `/api/agent/*` requests to it — no CORS configuration needed during development.

```typescript
// vite.config.ts
import { litmdxAgentPlugin } from '@litmdx/agent/vite';

export default {
  plugins: [
    litmdxAgentPlugin({
      docsDir: './docs',
      provider: 'openai',
    }),
  ],
};
```

**In LitMDX projects**, set `agent.enabled: true` in `litmdx.config.ts` — the plugin is registered automatically.

The plugin also exposes `/docs-index.json` during dev so that `docsIndexUrl: 'http://localhost:5173/docs-index.json'` works for external processes.

---

## Standalone CLI Server

```bash
npx litmdx-agent [options]
```

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--docs <path>` | `LITMDX_AGENT_DOCS_DIR` | `./docs` | Docs directory |
| `--docs-index-url <url>` | `LITMDX_AGENT_DOCS_INDEX_URL` | — | Remote index URL |
| `--provider <name>` | `LITMDX_AGENT_PROVIDER` | `openai` | Model provider |
| `--api-key <key>` | `LITMDX_AGENT_API_KEY` | — | API key |
| `--model <id>` | `LITMDX_AGENT_MODEL` | — | Model override |
| `--port <number>` | `LITMDX_AGENT_PORT` | `8000` | Port |
| `--title <string>` | `LITMDX_AGENT_TITLE` | — | Project title |
| `--sessions <path>` | `LITMDX_AGENT_SESSIONS_DIR` | OS temp | Session directory |
| `--s3-bucket <name>` | `LITMDX_AGENT_S3_BUCKET` | — | S3 bucket |
| `--s3-region <region>` | `LITMDX_AGENT_S3_REGION` / `AWS_REGION` | — | S3 region |
| `--s3-prefix <prefix>` | `LITMDX_AGENT_S3_PREFIX` | — | S3 key prefix |
| `--context7 true` | `LITMDX_AGENT_CONTEXT7` | — | Enable Context7 MCP |

**Generate a static docs-index.json:**

```bash
npx litmdx-build-index --docs ./docs --out ./public/docs-index.json
```

---

## HTTP API Reference

All adapters expose the same endpoints:

### `GET /health`

```json
{ "status": "ok", "pages": 12 }
```

### `POST /chat`

Non-streaming. Returns the full response once the agent finishes.

```json
// Request
{ "message": "How does WebMCP work?", "session_id": "abc123" }

// Response
{ "response": "WebMCP is a browser-native API…" }
```

### `POST /chat/stream`

SSE streaming. Each `data:` line is a text delta; `[DONE]` signals completion.

```
data: WebMCP\n\n
data:  is a browser-native API…\n\n
data: [DONE]\n\n
```

Optional body fields:
- `include_metrics: true` — emits `data: [METRICS] {...}` before `[DONE]`
- `include_traces: true` — emits `data: [TRACES] [{...}]` before `[DONE]`

Error events:
- `data: [ERROR] <message>` — stream terminated with an error

### `DELETE /session?session_id=<id>`

Clears the server-side session and its persisted snapshot.

```json
{ "cleared": "abc123" }
```

---

## Custom Integrations

Use the low-level exports to build custom adapters:

```typescript
import {
  buildIndex,           // Build DocsIndex from a directory
  createTools,          // Create the 3 built-in Strands tools
  buildModel,           // Build a Strands Model from provider config
  SessionStore,         // Session lifecycle manager
  createDispatcher,     // Route HTTP-like requests to handlers
} from '@litmdx/agent';
```

```typescript
import { buildIndex } from '@litmdx/agent';
import { buildIndex as buildIndexFromDir } from '@litmdx/agent/indexer';

const index = buildIndex('./docs');   // Map<string, PageEntry>

// Each PageEntry:
// { path, title, description, content, raw }
// - content: stripped prose (no MDX/JSX)
// - raw: original .mdx source (used by get_page via rawToMarkdown)
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `LITMDX_AGENT_PROVIDER` | Default provider (`openai`, `anthropic`, `bedrock`, `gemini`) |
| `LITMDX_AGENT_API_KEY` | API key (overrides provider-specific var) |
| `LITMDX_AGENT_MODEL` | Model ID override |
| `LITMDX_AGENT_DOCS_DIR` | Docs directory path |
| `LITMDX_AGENT_DOCS_INDEX_URL` | Remote `docs-index.json` URL |
| `LITMDX_AGENT_PORT` | Server port (default: `8000`) |
| `LITMDX_AGENT_TITLE` | Project title for the system prompt |
| `LITMDX_AGENT_SESSIONS_DIR` | FileStorage session directory |
| `LITMDX_AGENT_S3_BUCKET` | S3 bucket for session snapshots |
| `LITMDX_AGENT_S3_REGION` | S3 region (falls back to `AWS_REGION`) |
| `LITMDX_AGENT_S3_PREFIX` | S3 key prefix |
| `LITMDX_AGENT_CONTEXT7` | `true` to enable Context7 MCP client |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |

---

## License

Apache-2.0
