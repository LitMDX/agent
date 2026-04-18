/**
 * Transport-agnostic request dispatcher.
 *
 * All adapters (node-http, lambda, hono) parse the incoming request into an
 * `AgentRequest` and call the function returned by `createDispatcher`. The
 * function returns a structured `AgentResponseKind` that each adapter maps to
 * its native response format.
 *
 * Routes:
 *   GET    /health          → handleHealth
 *   POST   /chat            → handleChat         (blocking)
 *   POST   /chat/stream     → handleChatStream   (SSE)
 *   DELETE /session         → handleDeleteSession
 */

import type { SessionStore } from "../session/index.js";
import type { AgentRequest, AgentResponseKind, DispatcherConfig } from "./types.js";
import { handleHealth } from "./handlers/health.js";
import { handleChat } from "./handlers/chat.js";
import { handleChatStream } from "./handlers/chat-stream.js";
import { handleDeleteSession } from "./handlers/session.js";

export type { AgentRequest, AgentResponseKind, DispatcherConfig };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDispatcher(
  store: SessionStore,
  config: DispatcherConfig,
): (req: AgentRequest) => Promise<AgentResponseKind> {
  return async function dispatch(req: AgentRequest): Promise<AgentResponseKind> {
    const { method, pathname } = req;

    if (method === "GET" && pathname === "/health") {
      return handleHealth(store, config);
    }

    if (method === "POST" && pathname === "/chat") {
      return handleChat(req, store);
    }

    if (method === "POST" && pathname === "/chat/stream") {
      return handleChatStream(req, store);
    }

    if (method === "DELETE" && pathname === "/session") {
      return handleDeleteSession(req, store);
    }

    return { kind: "json", status: 404, body: { error: "Not found" } };
  };
}
