/**
 * Tests for LoggingPlugin.
 *
 * Strategy: build a minimal fake Agent that captures every addHook call, then
 * invoke the registered callbacks directly with synthetic event objects to
 * verify log output without touching the real Strands SDK or starting a model.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BeforeInvocationEvent,
  AfterInvocationEvent,
  BeforeModelCallEvent,
  AfterModelCallEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
} from "@strands-agents/sdk";
import { LoggingPlugin } from "../../../src/session/hooks/logging.js";
import type { Agent, LocalAgent, Logger } from "@strands-agents/sdk";

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

function makeToolResult(opts: { status?: "success" | "error" } = {}) {
  return {
    toolUseId: "tuid-1",
    status: opts.status ?? "success",
    content: [{ type: "text", text: "result" }],
  } as never;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoggingPlugin", () => {
  let agent: ReturnType<typeof makeFakeAgent>;
  let logger: Logger;

  beforeEach(() => {
    agent = makeFakeAgent();
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  // ── Plugin interface contract ───────────────────────────────────────

  it("has name 'litmdx:logging'", () => {
    expect(new LoggingPlugin().name).toBe("litmdx:logging");
  });

  it("is an instance of LoggingPlugin", () => {
    expect(new LoggingPlugin()).toBeInstanceOf(LoggingPlugin);
  });

  // ── Registration ──────────────────────────────────────────────

  it("registers exactly 6 hook callbacks on the agent", () => {
    new LoggingPlugin().initAgent(agent as unknown as LocalAgent);
    expect(agent.hookCount()).toBe(6);
  });

  it("calls agent.addHook for each of the 6 event classes", () => {
    new LoggingPlugin().initAgent(agent as unknown as LocalAgent);
    const registeredClasses = (agent.addHook as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0],
    );
    expect(registeredClasses).toContain(BeforeInvocationEvent);
    expect(registeredClasses).toContain(AfterInvocationEvent);
    expect(registeredClasses).toContain(BeforeModelCallEvent);
    expect(registeredClasses).toContain(AfterModelCallEvent);
    expect(registeredClasses).toContain(BeforeToolCallEvent);
    expect(registeredClasses).toContain(AfterToolCallEvent);
  });

  // ── BeforeInvocationEvent ─────────────────────────────────────────────────

  it("logs invocation start on BeforeInvocationEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(BeforeInvocationEvent, new BeforeInvocationEvent({ agent: fakeAgentRef }));
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith({ prefix: "[litmdx-agent]" }, "invocation started");
  });

  // ── AfterInvocationEvent ──────────────────────────────────────────────────

  it("logs invocation completion on AfterInvocationEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(AfterInvocationEvent, new AfterInvocationEvent({ agent: fakeAgentRef }));
    expect(logger.info).toHaveBeenCalledWith({ prefix: "[litmdx-agent]" }, "invocation completed");
  });

  // ── BeforeModelCallEvent ──────────────────────────────────────────────────

  it("logs model call with model ID on BeforeModelCallEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      BeforeModelCallEvent,
      new BeforeModelCallEvent({ agent: fakeAgentRef, model: fakeModel }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { prefix: "[litmdx-agent]", modelId: "claude-test" },
      "model call",
    );
  });

  it("logs 'unknown' when model.modelId is undefined", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      BeforeModelCallEvent,
      new BeforeModelCallEvent({ agent: fakeAgentRef, model: {} as never }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { prefix: "[litmdx-agent]", modelId: "unknown" },
      "model call",
    );
  });

  // ── AfterModelCallEvent ───────────────────────────────────────────────────

  it("logs stop_reason from stopData on AfterModelCallEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      AfterModelCallEvent,
      new AfterModelCallEvent({
        agent: fakeAgentRef,
        model: fakeModel,
        stopData: {
          message: { role: "assistant", content: [] },
          stopReason: "tool_use",
        } as never,
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { prefix: "[litmdx-agent]", stopReason: "tool_use", error: undefined },
      "model done",
    );
  });

  it("logs 'error' as stop_reason when AfterModelCallEvent has an error and no stopData", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      AfterModelCallEvent,
      new AfterModelCallEvent({
        agent: fakeAgentRef,
        model: fakeModel,
        error: new Error("model failed"),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      { prefix: "[litmdx-agent]", stopReason: "error", error: "model failed" },
      "model done",
    );
  });

  it("logs 'unknown' when AfterModelCallEvent has neither stopData nor error", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      AfterModelCallEvent,
      new AfterModelCallEvent({ agent: fakeAgentRef, model: fakeModel }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { prefix: "[litmdx-agent]", stopReason: "unknown", error: undefined },
      "model done",
    );
  });

  // ── BeforeToolCallEvent ───────────────────────────────────────────────────

  it("logs tool name and serialized input on BeforeToolCallEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      BeforeToolCallEvent,
      new BeforeToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "search_docs", toolUseId: "tid-1", input: { query: "hello" } },
        tool: undefined,
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      {
        prefix: "[litmdx-agent]",
        toolName: "search_docs",
        toolUseId: "tid-1",
        input: { query: "hello" },
      },
      "tool call",
    );
  });

  // ── AfterToolCallEvent ────────────────────────────────────────────────────

  it("logs tool name, success status, and elapsed time on AfterToolCallEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      BeforeToolCallEvent,
      new BeforeToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "get_page", toolUseId: "tid-2", input: { path: "/intro" } },
        tool: undefined,
      }),
    );
    agent.fire(
      AfterToolCallEvent,
      new AfterToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "get_page", toolUseId: "tid-2", input: { path: "/intro" } },
        tool: undefined,
        result: makeToolResult({ status: "success" }),
      }),
    );
    expect(logger.debug).toHaveBeenLastCalledWith(
      expect.objectContaining({
        prefix: "[litmdx-agent]",
        toolName: "get_page",
        toolUseId: "tid-2",
        status: "success",
      }),
      "tool done",
    );
    const payload = vi.mocked(logger.debug).mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(String(payload["elapsed"])).toMatch(/\d+ms/);
    expect(typeof payload["elapsedMs"]).toBe("number");
  });

  it("logs 'error' status when AfterToolCallEvent carries an error", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      AfterToolCallEvent,
      new AfterToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "list_pages", toolUseId: "tid-3", input: {} },
        tool: undefined,
        result: makeToolResult({ status: "error" }),
        error: new Error("tool failed"),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "[litmdx-agent]",
        toolName: "list_pages",
        toolUseId: "tid-3",
        status: "error",
        elapsed: "?ms",
        error: "tool failed",
      }),
      "tool done",
    );
  });

  it("uses '?ms' when AfterToolCallEvent fires without a prior BeforeToolCallEvent", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(
      AfterToolCallEvent,
      new AfterToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "list_pages", toolUseId: "no-before", input: {} },
        tool: undefined,
        result: makeToolResult(),
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ elapsed: "?ms", elapsedMs: undefined }),
      "tool done",
    );
  });

  it("clears the timing entry after AfterToolCallEvent fires", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    const toolUseId = "tid-cleanup";

    agent.fire(
      BeforeToolCallEvent,
      new BeforeToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "search_docs", toolUseId, input: {} },
        tool: undefined,
      }),
    );
    agent.fire(
      AfterToolCallEvent,
      new AfterToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "search_docs", toolUseId, input: {} },
        tool: undefined,
        result: makeToolResult(),
      }),
    );
    vi.mocked(logger.debug).mockClear();
    agent.fire(
      AfterToolCallEvent,
      new AfterToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "search_docs", toolUseId, input: {} },
        tool: undefined,
        result: makeToolResult(),
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ elapsed: "?ms", elapsedMs: undefined }),
      "tool done",
    );
  });

  // ── Custom config ─────────────────────────────────────────────────────────

  it("uses the custom logger when provided", () => {
    const customLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    new LoggingPlugin({ logger: customLogger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(BeforeInvocationEvent, new BeforeInvocationEvent({ agent: fakeAgentRef }));
    expect(customLogger.info).toHaveBeenCalledOnce();
  });

  it("uses the custom prefix in all log messages", () => {
    new LoggingPlugin({ logger, prefix: "[my-app]" }).initAgent(agent as unknown as LocalAgent);
    agent.fire(BeforeInvocationEvent, new BeforeInvocationEvent({ agent: fakeAgentRef }));
    agent.fire(AfterInvocationEvent, new AfterInvocationEvent({ agent: fakeAgentRef }));
    expect(logger.info).toHaveBeenNthCalledWith(1, { prefix: "[my-app]" }, "invocation started");
    expect(logger.info).toHaveBeenNthCalledWith(2, { prefix: "[my-app]" }, "invocation completed");
  });

  it("uses '[litmdx-agent]' as default prefix", () => {
    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    agent.fire(BeforeInvocationEvent, new BeforeInvocationEvent({ agent: fakeAgentRef }));
    expect(logger.info).toHaveBeenCalledWith({ prefix: "[litmdx-agent]" }, "invocation started");
  });

  it("falls back to console methods when no logger is provided", () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    new LoggingPlugin().initAgent(agent as unknown as LocalAgent);
    agent.fire(BeforeInvocationEvent, new BeforeInvocationEvent({ agent: fakeAgentRef }));
    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    consoleInfoSpy.mockRestore();
  });

  // ── Multiple independent instances ────────────────────────────────────────

  it("two independent agent instances have isolated timing maps", () => {
    const agent2 = makeFakeAgent();
    const logger2: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    new LoggingPlugin({ logger }).initAgent(agent as unknown as LocalAgent);
    new LoggingPlugin({ logger: logger2 }).initAgent(agent2 as unknown as LocalAgent);

    const toolUseId = "shared-tid";

    agent.fire(
      BeforeToolCallEvent,
      new BeforeToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "search_docs", toolUseId, input: {} },
        tool: undefined,
      }),
    );
    agent2.fire(
      AfterToolCallEvent,
      new AfterToolCallEvent({
        agent: fakeAgentRef,
        toolUse: { name: "search_docs", toolUseId, input: {} },
        tool: undefined,
        result: makeToolResult(),
      }),
    );

    expect(logger2.debug).toHaveBeenCalledWith(
      expect.objectContaining({ elapsed: "?ms", elapsedMs: undefined }),
      "tool done",
    );
  });
});
