/**
 * AWS Lambda adapter for @litmdx/agent.
 *
 * Supports two streaming modes:
 *   - Response Streaming (recommended) via `awslambda.streamifyResponse()`
 *     Requires Lambda function URL with `InvokeMode: RESPONSE_STREAM`.
 *   - Buffered (fallback) — collects the full SSE text and returns it as a
 *     plain JSON response. Suitable for API Gateway + standard Lambda URLs.
 *
 * Usage (streaming, recommended):
 *   import { createLambdaHandler } from '@litmdx/agent/adapters/lambda';
 *   export const handler = createLambdaHandler({ docsDir: './docs', provider: 'anthropic' });
 *
 * Usage (buffered / API Gateway):
 *   export const handler = createLambdaHandler({ ..., streaming: false });
 */

import path from "node:path";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { buildIndex } from "../../indexer/index.js";
import { fetchRemoteIndex } from "../../indexer/index.js";
import { createTools } from "../../tools/index.js";
import { SessionStore, resolveS3Storage } from "../../session/index.js";
import { buildModel } from "../../model/index.js";
import { createDispatcher } from "../../dispatcher/index.js";
import { resolveCorsOrigin, buildCorsHeaders } from "./cors.js";
import { defaultSystemPrompt } from "../shared.js";
import { configureSdkLogging } from "../../logging/sdk.js";
import type { Model, BaseModelConfig } from "@strands-agents/sdk";
import type { LambdaAdapterOptions, LambdaHandler } from "./types.js";

export type { LambdaAdapterOptions, LambdaHandler };

/**
 * Creates a Lambda handler with lazy initialization.
 * The docs index and model are built once on the first invocation
 * (warm start benefit), not at module load time.
 */
export function createLambdaHandler(opts: LambdaAdapterOptions): LambdaHandler {
  const { streaming = true } = opts;

  configureSdkLogging(opts.sdkLogging);

  // Lazy singletons — initialized on first invocation.
  let store: SessionStore | undefined;
  let dispatch: ReturnType<typeof createDispatcher> | undefined;

  async function init() {
    if (store && dispatch) return { store, dispatch };

    const docsDir =
      opts.docsDir ?? process.env["LITMDX_AGENT_DOCS_DIR"] ?? path.join(process.cwd(), "docs");
    const docsIndexUrl = opts.docsIndexUrl ?? process.env["LITMDX_AGENT_DOCS_INDEX_URL"];

    const s3Sessions =
      opts.s3Sessions ??
      (process.env["LITMDX_AGENT_S3_BUCKET"]
        ? {
            bucket: process.env["LITMDX_AGENT_S3_BUCKET"]!,
            region: process.env["LITMDX_AGENT_S3_REGION"] ?? process.env["AWS_REGION"],
            prefix: process.env["LITMDX_AGENT_S3_PREFIX"],
          }
        : undefined);

    const {
      provider,
      apiKey = "",
      model,
      systemPrompt = defaultSystemPrompt(
        docsIndexUrl ? new URL(docsIndexUrl).hostname : path.basename(docsDir),
      ),
      windowSize = 10,
    } = opts;

    const storage = opts.storage ?? (await resolveS3Storage(s3Sessions));

    let index;
    if (docsIndexUrl) {
      index = await fetchRemoteIndex(docsIndexUrl);
    } else {
      index = buildIndex(path.resolve(docsDir));
    }
    const tools = createTools(index);

    let _model: Model<BaseModelConfig> | undefined;
    const getModel = async () => {
      if (!_model) _model = await buildModel(provider, apiKey, model);
      return _model;
    };

    store = new SessionStore({ getModel, tools, systemPrompt, windowSize, storage });
    dispatch = createDispatcher(store, { provider, model });

    return { store, dispatch };
  }

  return async function handler(
    event: APIGatewayProxyEventV2,
    _context: Context,
  ): Promise<APIGatewayProxyResultV2> {
    const { dispatch: d } = await init();

    const origin = event.headers?.["origin"] ?? "";
    const allowedOrigins = opts.allowedOrigins ?? ["*"];
    const corsOrigin = resolveCorsOrigin(allowedOrigins, origin);
    const corsHeaders = buildCorsHeaders(corsOrigin);

    // CORS preflight
    if (event.requestContext.http.method === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders, body: "" };
    }

    const body = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
    const qs = new URLSearchParams(event.rawQueryString ?? "");

    const result = await d({
      method: event.requestContext.http.method,
      pathname: event.requestContext.http.path,
      searchParams: qs,
      body,
      origin,
    });

    if (result.kind === "json") {
      return {
        statusCode: result.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify(result.body),
      };
    }

    // SSE stream
    if (streaming) {
      const chunks: string[] = [];
      for await (const chunk of result.body) {
        chunks.push(chunk);
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Transfer-Encoding": "chunked",
          ...corsHeaders,
        },
        body: chunks.join(""),
      };
    }

    // Buffered: collect full SSE text → return as plain text
    const parts: string[] = [];
    for await (const chunk of result.body) {
      parts.push(chunk);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain", ...corsHeaders },
      body: parts.join(""),
    };
  };
}
