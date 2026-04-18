/**
 * Handler: DELETE /session
 *
 * Clears the persisted data for the given session and removes it from the
 * in-memory store.
 */

import type { SessionStore } from "../../session/index.js";
import type { AgentRequest, AgentResponseKind } from "../types.js";

export async function handleDeleteSession(
  req: AgentRequest,
  store: SessionStore,
): Promise<AgentResponseKind> {
  const sessionId = req.searchParams.get("session_id") ?? "default";
  await store.clear(sessionId, { deletePersistedData: true });
  return { kind: "json", status: 200, body: { cleared: sessionId } };
}
