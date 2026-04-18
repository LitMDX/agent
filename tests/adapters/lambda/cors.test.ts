import { describe, it, expect } from "vitest";
import { resolveCorsOrigin, buildCorsHeaders } from "../../../src/adapters/lambda/cors.js";

describe("resolveCorsOrigin", () => {
  it("returns the origin when it is explicitly in the allowed list", () => {
    const result = resolveCorsOrigin(["https://docs.example.com"], "https://docs.example.com");
    expect(result).toBe("https://docs.example.com");
  });

  it("returns the origin when '*' is in the allowed list", () => {
    const result = resolveCorsOrigin(["*"], "https://any.site.com");
    expect(result).toBe("https://any.site.com");
  });

  it("returns '*' when '*' is in the allowed list and origin is empty", () => {
    const result = resolveCorsOrigin(["*"], "");
    expect(result).toBe("*");
  });

  it("returns empty string when origin is not in the allowed list", () => {
    const result = resolveCorsOrigin(["https://allowed.com"], "https://blocked.com");
    expect(result).toBe("");
  });

  it("returns empty string when allowed list is empty", () => {
    const result = resolveCorsOrigin([], "https://something.com");
    expect(result).toBe("");
  });

  it("handles multiple entries in the allowed list", () => {
    const allowed = ["https://a.com", "https://b.com"];
    expect(resolveCorsOrigin(allowed, "https://a.com")).toBe("https://a.com");
    expect(resolveCorsOrigin(allowed, "https://b.com")).toBe("https://b.com");
    expect(resolveCorsOrigin(allowed, "https://c.com")).toBe("");
  });
});

describe("buildCorsHeaders", () => {
  it("includes Access-Control-Allow-Origin when corsOrigin is non-empty", () => {
    const headers = buildCorsHeaders("https://docs.example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://docs.example.com");
  });

  it("omits Access-Control-Allow-Origin when corsOrigin is empty", () => {
    const headers = buildCorsHeaders("");
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("always includes Access-Control-Allow-Methods", () => {
    const h1 = buildCorsHeaders("https://site.com");
    const h2 = buildCorsHeaders("");
    expect(h1["Access-Control-Allow-Methods"]).toContain("GET");
    expect(h2["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("Access-Control-Allow-Methods covers all required verbs", () => {
    const { "Access-Control-Allow-Methods": methods } = buildCorsHeaders("*");
    ["GET", "POST", "DELETE", "OPTIONS"].forEach((verb) => expect(methods).toContain(verb));
  });

  it("always includes Access-Control-Allow-Headers with Content-Type", () => {
    const h1 = buildCorsHeaders("https://site.com");
    const h2 = buildCorsHeaders("");
    expect(h1["Access-Control-Allow-Headers"]).toContain("Content-Type");
    expect(h2["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });

  it("returns a plain object (Record<string, string>)", () => {
    const headers = buildCorsHeaders("https://example.com");
    expect(typeof headers).toBe("object");
    expect(headers).not.toBeNull();
    Object.values(headers).forEach((v) => expect(typeof v).toBe("string"));
  });
});
