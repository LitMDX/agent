/**
 * Tests for RetryPlugin.
 *
 * Strategy: build a minimal fake Agent that captures every addHook call, then
 * invoke the registered callback directly with synthetic AfterModelCallEvent
 * objects to verify retry logic without touching the real Strands SDK or model.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AfterModelCallEvent, ModelThrottledError } from "@strands-agents/sdk";
import { RetryPlugin } from "../../../src/session/hooks/retry.js";
import type { Agent, LocalAgent } from "@strands-agents/sdk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventClass = abstract new (...args: any[]) => any;

function makeFakeAgent() {
  const registry = new Map<EventClass, Array<(e: unknown) => void>>();

  const stub = {
    addHook: vi.fn((eventClass: EventClass, cb: (e: unknown) => void) => {
      if (!registry.has(eventClass)) registry.set(eventClass, []);
      registry.get(eventClass)!.push(cb);
    }),
    fire(eventClass: EventClass, event: unknown) {
      for (const cb of registry.get(eventClass) ?? []) cb(event);
    },
    hookCount() {
      return [...registry.values()].reduce((n, list) => n + list.length, 0);
    },
  } as unknown as Agent & {
    fire: (cls: EventClass, event: unknown) => void;
    hookCount: () => number;
  };

  return stub;
}

const fakeAgentRef = {} as never;
const fakeModel = { modelId: "claude-test" } as never;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RetryPlugin", () => {
  let agent: ReturnType<typeof makeFakeAgent>;
  let logs: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    agent = makeFakeAgent();
    logs = [];
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  }, 30_000);

  /** Fire an AfterModelCallEvent with an optional error and return the mutable event. */
  function fireAfterModel(error?: Error) {
    const event = new AfterModelCallEvent({
      agent: fakeAgentRef,
      model: fakeModel,
      ...(error ? { error } : {}),
    });
    agent.fire(AfterModelCallEvent, event);
    return event;
  }

  // ── Plugin interface contract ───────────────────────────────────────

  it("has name 'litmdx:retry'", () => {
    expect(new RetryPlugin().name).toBe("litmdx:retry");
  });

  it("is an instance of RetryPlugin", () => {
    expect(new RetryPlugin()).toBeInstanceOf(RetryPlugin);
  });

  // ── Registration ──────────────────────────────────────────────

  it("registers exactly 1 hook callback on the agent", () => {
    new RetryPlugin().initAgent(agent as unknown as LocalAgent);
    expect(agent.hookCount()).toBe(1);
  });

  it("registers the hook on AfterModelCallEvent", () => {
    new RetryPlugin().initAgent(agent as unknown as LocalAgent);
    const registeredClasses = (agent.addHook as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0],
    );
    expect(registeredClasses).toContain(AfterModelCallEvent);
  });

  // ── No-retry cases ────────────────────────────────────────────────────────

  it("does NOT set event.retry on a successful call (no error)", async () => {
    new RetryPlugin({ maxRetries: 3, retryDelayMs: 0 }).initAgent(agent as unknown as LocalAgent);
    const event = fireAfterModel();
    await vi.runAllTimersAsync();
    expect(event.retry).toBeUndefined();
  });

  it("does NOT set event.retry for non-throttle errors", async () => {
    new RetryPlugin({ maxRetries: 3, retryDelayMs: 0 }).initAgent(agent as unknown as LocalAgent);
    const event = fireAfterModel(new Error("some other error"));
    await vi.runAllTimersAsync();
    expect(event.retry).toBeUndefined();
  });

  // ── Retry cases ───────────────────────────────────────────────────────────

  it("sets event.retry = true for ModelThrottledError within maxRetries", async () => {
    new RetryPlugin({
      maxRetries: 3,
      retryDelayMs: 0,
      logger: (m) => logs.push(m),
    }).initAgent(agent as unknown as LocalAgent);
    const event = fireAfterModel(new ModelThrottledError("rate limited"));
    await vi.runAllTimersAsync();
    expect(event.retry).toBe(true);
  });

  it("logs a retry message with attempt counter", async () => {
    new RetryPlugin({
      maxRetries: 3,
      retryDelayMs: 0,
      logger: (m) => logs.push(m),
    }).initAgent(agent as unknown as LocalAgent);
    fireAfterModel(new ModelThrottledError("rate limited"));
    await vi.runAllTimersAsync();
    expect(logs[0]).toContain("retry 1/3");
  });

  it("does NOT set event.retry once maxRetries is exhausted", async () => {
    new RetryPlugin({
      maxRetries: 2,
      retryDelayMs: 0,
      logger: (m) => logs.push(m),
    }).initAgent(agent as unknown as LocalAgent);
    fireAfterModel(new ModelThrottledError("throttle"));
    await vi.runAllTimersAsync();
    fireAfterModel(new ModelThrottledError("throttle"));
    await vi.runAllTimersAsync();
    const event3 = fireAfterModel(new ModelThrottledError("throttle"));
    await vi.runAllTimersAsync();
    expect(event3.retry).toBeUndefined();
    expect(logs[logs.length - 1]).toContain("max retries");
  });

  it("resets attempt counter after a successful call", async () => {
    new RetryPlugin({
      maxRetries: 1,
      retryDelayMs: 0,
      logger: (m) => logs.push(m),
    }).initAgent(agent as unknown as LocalAgent);
    const e1 = fireAfterModel(new ModelThrottledError("throttle"));
    await vi.runAllTimersAsync();
    expect(e1.retry).toBe(true);

    fireAfterModel(); // success → resets counter
    await vi.runAllTimersAsync();

    const e2 = fireAfterModel(new ModelThrottledError("throttle"));
    await vi.runAllTimersAsync();
    expect(e2.retry).toBe(true);
  });

  // ── Backoff ───────────────────────────────────────────────────────────────

  it("delays with exponential backoff (1s → 2s)", async () => {
    const delays: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms) => {
      delays.push(ms as number);
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    new RetryPlugin({ maxRetries: 3, retryDelayMs: 1000 }).initAgent(
      agent as unknown as LocalAgent,
    );
    fireAfterModel(new ModelThrottledError("throttle")); // attempt 1 → 1000ms
    await vi.runAllTimersAsync();
    fireAfterModel(new ModelThrottledError("throttle")); // attempt 2 → 2000ms
    await vi.runAllTimersAsync();

    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);

    vi.restoreAllMocks();
  });
});
