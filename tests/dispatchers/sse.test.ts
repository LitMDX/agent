import { describe, it, expect } from "vitest";
import { streamResponse } from "../../src/dispatcher/sse.js";
import { makeAgentResultEvent, makeMockAgent, makeTextDeltaEvent } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

// ---------------------------------------------------------------------------
// streamResponse
// ---------------------------------------------------------------------------

describe("streamResponse", () => {
  it("yields a data chunk for each textDelta event", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("hello");
        yield makeTextDeltaEvent(" world");
      },
    });

    const chunks = await collect(streamResponse(agent, "anything"));

    expect(chunks).toContain("data: hello\n\n");
    expect(chunks).toContain("data:  world\n\n");
  });

  it("appends [DONE] as last chunk after stream completes", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("hi");
      },
    });

    const chunks = await collect(streamResponse(agent, "ping"));

    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("escapes newlines in text deltas", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("line1\nline2\nline3");
      },
    });

    const chunks = await collect(streamResponse(agent, "msg"));

    expect(chunks[0]).toBe("data: line1\\nline2\\nline3\n\n");
  });

  it("yields multiple chunks in order before [DONE]", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("a");
        yield makeTextDeltaEvent("b");
        yield makeTextDeltaEvent("c");
      },
    });

    const chunks = await collect(streamResponse(agent, "q"));

    expect(chunks).toEqual(["data: a\n\n", "data: b\n\n", "data: c\n\n", "data: [DONE]\n\n"]);
  });

  it("emits keepalive comments for events that are not modelStreamUpdateEvent", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield { type: "otherEvent", data: "ignored" };
        yield makeTextDeltaEvent("kept");
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    // Non-text events emit `: keepalive\n\n` to keep the SSE connection alive
    expect(chunks).toEqual([": keepalive\n\n", "data: kept\n\n", "data: [DONE]\n\n"]);
  });

  it("skips events with wrong inner type", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield {
          type: "modelStreamUpdateEvent",
          event: { type: "somethingElse", delta: { type: "textDelta", text: "ignored" } },
        };
        yield makeTextDeltaEvent("visible");
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks).toEqual(["data: visible\n\n", "data: [DONE]\n\n"]);
  });

  it("skips delta events with wrong delta type", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield {
          type: "modelStreamUpdateEvent",
          event: {
            type: "modelContentBlockDeltaEvent",
            delta: { type: "inputJsonDelta", partial_json: "{}" },
          },
        };
        yield makeTextDeltaEvent("ok");
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks).toEqual(["data: ok\n\n", "data: [DONE]\n\n"]);
  });

  it("yields [ERROR] chunk when agent stream throws", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        throw new Error("network failure");
        yield makeTextDeltaEvent("never");
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("[ERROR]");
    expect(chunks[0]).toContain("network failure");
  });

  it("[ERROR] chunk has newlines removed from error message", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        throw new Error("line1\nline2");
        yield makeTextDeltaEvent("never");
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks[0]).not.toContain("\nline2");
    expect(chunks[0]).toContain("line1 line2");
  });

  it("handles non-Error thrown values", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        throw "plain string error";
        yield makeTextDeltaEvent("never");
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks[0]).toContain("[ERROR]");
    expect(chunks[0]).toContain("plain string error");
  });

  it("produces correct SSE format: data: …\\n\\n", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("chunk");
      },
    });

    const chunks = await collect(streamResponse(agent, "q"));

    for (const chunk of chunks) {
      expect(chunk).toMatch(/^data: .+\n\n$/s);
    }
  });

  it("emits [METRICS] before [DONE] when includeMetrics is true", async () => {
    const fakeMetrics = { cycleCount: 3, totalDuration: 2000 };
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("hi");
        yield makeAgentResultEvent({ metrics: fakeMetrics });
      },
    });

    const chunks = await collect(streamResponse(agent, "x", { includeMetrics: true }));

    const metricsChunk = chunks.find((c) => c.startsWith("data: [METRICS]"));
    expect(metricsChunk).toBeDefined();
    expect(metricsChunk).toContain(JSON.stringify(fakeMetrics));
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    expect(chunks.indexOf(metricsChunk!)).toBeLessThan(chunks.indexOf("data: [DONE]\n\n"));
  });

  it("does not emit [METRICS] when includeMetrics is false", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeAgentResultEvent({ metrics: { cycleCount: 1 } });
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks.some((c) => c.includes("[METRICS]"))).toBe(false);
  });

  it("emits [TRACES] before [DONE] when includeTraces is true", async () => {
    const fakeTraces = [{ name: "agent", children: [] }];
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeTextDeltaEvent("hi");
        yield makeAgentResultEvent({ traces: fakeTraces });
      },
    });

    const chunks = await collect(streamResponse(agent, "x", { includeTraces: true }));

    const tracesChunk = chunks.find((c) => c.startsWith("data: [TRACES]"));
    expect(tracesChunk).toBeDefined();
    expect(tracesChunk).toContain(JSON.stringify(fakeTraces));
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    expect(chunks.indexOf(tracesChunk!)).toBeLessThan(chunks.indexOf("data: [DONE]\n\n"));
  });

  it("does not emit [TRACES] when includeTraces is false", async () => {
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeAgentResultEvent({ traces: [{ name: "root" }] });
      },
    });

    const chunks = await collect(streamResponse(agent, "x"));

    expect(chunks.some((c) => c.includes("[TRACES]"))).toBe(false);
  });

  it("emits [METRICS] and [TRACES] in order before [DONE]", async () => {
    const fakeMetrics = { cycleCount: 1 };
    const fakeTraces = [{ name: "root" }];
    const agent = makeMockAgent({
      stream: async function* () {
        yield makeAgentResultEvent({ metrics: fakeMetrics, traces: fakeTraces });
      },
    });

    const chunks = await collect(
      streamResponse(agent, "x", { includeMetrics: true, includeTraces: true }),
    );

    const metricsIdx = chunks.findIndex((c) => c.includes("[METRICS]"));
    const tracesIdx = chunks.findIndex((c) => c.includes("[TRACES]"));
    const doneIdx = chunks.indexOf("data: [DONE]\n\n");
    expect(metricsIdx).toBeGreaterThanOrEqual(0);
    expect(tracesIdx).toBeGreaterThanOrEqual(0);
    expect(metricsIdx).toBeLessThan(doneIdx);
    expect(tracesIdx).toBeLessThan(doneIdx);
  });
});
