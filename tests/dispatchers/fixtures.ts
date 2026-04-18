/**
 * Shared test helpers for dispatcher-related tests.
 */

import type { Agent } from "@strands-agents/sdk";
import { SessionStore } from "../../src/session/index.js";
import type { AgentRequest } from "../../src/dispatcher/types.js";

// ---------------------------------------------------------------------------
// Mock stream event builders
// ---------------------------------------------------------------------------

export function makeTextDeltaEvent(text: string) {
  return {
    type: "modelStreamUpdateEvent",
    event: {
      type: "modelContentBlockDeltaEvent",
      delta: { type: "textDelta", text },
    },
  };
}

export function makeAgentResultEvent(result: {
  structuredOutput?: unknown;
  metrics?: unknown;
  traces?: unknown;
}) {
  return {
    type: "agentResultEvent",
    result,
  };
}

// ---------------------------------------------------------------------------
// Mock agent factory
// ---------------------------------------------------------------------------

export interface MockAgentOverrides {
  invoke?: (msg: string) => Promise<string>;
  stream?: (msg: string) => AsyncGenerator<unknown>;
}

export function makeMockAgent(overrides?: MockAgentOverrides): Agent {
  return {
    invoke: overrides?.invoke ?? (async (msg: string) => `echo: ${msg}`),
    stream:
      overrides?.stream ??
      async function* (msg: string) {
        yield makeTextDeltaEvent(`hello from ${msg}`);
      },
    sessionManager: undefined,
    appState: {},
  } as unknown as Agent;
}

// ---------------------------------------------------------------------------
// SessionStore backed by the mock agent
// ---------------------------------------------------------------------------

export function makeMockStore(overrides?: MockAgentOverrides) {
  const mockAgent = makeMockAgent(overrides);

  const store = new SessionStore(
    {
      getModel: async () => {
        throw new Error("should not build model in tests");
      },
      tools: [],
      systemPrompt: "test",
      windowSize: 5,
    },
    async (_sessionId: string) => mockAgent as never,
  );

  return { store, mockAgent };
}

// ---------------------------------------------------------------------------
// AgentRequest factory with sensible defaults
// ---------------------------------------------------------------------------

export function makeRequest(overrides?: Partial<AgentRequest>): AgentRequest {
  return {
    method: "GET",
    pathname: "/",
    searchParams: new URLSearchParams(),
    body: {},
    origin: "http://localhost",
    ...overrides,
  };
}
