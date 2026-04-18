import { describe, it, expect } from "vitest";
import { handleChatStream } from "../../../src/dispatcher/handlers/chat-stream.js";
import {
  makeMockStore,
  makeRequest,
  makeTextDeltaEvent,
  makeAgentResultEvent,
} from "../fixtures.js";

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

describe("handleChatStream", () => {
  it("returns 400 when message is missing", async () => {
    const { store } = makeMockStore();
    const result = await handleChatStream(makeRequest({ method: "POST", body: {} }), store);

    expect(result.kind).toBe("json");
    expect(result.status).toBe(400);
    if (result.kind === "json") {
      expect((result.body as Record<string, unknown>)["error"]).toMatch(/message/i);
    }
  });

  it("returns 400 when message is empty string", async () => {
    const { store } = makeMockStore();
    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "" } }),
      store,
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 when message is whitespace only", async () => {
    const { store } = makeMockStore();
    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "   " } }),
      store,
    );

    expect(result.status).toBe(400);
  });

  it("returns kind stream with status 200 for valid message", async () => {
    const { store } = makeMockStore();
    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "hi", session_id: "s1" } }),
      store,
    );

    expect(result.kind).toBe("stream");
    expect(result.status).toBe(200);
  });

  it("body is an AsyncGenerator", async () => {
    const { store } = makeMockStore();
    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "hi" } }),
      store,
    );

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      expect(typeof result.body[Symbol.asyncIterator]).toBe("function");
    }
  });

  it("stream body yields SSE text chunks followed by [DONE]", async () => {
    const { store } = makeMockStore({
      stream: async function* () {
        yield makeTextDeltaEvent("chunk-a");
        yield makeTextDeltaEvent("chunk-b");
      },
    });

    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "q" } }),
      store,
    );

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      const chunks = await collect(result.body);
      expect(chunks).toContain("data: chunk-a\n\n");
      expect(chunks).toContain("data: chunk-b\n\n");
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    }
  });

  it("stream body yields [ERROR] when agent stream throws", async () => {
    const { store } = makeMockStore({
      stream: async function* () {
        throw new Error("boom");
        yield makeTextDeltaEvent("never");
      },
    });

    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "x" } }),
      store,
    );

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      const chunks = await collect(result.body);
      expect(chunks[0]).toContain("[ERROR]");
      expect(chunks[0]).toContain("boom");
    }
  });

  it("uses 'default' session when session_id is omitted", async () => {
    const { store } = makeMockStore();
    await handleChatStream(makeRequest({ method: "POST", body: { message: "hello" } }), store);

    expect(store.size()).toBe(1);
  });

  it("uses provided session_id", async () => {
    const { store } = makeMockStore();
    await handleChatStream(
      makeRequest({ method: "POST", body: { message: "hello", session_id: "stream-sess" } }),
      store,
    );

    expect(store.size()).toBe(1);
  });

  it("emits [STRUCTURED_OUTPUT] event before [DONE] when stream returns structuredOutput", async () => {
    const structuredValue = { answer: "LitMDX is a docs framework." };
    const { store } = makeMockStore({
      stream: async function* () {
        yield makeTextDeltaEvent("some text");
        yield makeAgentResultEvent({ structuredOutput: structuredValue });
      },
    });

    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "q" } }),
      store,
    );

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      const chunks = await collect(result.body);
      const structuredChunk = chunks.find((c) => c.includes("[STRUCTURED_OUTPUT]"));
      expect(structuredChunk).toBeDefined();
      expect(structuredChunk).toContain(JSON.stringify(structuredValue));
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
      // [STRUCTURED_OUTPUT] must come before [DONE]
      expect(chunks.indexOf(structuredChunk!)).toBeLessThan(chunks.length - 1);
    }
  });

  it("does not emit [STRUCTURED_OUTPUT] when stream returns no structuredOutput", async () => {
    const { store } = makeMockStore({
      stream: async function* () {
        yield makeTextDeltaEvent("text");
      },
    });

    const result = await handleChatStream(
      makeRequest({ method: "POST", body: { message: "q" } }),
      store,
    );

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      const chunks = await collect(result.body);
      expect(chunks.some((c) => c.includes("[STRUCTURED_OUTPUT]"))).toBe(false);
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    }
  });
});
