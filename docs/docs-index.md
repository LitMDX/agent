# docs-index.json

The `docs-index.json` file is a JSON representation of all documentation pages
in a LitMDX site. It is the data source the agent uses to answer questions.

## Format

An array of `PageEntry` objects:

```ts
interface PageEntry {
  /** Route path, e.g. '/getting-started' */
  path: string;
  /** Page title from frontmatter */
  title: string;
  /** Short description from frontmatter (`description` field) */
  description: string;
  /** Cleaned plain text content (JSX and code blocks stripped) */
  content: string;
  /** Full raw MDX source */
  raw: string;
}
```

Example:

```json
[
  {
    "path": "/getting-started",
    "title": "Getting Started",
    "description": "Install and run LitMDX in five minutes.",
    "content": "Install LitMDX with pnpm add litmdx …",
    "raw": "---\ntitle: Getting Started\n---\n\n# Getting Started\n…"
  }
]
```

## Generation methods

### Method 1 — `litmdx build` (automatic)

When `agent.enabled: true` in `litmdx.config.ts`, the build command
automatically writes `dist/docs-index.json` alongside the static site output.

```ts
// litmdx.config.ts
export default defineConfig({
  agent: {
    enabled: true,
  },
});
```

```bash
pnpm litmdx build
# → dist/index.html
# → dist/docs-index.json   ← generated automatically
```

Deploy `dist/` to Cloudflare Pages, Netlify, Vercel, or any static host.
The index will be accessible at `https://your-site.example.com/docs-index.json`.

### Method 2 — `litmdx-build-index` CLI (standalone)

Use this when you want to generate the index independently of a LitMDX build,
for example in a CI pipeline that builds the agent separately:

```bash
# Using the binary after building the agent package
node dist/bin/build-index.js --docs ./docs --out ./docs-index.json

# Or via the npm script
pnpm build:index
```

Options:

| Flag | Default | Description |
|---|---|---|
| `--docs <dir>` | `./docs` | Path to the `.mdx` docs directory |
| `--out <file>` | `./docs-index.json` | Output file path |

## Using the index in your adapter

### Fetch at runtime (`docsIndexUrl`)

Pass the URL of the deployed `docs-index.json` to any adapter:

```ts
createHonoApp({
  docsIndexUrl: 'https://my-docs.example.com/docs-index.json',
  provider: 'openai',
  apiKey: env.OPENAI_API_KEY,
});
```

The index is fetched once (lazy singleton) and cached in memory.
The URL must return a JSON array of `PageEntry` objects with the correct
`Content-Type: application/json` header.

### Bundle into the worker (`index`)

For edge runtimes where outbound fetches are undesirable or the docs are
not publicly accessible:

```ts
import entries from './docs-index.json';
import type { PageEntry } from '@litmdx/agent';

const index = new Map((entries as PageEntry[]).map(e => [e.path, e]));

createHonoApp({ index, provider: 'openai', apiKey: env.OPENAI_API_KEY });
```

### Read from disk (`docsDir`)

For Node.js environments, skip the pre-built index entirely and let the
agent parse the `.mdx` files directly at startup:

```ts
createNodeHttpServer({
  docsDir: './docs',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
});
```

## TypeScript types

```ts
import type { DocsIndex, PageEntry } from '@litmdx/agent';

// DocsIndex = Map<string, PageEntry>
// Key = page path (e.g. '/getting-started')
```

Import from the root of the package:

```ts
import { buildIndex, fetchRemoteIndex } from '@litmdx/agent';
```

| Export | Description |
|---|---|
| `buildIndex(docsDir)` | Build a `DocsIndex` from a local directory. Node.js only. |
| `fetchRemoteIndex(url)` | Fetch and parse a remote `docs-index.json`. |
