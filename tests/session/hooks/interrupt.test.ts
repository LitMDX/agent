/**
 * Tests for InterruptPlugin.
 *
 * Strategy: build a minimal fake LocalAgent that captures addHook calls,
 * then fire synthetic BeforeToolCallEvent objects to verify that the plugin:
 *   - sets event.cancel when the interceptor returns a truthy value
 *   - leaves event.cancel untouched when the interceptor returns falsy
 *   - handles all return types: string, true, false, null, undefined
 *   - registers exactly one BeforeToolCallEvent hook
 *   - exposes the correct plugin identity
 */

import { describe, it, expect, vi } from "vitest";
import { BeforeToolCallEvent } from "@strands-agents/sdk";
import { InterruptPlugin } from "../../../src/session/hooks/interrupt.js";
import type { ToolInterceptFn } from "../../../src/session/hooks/interrupt.js";
import type { LocalAgent, JSONValue } from "@strands-agents/sdk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventClass = abstract new (...args: any[]) => any;

function makeFakeAgent() {
  const hooks = new Map<EventClass, Array<(e: unknown) => void>>();

  const agent = {
    addHook: vi.fn((eventClass: EventClass, cb: (e: unknown) => void) => {
      if (!hooks.has(eventClass)) hooks.set(eventClass, []);
      hooks.get(eventClass)!.push(cb);
    }),
    fire(eventClass: EventClass, event: unknown) {
      for (const cb of hooks.get(eventClass) ?? []) cb(event);
    },
    hookCount() {
      return [...hooks.values()].reduce((n, list) => n + list.length, 0);
    },
  } as unknown as LocalAgent & {
    fire: (cls: EventClass, event: unknown) => void;
    hookCount: () => number;
  };

  return agent;
}

function makeToolUseEvent(name: string, input: JSONValue = {}) {
  const event = new BeforeToolCallEvent({
    agent: {} as LocalAgent,
    toolUse: { name, toolUseId: `tid-${name}`, input },
    tool: undefined,
  });
  return event;
}

// ---------------------------------------------------------------------------
// Plugin identity
// ---------------------------------------------------------------------------

describe("InterruptPlugin — identity", () => {
  it("has name 'litmdx:interrupt'", () => {
    const plugin = new InterruptPlugin(() => null);
    expect(plugin.name).toBe("litmdx:interrupt");
  });

  it("is an instance of InterruptPlugin", () => {
    const plugin = new InterruptPlugin(() => null);
    expect(plugin).toBeInstanceOf(InterruptPlugin);
  });
});

// ---------------------------------------------------------------------------
// Hook registration
// ---------------------------------------------------------------------------

describe("InterruptPlugin — hook registration", () => {
  it("registers exactly one BeforeToolCallEvent hook", () => {
    const plugin = new InterruptPlugin(() => null);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    expect(agent.addHook).toHaveBeenCalledOnce();
    expect(agent.addHook).toHaveBeenCalledWith(BeforeToolCallEvent, expect.any(Function));
    expect((agent as ReturnType<typeof makeFakeAgent>).hookCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Cancel behaviour — truthy interceptor return values
// ---------------------------------------------------------------------------

describe("InterruptPlugin — cancel on truthy return", () => {
  it("sets event.cancel to the string returned by the interceptor", () => {
    const plugin = new InterruptPlugin(() => "Access denied.");
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = makeToolUseEvent("get_page");
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(event.cancel).toBe("Access denied.");
  });

  it("sets event.cancel to true when interceptor returns true", () => {
    const plugin = new InterruptPlugin(() => true);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = makeToolUseEvent("search_docs");
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(event.cancel).toBe(true);
  });

  it("cancels only the matching tool when interceptor is name-based", () => {
    const interceptor: ToolInterceptFn = ({ name }) => (name === "get_page" ? "Blocked." : null);
    const plugin = new InterruptPlugin(interceptor);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const blocked = makeToolUseEvent("get_page");
    const allowed = makeToolUseEvent("list_pages");

    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, blocked);
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, allowed);

    expect(blocked.cancel).toBe("Blocked.");
    expect(allowed.cancel).toBeFalsy();
  });

  it("passes toolUseId and input to the interceptor", () => {
    const interceptor = vi.fn(
      (_toolUse: { name: string; toolUseId: string; input: unknown }) => null,
    );
    const plugin = new InterruptPlugin(interceptor as ToolInterceptFn);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = new BeforeToolCallEvent({
      agent: {} as LocalAgent,
      toolUse: { name: "search_docs", toolUseId: "uid-42", input: { query: "hello" } },
      tool: undefined,
    });
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(interceptor).toHaveBeenCalledWith({
      name: "search_docs",
      toolUseId: "uid-42",
      input: { query: "hello" },
    });
  });
});

// ---------------------------------------------------------------------------
// Allow behaviour — falsy interceptor return values
// ---------------------------------------------------------------------------

describe("InterruptPlugin — allow on falsy return", () => {
  it("does NOT set event.cancel when interceptor returns null", () => {
    const plugin = new InterruptPlugin(() => null);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = makeToolUseEvent("list_pages");
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(event.cancel).toBeFalsy();
  });

  it("does NOT set event.cancel when interceptor returns undefined", () => {
    const plugin = new InterruptPlugin(() => undefined);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = makeToolUseEvent("list_pages");
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(event.cancel).toBeFalsy();
  });

  it("does NOT set event.cancel when interceptor returns false", () => {
    const plugin = new InterruptPlugin(() => false);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = makeToolUseEvent("list_pages");
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(event.cancel).toBeFalsy();
  });

  it("does NOT set event.cancel when interceptor always allows", () => {
    const plugin = new InterruptPlugin(({ name }) => (name === "never_match" ? "x" : null));
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const event = makeToolUseEvent("search_docs");
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, event);

    expect(event.cancel).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Input-based interception
// ---------------------------------------------------------------------------

describe("InterruptPlugin — input-based interception", () => {
  it("can block a tool call based on its input contents", () => {
    const interceptor: ToolInterceptFn = ({ name, input }) => {
      if (
        name === "search_docs" &&
        typeof input === "object" &&
        input !== null &&
        "query" in input &&
        String((input as Record<string, unknown>).query).includes("secret")
      ) {
        return "Query contains restricted terms.";
      }
      return null;
    };
    const plugin = new InterruptPlugin(interceptor);
    const agent = makeFakeAgent();
    plugin.initAgent(agent);

    const blockedEvent = new BeforeToolCallEvent({
      agent: {} as LocalAgent,
      toolUse: { name: "search_docs", toolUseId: "t1", input: { query: "secret docs" } },
      tool: undefined,
    });
    const allowedEvent = new BeforeToolCallEvent({
      agent: {} as LocalAgent,
      toolUse: { name: "search_docs", toolUseId: "t2", input: { query: "getting started" } },
      tool: undefined,
    });

    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, blockedEvent);
    (agent as ReturnType<typeof makeFakeAgent>).fire(BeforeToolCallEvent, allowedEvent);

    expect(blockedEvent.cancel).toBe("Query contains restricted terms.");
    expect(allowedEvent.cancel).toBeFalsy();
  });
});
