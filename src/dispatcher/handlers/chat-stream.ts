/**
 * Handler: POST /chat/stream  (SSE)
 *
 * Returns a streaming response whose body is an async generator of
 * SSE-encoded strings. Adapters write each yielded chunk directly to the
 * response stream.
 */

import type { SessionStore } from "../../session/index.js";
import type { AgentRequest, AgentResponseKind } from "../types.js";
import { streamResponse } from "../sse.js";

export async function handleChatStream(
  req: AgentRequest,
  store: SessionStore,
): Promise<AgentResponseKind> {
  const message = (req.body["message"] as string | undefined)?.trim();
  if (!message) {
    return { kind: "json", status: 400, body: { error: '"message" is required' } };
  }
  const sessionId = (req.body["session_id"] as string | undefined) ?? "default";
  const agent = await store.getOrCreate(sessionId);
  return {
    kind: "stream",
    status: 200,
    body: streamResponse(agent, message, {
      includeMetrics: req.body["include_metrics"] === true,
      includeTraces: req.body["include_traces"] === true,
    }),
  };
}
