import { describe, it, expect } from "vitest";
import { handleChat } from "../../../src/dispatcher/handlers/chat.js";
import { makeMockStore, makeRequest } from "../fixtures.js";

describe("handleChat", () => {
  it("returns 400 when message is missing", async () => {
    const { store } = makeMockStore();
    const result = await handleChat(makeRequest({ method: "POST", body: {} }), store);

    expect(result.kind).toBe("json");
    expect(result.status).toBe(400);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["error"]).toMatch(/message/i);
    }
  });

  it("returns 400 when message is empty string", async () => {
    const { store } = makeMockStore();
    const result = await handleChat(makeRequest({ method: "POST", body: { message: "" } }), store);

    expect(result.status).toBe(400);
  });

  it("returns 400 when message is whitespace only", async () => {
    const { store } = makeMockStore();
    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "   " } }),
      store,
    );

    expect(result.status).toBe(400);
  });

  it("returns 200 with agent response for valid message", async () => {
    const { store } = makeMockStore();
    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hello", session_id: "s1" } }),
      store,
    );

    expect(result.kind).toBe("json");
    expect(result.status).toBe(200);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["response"]).toBe("echo: hello");
    }
  });

  it("uses custom session_id when provided", async () => {
    const { store } = makeMockStore();
    await handleChat(
      makeRequest({ method: "POST", body: { message: "hi", session_id: "custom-session" } }),
      store,
    );

    expect(store.size()).toBe(1);
  });

  it("falls back to 'default' session when session_id is omitted", async () => {
    const { store } = makeMockStore();
    await handleChat(makeRequest({ method: "POST", body: { message: "hi" } }), store);

    // Session "default" must exist
    expect(store.size()).toBe(1);
  });

  it("reuses an existing session on subsequent calls", async () => {
    const { store } = makeMockStore();
    const req = makeRequest({ method: "POST", body: { message: "first", session_id: "sid" } });
    await handleChat(req, store);
    await handleChat(
      makeRequest({ method: "POST", body: { message: "second", session_id: "sid" } }),
      store,
    );

    expect(store.size()).toBe(1);
  });

  it("coerces non-string agent return values to string", async () => {
    const { store } = makeMockStore({
      invoke: async () => 42 as unknown as string,
    });

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi" } }),
      store,
    );

    if (result.kind === "json") {
      expect(typeof (result.body as Record<string, unknown>)["response"]).toBe("string");
      expect((result.body as Record<string, unknown>)["response"]).toBe("42");
    }
  });

  it("includes structuredOutput in response body when invoke returns it", async () => {
    const structured = { question: "What is LitMDX?", answer: "A docs framework." };
    const { store } = makeMockStore({
      invoke: async () => Object.assign("text response", { structuredOutput: structured }),
    });

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi" } }),
      store,
    );

    expect(result.kind).toBe("json");
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["structuredOutput"]).toEqual(structured);
      expect((result.body as Record<string, unknown>)["response"]).toBe("text response");
    }
  });

  it("omits structuredOutput from response body when invoke does not return it", async () => {
    const { store } = makeMockStore();

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi" } }),
      store,
    );

    expect(result.kind).toBe("json");
    if (result.kind === "json") {
      expect(Object.keys(result.body as Record<string, unknown>)).not.toContain("structuredOutput");
    }
  });

  it("includes metrics in response when include_metrics is true", async () => {
    const fakeMetrics = { cycleCount: 2, totalDuration: 1500 };
    const { store } = makeMockStore({
      invoke: async () => Object.assign("ok", { metrics: fakeMetrics }),
    });

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi", include_metrics: true } }),
      store,
    );

    expect(result.kind).toBe("json");
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["metrics"]).toEqual(fakeMetrics);
    }
  });

  it("omits metrics when include_metrics is false", async () => {
    const fakeMetrics = { cycleCount: 2 };
    const { store } = makeMockStore({
      invoke: async () => Object.assign("ok", { metrics: fakeMetrics }),
    });

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi" } }),
      store,
    );

    if (result.kind === "json") {
      expect(Object.keys(result.body as Record<string, unknown>)).not.toContain("metrics");
    }
  });

  it("includes traces in response when include_traces is true", async () => {
    const fakeTraces = [{ name: "agent", children: [] }];
    const { store } = makeMockStore({
      invoke: async () => Object.assign("ok", { traces: fakeTraces }),
    });

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi", include_traces: true } }),
      store,
    );

    expect(result.kind).toBe("json");
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["traces"]).toEqual(fakeTraces);
    }
  });

  it("omits traces when include_traces is false", async () => {
    const fakeTraces = [{ name: "agent" }];
    const { store } = makeMockStore({
      invoke: async () => Object.assign("ok", { traces: fakeTraces }),
    });

    const result = await handleChat(
      makeRequest({ method: "POST", body: { message: "hi" } }),
      store,
    );

    if (result.kind === "json") {
      expect(Object.keys(result.body as Record<string, unknown>)).not.toContain("traces");
    }
  });

  it("includes both metrics and traces when both flags are true", async () => {
    const fakeMetrics = { cycleCount: 1 };
    const fakeTraces = [{ name: "root" }];
    const { store } = makeMockStore({
      invoke: async () => Object.assign("ok", { metrics: fakeMetrics, traces: fakeTraces }),
    });

    const result = await handleChat(
      makeRequest({
        method: "POST",
        body: { message: "hi", include_metrics: true, include_traces: true },
      }),
      store,
    );

    if (result.kind === "json") {
      const body = result.body as Record<string, unknown>;
      expect(body["metrics"]).toEqual(fakeMetrics);
      expect(body["traces"]).toEqual(fakeTraces);
    }
  });
});
