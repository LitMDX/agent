/**
 * Shared types for the transport-agnostic dispatcher.
 *
 * Imported by adapters (node-http, lambda, hono) and by the route handlers.
 */

import type { AgentProvider } from "../model/index.js";

// ---------------------------------------------------------------------------
// Request / Response contracts
// ---------------------------------------------------------------------------

export interface AgentRequest {
  method: string;
  pathname: string;
  /** Raw query string params, e.g. from ?session_id=abc */
  searchParams: URLSearchParams;
  body: Record<string, unknown>;
  origin: string;
}

export type AgentResponseKind =
  | { kind: "json"; status: number; body: unknown }
  | { kind: "stream"; status: 200; body: AsyncGenerator<string> };

// ---------------------------------------------------------------------------
// Dispatcher configuration
// ---------------------------------------------------------------------------

export interface DispatcherConfig {
  provider: AgentProvider;
  model: string | undefined;
}
