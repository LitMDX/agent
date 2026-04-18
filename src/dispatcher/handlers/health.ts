/**
 * Handler: GET /health
 *
 * Returns the current service status including active session count,
 * configured provider, and model name.
 */

import type { SessionStore } from "../../session/index.js";
import type { AgentResponseKind, DispatcherConfig } from "../types.js";

export function handleHealth(store: SessionStore, config: DispatcherConfig): AgentResponseKind {
  return {
    kind: "json",
    status: 200,
    body: {
      status: "ok",
      sessions: store.size(),
      provider: config.provider,
      model: config.model,
    },
  };
}
