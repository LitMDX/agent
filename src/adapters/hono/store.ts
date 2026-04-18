/**
 * Lazy-initialised singleton store for the Hono adapter.
 *
 * `createGetStore` returns a `getStore()` function that builds the
 * SessionStore + dispatcher exactly once, on the first request. Subsequent
 * calls return the cached pair — safe for long-lived processes and edge
 * runtimes where the module may be reused across invocations.
 */

import path from "node:path";
import { createTools } from "../../tools/index.js";
import { SessionStore } from "../../session/index.js";
import { MemoryStorage } from "../../session/memory-storage.js";
import { buildModel } from "../../model/index.js";
import { createDispatcher } from "../../dispatcher/index.js";
import { defaultSystemPrompt } from "../shared.js";
import { configureSdkLogging } from "../../logging/sdk.js";
import { fetchRemoteIndex } from "../../indexer/index.js";
import type { HonoAdapterOptions } from "./types.js";
import type { Model, BaseModelConfig } from "@strands-agents/sdk";

export interface StoreHandle {
  store: SessionStore;
  dispatch: ReturnType<typeof createDispatcher>;
}

export function createGetStore(opts: HonoAdapterOptions): () => Promise<StoreHandle> {
  let cached: StoreHandle | undefined;

  configureSdkLogging(opts.sdkLogging);

  return async function getStore(): Promise<StoreHandle> {
    if (cached) return cached;

    const docsDir = opts.docsDir ?? process.env["LITMDX_AGENT_DOCS_DIR"] ?? "./docs";
    const { provider, apiKey = "", model, systemPrompt, windowSize = 10 } = opts;
    const storage = opts.storage ?? new MemoryStorage();
    const {
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
    } = opts;

    let index = opts.index;
    if (!index) {
      if (opts.docsIndexUrl) {
        index = await fetchRemoteIndex(opts.docsIndexUrl);
      } else {
        // Dynamic import keeps node:fs / node:os out of the CF Workers bundle when
        // a custom storage adapter or docsIndexUrl is provided.
        const { buildIndex } = await import("../../indexer/index.js");
        index = buildIndex(path.resolve(docsDir));
      }
    }

    const tools = createTools(index);
    const sp = systemPrompt ?? defaultSystemPrompt(path.basename(docsDir));

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
    });
    const dispatch = createDispatcher(store, { provider, model });

    cached = { store, dispatch };
    return cached;
  };
}
