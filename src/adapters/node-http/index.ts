/**
 * Node.js `http` adapter for @litmdx/agent.
 *
 * Usage:
 *   import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';
 *
 *   const server = await createNodeHttpServer({
 *     docsDir: './docs',
 *     provider: 'openai',
 *     apiKey: process.env.OPENAI_API_KEY!,
 *     port: 8000,
 *     allowedOrigins: ['https://my-docs.github.io'],
 *   });
 */

import http from "node:http";
import path from "node:path";
import { buildIndex } from "../../indexer/index.js";
import { fetchRemoteIndex } from "../../indexer/index.js";
import { createTools } from "../../tools/index.js";
import { SessionStore, resolveS3Storage } from "../../session/index.js";
import { buildModel } from "../../model/index.js";
import { createDispatcher } from "../../dispatcher/index.js";
import { applyCors, DEV_ORIGINS } from "./cors.js";
import { readBody } from "./body.js";
import { defaultSystemPrompt } from "../shared.js";
import { configureSdkLogging } from "../../logging/sdk.js";
import type { Model, BaseModelConfig } from "@strands-agents/sdk";
import type { NodeHttpAdapterOptions } from "./types.js";

export type { NodeHttpAdapterOptions };

export async function createNodeHttpServer(opts: NodeHttpAdapterOptions): Promise<http.Server> {
  const {
    docsDir = "./docs",
    docsIndexUrl,
    index: indexOpt,
    provider,
    apiKey = "",
    model,
    port = 8000,
    host = "0.0.0.0",
    projectTitle,
    systemPrompt,
    windowSize = 10,
    sessionsDir,
    s3Sessions,
    storage: storageOpt,
    mcpClients,
    logging,
    conversationManager,
    shouldTruncateResults,
    summaryRatio,
    preserveRecentMessages,
    structuredOutputSchema,
    maxRetries,
    retryDelayMs,
    notebook,
    sdkLogging,
    subAgents,
    orchestratorSystemPrompt,
  } = opts;

  configureSdkLogging(sdkLogging);

  const allowedOrigins = [...DEV_ORIGINS, ...(opts.allowedOrigins ?? [])];

  // Lazy initialisation — index + store are built on the first request so
  // that docsIndexUrl can point to a local dev server that starts after this
  // process (e.g. Vite on :5173 with the litmdx agent plugin).
  let dispatch: ReturnType<typeof createDispatcher> | undefined;

  async function init() {
    if (dispatch) return dispatch;

    const storage = storageOpt ?? (await resolveS3Storage(s3Sessions));

    let index;
    if (indexOpt) {
      index = indexOpt;
    } else if (docsIndexUrl) {
      index = await fetchRemoteIndex(docsIndexUrl);
      console.log(`  litmdx agent: ${index.size} page(s) fetched from '${docsIndexUrl}'`);
    } else {
      index = buildIndex(path.resolve(docsDir));
      console.log(`  litmdx agent: ${index.size} page(s) indexed from '${docsDir}'`);
    }

    const tools = createTools(index);
    const projectName =
      projectTitle ?? (docsIndexUrl ? new URL(docsIndexUrl).hostname : path.basename(docsDir));
    const sp = systemPrompt ?? defaultSystemPrompt(projectName);

    let _model: Model<BaseModelConfig> | undefined;
    const getModel = async () => {
      if (!_model) _model = await buildModel(provider, apiKey, model);
      return _model;
    };

    const store = new SessionStore({
      getModel,
      tools,
      systemPrompt: sp,
      windowSize,
      sessionsDir,
      storage,
      mcpClients,
      logging,
      conversationManager,
      shouldTruncateResults,
      summaryRatio,
      preserveRecentMessages,
      structuredOutputSchema,
      maxRetries,
      retryDelayMs,
      notebook,
      subAgents,
      projectName,
      orchestratorSystemPrompt,
    });
    dispatch = createDispatcher(store, { provider, model });
    return dispatch;
  }

  const server = http.createServer(async (req, res) => {
    const origin = (req.headers.origin as string) ?? "";
    applyCors(res, allowedOrigins, origin);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url!, `http://127.0.0.1:${port}`);
    const body = req.method === "POST" ? await readBody(req).catch(() => ({})) : {};

    let d: ReturnType<typeof createDispatcher>;
    try {
      d = await init();
    } catch (err) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent not ready", detail: (err as Error).message }));
      return;
    }

    const result = await d({
      method: req.method ?? "GET",
      pathname: url.pathname,
      searchParams: url.searchParams,
      body,
      origin,
    });

    if (result.kind === "json") {
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    // SSE stream
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    });

    req.on("close", () => {
      /* AbortController inside dispatcher handles cleanup */
    });

    for await (const chunk of result.body) {
      res.write(chunk);
    }
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  return server;
}
