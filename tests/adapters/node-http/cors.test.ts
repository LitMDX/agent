import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyCors, DEV_ORIGINS } from "../../../src/adapters/node-http/cors.js";
import type http from "node:http";

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    _headers: headers,
  } as unknown as http.ServerResponse;
  return { res, headers };
}

describe("DEV_ORIGINS", () => {
  it("contains localhost:5173", () => {
    expect(DEV_ORIGINS).toContain("http://localhost:5173");
  });

  it("contains 127.0.0.1:5173", () => {
    expect(DEV_ORIGINS).toContain("http://127.0.0.1:5173");
  });

  it("is an array of strings", () => {
    expect(Array.isArray(DEV_ORIGINS)).toBe(true);
    DEV_ORIGINS.forEach((o) => expect(typeof o).toBe("string"));
  });
});

describe("applyCors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets ACAO to the request origin when it is in the allowed list", () => {
    const { res, headers } = makeRes();
    applyCors(res, ["https://docs.example.com"], "https://docs.example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://docs.example.com");
  });

  it("sets ACAO to * when '*' is in the allowed list and an origin is provided", () => {
    const { res, headers } = makeRes();
    applyCors(res, ["*"], "https://anything.com");
    // origin is truthy → we set the reflected origin
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://anything.com");
  });

  it("sets ACAO to '*' when '*' is in the allowed list and origin is empty", () => {
    const { res, headers } = makeRes();
    applyCors(res, ["*"], "");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("does not set ACAO when origin is not in the allowed list", () => {
    const { res } = makeRes();
    applyCors(res, ["https://allowed.com"], "https://blocked.com");
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      expect.anything(),
    );
  });

  it("always sets Access-Control-Allow-Methods", () => {
    const { res, headers } = makeRes();
    applyCors(res, [], "");
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Methods"]).toContain("DELETE");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });

  it("always sets Access-Control-Allow-Headers", () => {
    const { res, headers } = makeRes();
    applyCors(res, [], "");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });

  it("reflects localhost:5173 when included in the allowed list", () => {
    const { res, headers } = makeRes();
    applyCors(res, DEV_ORIGINS, "http://localhost:5173");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
  });

  it("does not set ACAO when origin is empty and '*' is not in allowed list", () => {
    const { res } = makeRes();
    applyCors(res, ["https://specific.com"], "");
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      expect.anything(),
    );
  });
});
