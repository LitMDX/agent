import { describe, it, expect } from "vitest";
import { createDispatcher } from "../../src/dispatcher/index.js";
import { makeMockStore, makeRequest, makeTextDeltaEvent } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Routing — createDispatcher
// ---------------------------------------------------------------------------

describe("createDispatcher routing", () => {
  // ── GET /health ───────────────────────────────────────────────────────────

  it("routes GET /health to the health handler", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: "gpt-4o" });

    const result = await dispatch(makeRequest({ method: "GET", pathname: "/health" }));

    expect(result.kind).toBe("json");
    expect(result.status).toBe(200);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["status"]).toBe("ok");
      expect((result.body as Record<string, unknown>)["provider"]).toBe("openai");
      expect((result.body as Record<string, unknown>)["model"]).toBe("gpt-4o");
    }
  });

  it("GET /health sessions count reflects store state", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "anthropic", model: undefined });

    await store.getOrCreate("a");
    await store.getOrCreate("b");

    const result = await dispatch(makeRequest({ method: "GET", pathname: "/health" }));

    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["sessions"]).toBe(2);
    }
  });

  // ── POST /chat ────────────────────────────────────────────────────────────

  it("routes POST /chat to the chat handler", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(
      makeRequest({ method: "POST", pathname: "/chat", body: { message: "ping" } }),
    );

    expect(result.kind).toBe("json");
    expect(result.status).toBe(200);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["response"]).toBe("echo: ping");
    }
  });

  it("POST /chat returns 400 when message is missing", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(makeRequest({ method: "POST", pathname: "/chat", body: {} }));

    expect(result.status).toBe(400);
  });

  // ── POST /chat/stream ─────────────────────────────────────────────────────

  it("routes POST /chat/stream to the chat-stream handler", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(
      makeRequest({
        method: "POST",
        pathname: "/chat/stream",
        body: { message: "stream-me" },
      }),
    );

    expect(result.kind).toBe("stream");
    expect(result.status).toBe(200);
  });

  it("POST /chat/stream body is consumable and ends with [DONE]", async () => {
    const { store } = makeMockStore({
      stream: async function* () {
        yield makeTextDeltaEvent("streamed");
      },
    });
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(
      makeRequest({
        method: "POST",
        pathname: "/chat/stream",
        body: { message: "hi" },
      }),
    );

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      const chunks: string[] = [];
      for await (const c of result.body) chunks.push(c);
      expect(chunks.some((c) => c.includes("streamed"))).toBe(true);
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    }
  });

  it("POST /chat/stream returns 400 when message is missing", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(
      makeRequest({ method: "POST", pathname: "/chat/stream", body: {} }),
    );

    expect(result.status).toBe(400);
  });

  // ── DELETE /session ───────────────────────────────────────────────────────

  it("routes DELETE /session to the session handler", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    await store.getOrCreate("sess-xyz");
    expect(store.size()).toBe(1);

    const result = await dispatch(
      makeRequest({
        method: "DELETE",
        pathname: "/session",
        searchParams: new URLSearchParams("session_id=sess-xyz"),
      }),
    );

    expect(result.kind).toBe("json");
    expect(result.status).toBe(200);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["cleared"]).toBe("sess-xyz");
    }
    expect(store.size()).toBe(0);
  });

  it("DELETE /session uses 'default' when session_id is absent", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    await store.getOrCreate("default");
    const result = await dispatch(makeRequest({ method: "DELETE", pathname: "/session" }));

    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["cleared"]).toBe("default");
    }
  });

  // ── 404 fallback ──────────────────────────────────────────────────────────

  it("returns 404 for an unknown pathname", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(makeRequest({ method: "GET", pathname: "/unknown" }));

    expect(result.kind).toBe("json");
    expect(result.status).toBe(404);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["error"]).toMatch(/not found/i);
    }
  });

  it("returns 404 for a wrong HTTP method on a known pathname", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    // /chat only accepts POST
    const result = await dispatch(makeRequest({ method: "GET", pathname: "/chat" }));
    expect(result.status).toBe(404);
  });

  it("returns 404 for DELETE on /chat", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(makeRequest({ method: "DELETE", pathname: "/chat" }));
    expect(result.status).toBe(404);
  });

  it("returns 404 for POST on /health", async () => {
    const { store } = makeMockStore();
    const dispatch = createDispatcher(store, { provider: "openai", model: undefined });

    const result = await dispatch(makeRequest({ method: "POST", pathname: "/health" }));
    expect(result.status).toBe(404);
  });
});
