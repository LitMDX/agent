# AWS Lambda Adapter

Deploys the agent as an AWS Lambda function. Supports **Response Streaming**
(recommended) and buffered mode for API Gateway.

```ts
import { createLambdaHandler } from '@litmdx/agent/adapters/lambda';
```

## Usage

```ts
// handler.ts
import { createLambdaHandler } from '@litmdx/agent/adapters/lambda';

export const handler = createLambdaHandler({
  docsDir: './docs',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  allowedOrigins: ['https://my-docs.example.com'],
});
```

The handler is lazily initialized — the docs index and model are built on the
**first invocation**, then reused for subsequent warm calls.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `docsDir` | `string` | `./docs` | Path to the `.mdx` docs directory. Falls back to `LITMDX_AGENT_DOCS_DIR` env var. |
| `docsIndexUrl` | `string` | — | URL of `docs-index.json`. Takes precedence over `docsDir`. |
| `provider` | `AgentProvider` | — | LLM provider: `'openai'`, `'anthropic'`, `'bedrock'`, `'gemini'`. |
| `apiKey` | `string` | `''` | API key. Defaults to the provider's standard env var. |
| `model` | `string` | provider default | Model ID override. |
| `systemPrompt` | `string` | built-in | Override the full system prompt. |
| `windowSize` | `number` | `10` | Conversation history window (messages). |
| `storage` | `SnapshotStorage` | — | Session storage. Recommended: `S3Storage` from `@strands-agents/sdk`. |
| `allowedOrigins` | `string[]` | `[]` | Allowed CORS origins. |
| `streaming` | `boolean` | `true` | Use Lambda Response Streaming. Set to `false` for API Gateway buffered mode. |

## Index source

### `docsIndexUrl` (recommended for Lambda)

The Lambda function has access to the filesystem only during the build/packaging
step, not at runtime on the deployed environment. Using `docsIndexUrl` removes
the need to bundle or deploy the docs alongside the function:

```ts
export const handler = createLambdaHandler({
  docsIndexUrl: 'https://my-docs.example.com/docs-index.json',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});
```

The index is fetched on the first warm invocation and cached for subsequent calls.

### `docsDir` (when docs are bundled with the function)

If you deploy the `.mdx` files alongside your Lambda package (e.g. in a Docker
container or a Lambda layer), you can read them directly:

```ts
export const handler = createLambdaHandler({
  docsDir: path.join(__dirname, 'docs'),
  provider: 'anthropic',
});
```

## Streaming vs. buffered

### Response Streaming (default, `streaming: true`)

Requires a **Lambda Function URL** with `InvokeMode: RESPONSE_STREAM`, or
a streaming-compatible API Gateway setup.

Tokens stream to the browser as they are generated — lower perceived latency.

```ts
export const handler = createLambdaHandler({
  docsDir: './docs',
  provider: 'openai',
  streaming: true, // default
});
```

`template.yml` (SAM):
```yaml
MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionUrlConfig:
      AuthType: NONE
      InvokeMode: RESPONSE_STREAM
    Cors:
      AllowOrigins:
        - 'https://my-docs.example.com'
```

### Buffered mode (`streaming: false`)

Use with API Gateway HTTP API or REST API when streaming is not available.
The full agent response is accumulated in memory before returning:

```ts
export const handler = createLambdaHandler({
  docsDir: './docs',
  provider: 'openai',
  streaming: false,
});
```

## Session storage

Lambda functions are stateless — session history is lost between cold starts
unless you provide a persistent storage backend. Use `S3Storage` from
`@strands-agents/sdk`:

```ts
import { S3Storage } from '@strands-agents/sdk';
import { createLambdaHandler } from '@litmdx/agent/adapters/lambda';

export const handler = createLambdaHandler({
  docsDir: './docs',
  provider: 'openai',
  storage: new S3Storage({
    bucket: process.env.SESSIONS_BUCKET!,
    prefix: 'agent-sessions/',
  }),
});
```

## Environment variables

| Variable | Description |
|---|---|
| `LITMDX_AGENT_DOCS_DIR` | Fallback docs directory path |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `AWS_REGION` | Required for Bedrock |
