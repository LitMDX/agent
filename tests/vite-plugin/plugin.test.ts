import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the node-http adapter dynamic import ────────────────────────────────
const mockCreateNodeHttpServer = vi.hoisted(() => vi.fn().mockResolvedValue({ close: vi.fn() }));

vi.mock("../../src/adapters/node-http/index.js", () => ({
  createNodeHttpServer: mockCreateNodeHttpServer,
}));

// ── Mock the indexer dynamic import ──────────────────────────────────────────
const mockBuildIndex = vi.hoisted(() => vi.fn().mockReturnValue(new Map()));

vi.mock("../../src/indexer/index.js", () => ({
  buildIndex: mockBuildIndex,
  fetchRemoteIndex: vi.fn().mockResolvedValue(new Map()),
}));

import { litmdxAgentPlugin } from "../../src/vite-plugin/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseOpts = {
  docsDir: "/docs",
  provider: "openai" as const,
  apiKey: "test-key",
};

function makeMockServer(httpServerOpts?: { on?: ReturnType<typeof vi.fn> }) {
  return {
    middlewares: { use: vi.fn() },
    httpServer: {
      on: httpServerOpts?.on ?? vi.fn(),
    },
  };
}

// Calls `plugin.config()` ignoring the Vite argument types.
function callConfig(plugin: ReturnType<typeof litmdxAgentPlugin>) {
  return (plugin.config as () => unknown)?.();
}

// Calls `plugin.configureServer(server)` ignoring Vite argument types.
async function callConfigureServer(
  plugin: ReturnType<typeof litmdxAgentPlugin>,
  server: ReturnType<typeof makeMockServer>,
) {
  await (
    plugin.configureServer as unknown as (
      server: ReturnType<typeof makeMockServer>,
    ) => Promise<void>
  )?.(server);
}

// ---------------------------------------------------------------------------
// Plugin shape
// ---------------------------------------------------------------------------

describe("litmdxAgentPlugin — shape", () => {
  it("has name 'litmdx:agent'", () => {
    expect(litmdxAgentPlugin(baseOpts).name).toBe("litmdx:agent");
  });

  it("apply is 'serve'", () => {
    expect(litmdxAgentPlugin(baseOpts).apply).toBe("serve");
  });

  it("exposes a config hook", () => {
    expect(typeof litmdxAgentPlugin(baseOpts).config).toBe("function");
  });

  it("exposes a configureServer hook", () => {
    expect(typeof litmdxAgentPlugin(baseOpts).configureServer).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// config() hook
// ---------------------------------------------------------------------------

describe("litmdxAgentPlugin — config()", () => {
  it("returns server.proxy with /api/agent entry", () => {
    const result = callConfig(litmdxAgentPlugin(baseOpts)) as Record<string, unknown>;
    const proxy = (result?.["server"] as Record<string, unknown>)?.["proxy"] as Record<
      string,
      unknown
    >;
    expect(proxy).toHaveProperty("/api/agent");
  });

  it("proxy target defaults to port 8000", () => {
    const result = callConfig(litmdxAgentPlugin(baseOpts)) as Record<string, unknown>;
    const proxy = (result?.["server"] as Record<string, unknown>)?.["proxy"] as Record<
      string,
      unknown
    >;
    const entry = proxy?.["/api/agent"] as Record<string, unknown>;
    expect(entry?.["target"]).toBe("http://127.0.0.1:8000");
  });

  it("proxy target uses opts.port when specified", () => {
    const result = callConfig(litmdxAgentPlugin({ ...baseOpts, port: 9000 })) as Record<
      string,
      unknown
    >;
    const proxy = (result?.["server"] as Record<string, unknown>)?.["proxy"] as Record<
      string,
      unknown
    >;
    const entry = proxy?.["/api/agent"] as Record<string, unknown>;
    expect(entry?.["target"]).toBe("http://127.0.0.1:9000");
  });
});

// ---------------------------------------------------------------------------
// configureServer() hook
// ---------------------------------------------------------------------------

describe("litmdxAgentPlugin — configureServer()", () => {
  beforeEach(() => {
    mockCreateNodeHttpServer.mockClear();
    mockCreateNodeHttpServer.mockResolvedValue({ close: vi.fn() });
  });

  it("calls createNodeHttpServer", async () => {
    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer());
    expect(mockCreateNodeHttpServer).toHaveBeenCalledOnce();
  });

  it("binds to 127.0.0.1", async () => {
    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer());
    expect(mockCreateNodeHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({ host: "127.0.0.1" }),
    );
  });

  it("passes docsDir and provider through to createNodeHttpServer", async () => {
    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer());
    expect(mockCreateNodeHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({ docsDir: "/docs", provider: "openai" }),
    );
  });

  it("passes the resolved port to createNodeHttpServer", async () => {
    const plugin = litmdxAgentPlugin({ ...baseOpts, port: 7777 });
    await callConfigureServer(plugin, makeMockServer());
    expect(mockCreateNodeHttpServer).toHaveBeenCalledWith(expect.objectContaining({ port: 7777 }));
  });

  it("registers a 'close' handler on httpServer", async () => {
    const on = vi.fn();
    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer({ on }));
    expect(on).toHaveBeenCalledWith("close", expect.any(Function));
  });

  it("close handler calls agentServer.close()", async () => {
    const mockClose = vi.fn();
    mockCreateNodeHttpServer.mockResolvedValueOnce({ close: mockClose });

    const on = vi.fn();
    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer({ on }));

    const closeHandler = on.mock.calls[0]?.[1] as () => void;
    closeHandler();

    expect(mockClose).toHaveBeenCalled();
  });

  it("warns to console when createNodeHttpServer throws", async () => {
    mockCreateNodeHttpServer.mockRejectedValueOnce(new Error("port in use"));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("port in use"));
    consoleSpy.mockRestore();
  });

  it("does not throw when createNodeHttpServer throws", async () => {
    mockCreateNodeHttpServer.mockRejectedValueOnce(new Error("crash"));

    const plugin = litmdxAgentPlugin(baseOpts);
    await expect(callConfigureServer(plugin, makeMockServer())).resolves.toBeUndefined();
  });

  it("logs the agent URL to console on success", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const plugin = litmdxAgentPlugin(baseOpts);
    await callConfigureServer(plugin, makeMockServer());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("127.0.0.1:8000"));
    consoleSpy.mockRestore();
  });
});
