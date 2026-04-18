import { describe, it, expect, vi } from "vitest";
import { buildProxyConfig, handleProxyError } from "../../src/vite-plugin/proxy.js";

// ---------------------------------------------------------------------------
// buildProxyConfig
// ---------------------------------------------------------------------------

describe("buildProxyConfig", () => {
  it("returns an object with '/api/agent' key", () => {
    const config = buildProxyConfig(8000);
    expect(config).toHaveProperty("/api/agent");
  });

  it("target points to the agent port on 127.0.0.1", () => {
    const config = buildProxyConfig(9001);
    expect(config["/api/agent"].target).toBe("http://127.0.0.1:9001");
  });

  it("target embeds a different port when changed", () => {
    const config = buildProxyConfig(4321);
    expect(config["/api/agent"].target).toBe("http://127.0.0.1:4321");
  });

  it("changeOrigin is true", () => {
    const config = buildProxyConfig(8000);
    expect(config["/api/agent"].changeOrigin).toBe(true);
  });

  it("rewrite strips the /api/agent prefix (path with suffix)", () => {
    const { rewrite } = buildProxyConfig(8000)["/api/agent"];
    expect(rewrite("/api/agent/chat")).toBe("/chat");
  });

  it("rewrite strips the /api/agent prefix (health endpoint)", () => {
    const { rewrite } = buildProxyConfig(8000)["/api/agent"];
    expect(rewrite("/api/agent/health")).toBe("/health");
  });

  it("rewrite returns empty string when path is exactly /api/agent", () => {
    const { rewrite } = buildProxyConfig(8000)["/api/agent"];
    expect(rewrite("/api/agent")).toBe("");
  });

  it("rewrite leaves unrelated paths unchanged", () => {
    const { rewrite } = buildProxyConfig(8000)["/api/agent"];
    // Only the leading /api/agent segment is stripped; other paths pass through.
    expect(rewrite("/other/path")).toBe("/other/path");
  });

  it("configure is a function", () => {
    const config = buildProxyConfig(8000);
    expect(typeof config["/api/agent"].configure).toBe("function");
  });

  it("configure attaches an 'error' handler to the proxy", () => {
    const config = buildProxyConfig(8000);
    const proxy = { on: vi.fn() };
    config["/api/agent"].configure(proxy);
    expect(proxy.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("configure attaches exactly one handler", () => {
    const config = buildProxyConfig(8000);
    const proxy = { on: vi.fn() };
    config["/api/agent"].configure(proxy);
    expect(proxy.on).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// handleProxyError
// ---------------------------------------------------------------------------

describe("handleProxyError", () => {
  it("calls writeHead with 503", () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    handleProxyError(new Error(), {}, { writeHead, end }, 8000);
    expect(writeHead).toHaveBeenCalledWith(503, expect.any(Object));
  });

  it("sets Content-Type to application/json", () => {
    const writeHead = vi.fn();
    handleProxyError(new Error(), {}, { writeHead, end: vi.fn() }, 8000);
    expect(writeHead).toHaveBeenCalledWith(503, { "Content-Type": "application/json" });
  });

  it("body is valid JSON with 'error' field", () => {
    const end = vi.fn();
    handleProxyError(new Error(), {}, { writeHead: vi.fn(), end }, 8000);
    const body = JSON.parse(end.mock.calls[0]?.[0]);
    expect(body).toHaveProperty("error");
  });

  it("body 'detail' field mentions the agent port", () => {
    const end = vi.fn();
    handleProxyError(new Error(), {}, { writeHead: vi.fn(), end }, 9999);
    const body = JSON.parse(end.mock.calls[0]?.[0]);
    expect(body.detail).toContain("9999");
  });

  it("does nothing when writeHead is absent", () => {
    expect(() => handleProxyError(new Error(), {}, { end: vi.fn() }, 8000)).not.toThrow();
  });

  it("does NOT call end when writeHead is absent", () => {
    const end = vi.fn();
    handleProxyError(new Error(), {}, { end }, 8000);
    expect(end).not.toHaveBeenCalled();
  });

  it("does nothing when end is absent", () => {
    expect(() => handleProxyError(new Error(), {}, { writeHead: vi.fn() }, 8000)).not.toThrow();
  });

  it("does NOT call writeHead when end is absent", () => {
    const writeHead = vi.fn();
    handleProxyError(new Error(), {}, { writeHead }, 8000);
    expect(writeHead).not.toHaveBeenCalled();
  });

  it("the configure error callback triggers a 503 response end-to-end", () => {
    const config = buildProxyConfig(8000);
    const proxy = { on: vi.fn() };
    config["/api/agent"].configure(proxy);

    const errorCb = proxy.on.mock.calls[0]?.[1] as (
      err: unknown,
      req: unknown,
      res: unknown,
    ) => void;
    const writeHead = vi.fn();
    const end = vi.fn();
    errorCb(new Error("upstream"), {}, { writeHead, end });

    expect(writeHead).toHaveBeenCalledWith(503, expect.any(Object));
    expect(end).toHaveBeenCalled();
  });
});
