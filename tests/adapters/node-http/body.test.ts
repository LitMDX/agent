import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { readBody } from "../../../src/adapters/node-http/body.js";
import type http from "node:http";

/** Creates a minimal fake IncomingMessage that emits data + end events. */
function makeReq(chunks: string[] = [], error?: Error): http.IncomingMessage {
  const emitter = new EventEmitter() as unknown as http.IncomingMessage;
  setImmediate(() => {
    if (error) {
      emitter.emit("error", error);
      return;
    }
    for (const chunk of chunks) {
      emitter.emit("data", Buffer.from(chunk));
    }
    emitter.emit("end");
  });
  return emitter;
}

describe("readBody", () => {
  it("parses a simple JSON object", async () => {
    const req = makeReq(['{"key":"value"}']);
    const result = await readBody(req);
    expect(result).toEqual({ key: "value" });
  });

  it("parses a JSON object split across multiple chunks", async () => {
    const req = makeReq(['{"a":', "1}"]); // two chunks
    const result = await readBody(req);
    expect(result).toEqual({ a: 1 });
  });

  it("returns an empty object for an empty body", async () => {
    const req = makeReq([]); // emits end with no data
    const result = await readBody(req);
    expect(result).toEqual({});
  });

  it("returns an empty object when the body is only whitespace (falsy raw)", async () => {
    const req = makeReq([""]); // one empty chunk
    const result = await readBody(req);
    expect(result).toEqual({});
  });

  it("rejects with an Error for invalid JSON", async () => {
    const req = makeReq(["not json"]);
    await expect(readBody(req)).rejects.toThrow("Invalid JSON body");
  });

  it("rejects when the stream emits an error event", async () => {
    const req = makeReq([], new Error("stream error"));
    await expect(readBody(req)).rejects.toThrow("stream error");
  });

  it("parses nested JSON structures", async () => {
    const payload = { user: { id: 42, tags: ["a", "b"] }, active: true };
    const req = makeReq([JSON.stringify(payload)]);
    const result = await readBody(req);
    expect(result).toEqual(payload);
  });

  it("parses a JSON array wrapped in an object", async () => {
    const req = makeReq(['{"items":[1,2,3]}']);
    const result = await readBody(req);
    expect(result).toEqual({ items: [1, 2, 3] });
  });
});
