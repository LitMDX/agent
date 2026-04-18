import { describe, it, expect, vi } from "vitest";
import { SessionStore } from "../../src/session/store.js";
import type { SessionConfig } from "../../src/session/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAgent(overrides?: Partial<{ deleteSession: () => Promise<void> }>) {
  return {
    invoke: async (msg: string) => `echo: ${msg}`,
    async *stream(msg: string) {
      yield {
        type: "modelStreamUpdateEvent",
        event: { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: msg } },
      };
    },
    sessionManager: {
      deleteSession: overrides?.deleteSession ?? vi.fn().mockResolvedValue(undefined),
    },
    appState: {},
  };
}

/** Minimal SessionConfig — the agentFactory override bypasses SDK entirely. */
const baseConfig: SessionConfig = {
  getModel: async () => {
    throw new Error("should not build model in tests");
  },
  tools: [],
  systemPrompt: "test",
  windowSize: 5,
};

function makeStore(agentOverrides?: Partial<{ deleteSession: () => Promise<void> }>) {
  const mockAgent = makeMockAgent(agentOverrides);
  const agentFactory = vi.fn().mockResolvedValue(mockAgent);
  const store = new SessionStore(baseConfig, agentFactory as never);
  return { store, agentFactory, mockAgent };
}

// ---------------------------------------------------------------------------
// SessionStore — getOrCreate
// ---------------------------------------------------------------------------

describe("SessionStore — getOrCreate", () => {
  it("returns an agent for a new sessionId", async () => {
    const { store } = makeStore();
    const agent = await store.getOrCreate("s1");
    expect(agent).toBeDefined();
  });

  it("calls the agentFactory once for a new session", async () => {
    const { store, agentFactory } = makeStore();
    await store.getOrCreate("s1");
    expect(agentFactory).toHaveBeenCalledOnce();
    expect(agentFactory).toHaveBeenCalledWith("s1");
  });

  it("returns the same agent instance for the same sessionId", async () => {
    const { store } = makeStore();
    const first = await store.getOrCreate("s1");
    const second = await store.getOrCreate("s1");
    expect(first).toBe(second);
  });

  it("does not call agentFactory a second time for an existing session", async () => {
    const { store, agentFactory } = makeStore();
    await store.getOrCreate("s1");
    await store.getOrCreate("s1");
    expect(agentFactory).toHaveBeenCalledOnce();
  });

  it("creates independent agents for different sessionIds", async () => {
    const agentA = makeMockAgent();
    const agentB = makeMockAgent();
    let call = 0;
    const agentFactory = vi.fn().mockImplementation(async () => (call++ === 0 ? agentA : agentB));
    const store = new SessionStore(baseConfig, agentFactory as never);

    const a = await store.getOrCreate("a");
    const b = await store.getOrCreate("b");
    expect(a).toBe(agentA);
    expect(b).toBe(agentB);
  });
});

// ---------------------------------------------------------------------------
// SessionStore — size
// ---------------------------------------------------------------------------

describe("SessionStore — size", () => {
  it("returns 0 initially", () => {
    const { store } = makeStore();
    expect(store.size()).toBe(0);
  });

  it("increments by 1 for each new session", async () => {
    const { store } = makeStore();
    await store.getOrCreate("s1");
    expect(store.size()).toBe(1);
    await store.getOrCreate("s2");
    expect(store.size()).toBe(2);
  });

  it("does not increment for the same sessionId", async () => {
    const { store } = makeStore();
    await store.getOrCreate("s1");
    await store.getOrCreate("s1");
    expect(store.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SessionStore — clear
// ---------------------------------------------------------------------------

describe("SessionStore — clear", () => {
  it("removes the session from the store", async () => {
    const { store } = makeStore();
    await store.getOrCreate("s1");
    await store.clear("s1");
    expect(store.size()).toBe(0);
  });

  it("does not affect other sessions", async () => {
    const { store } = makeStore();
    await store.getOrCreate("keep");
    await store.getOrCreate("remove");
    await store.clear("remove");
    expect(store.size()).toBe(1);
  });

  it("does not throw when clearing a non-existent session", async () => {
    const { store } = makeStore();
    await expect(store.clear("ghost")).resolves.toBeUndefined();
  });

  it("calls agent.sessionManager.deleteSession when deletePersistedData is true", async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const { store } = makeStore({ deleteSession });
    await store.getOrCreate("s1");
    await store.clear("s1", { deletePersistedData: true });
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it("does NOT call deleteSession when deletePersistedData is false", async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const { store } = makeStore({ deleteSession });
    await store.getOrCreate("s1");
    await store.clear("s1", { deletePersistedData: false });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("does NOT call deleteSession when opts is omitted", async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const { store } = makeStore({ deleteSession });
    await store.getOrCreate("s1");
    await store.clear("s1");
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("size decrements after clear", async () => {
    const { store } = makeStore();
    await store.getOrCreate("s1");
    await store.getOrCreate("s2");
    await store.clear("s1");
    expect(store.size()).toBe(1);
  });

  it("new agent can be created for a cleared sessionId", async () => {
    const { store, agentFactory } = makeStore();
    await store.getOrCreate("s1");
    await store.clear("s1");
    await store.getOrCreate("s1");
    expect(agentFactory).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// SessionStore — clearAll
// ---------------------------------------------------------------------------

describe("SessionStore — clearAll", () => {
  it("removes all sessions", async () => {
    const { store } = makeStore();
    await store.getOrCreate("s1");
    await store.getOrCreate("s2");
    await store.getOrCreate("s3");
    await store.clearAll();
    expect(store.size()).toBe(0);
  });

  it("calls deleteSession for each agent when deletePersistedData is true", async () => {
    const deleteA = vi.fn().mockResolvedValue(undefined);
    const deleteB = vi.fn().mockResolvedValue(undefined);
    let call = 0;
    const agentFactory = vi
      .fn()
      .mockImplementation(async () =>
        call++ === 0
          ? makeMockAgent({ deleteSession: deleteA })
          : makeMockAgent({ deleteSession: deleteB }),
      );
    const store = new SessionStore(baseConfig, agentFactory as never);

    await store.getOrCreate("a");
    await store.getOrCreate("b");
    await store.clearAll({ deletePersistedData: true });

    expect(deleteA).toHaveBeenCalledOnce();
    expect(deleteB).toHaveBeenCalledOnce();
  });

  it("does NOT call deleteSession when deletePersistedData is false", async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    const { store } = makeStore({ deleteSession });
    await store.getOrCreate("s1");
    await store.getOrCreate("s2");
    await store.clearAll({ deletePersistedData: false });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("does nothing on an empty store", async () => {
    const { store } = makeStore();
    await expect(store.clearAll()).resolves.toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it("size is 0 after clearAll", async () => {
    const { store } = makeStore();
    await store.getOrCreate("s1");
    await store.getOrCreate("s2");
    await store.clearAll();
    expect(store.size()).toBe(0);
  });
});
