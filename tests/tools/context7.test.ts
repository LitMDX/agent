import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONTEXT7_URL, createContext7Client } from "../../src/tools/context7.js";

// ---------------------------------------------------------------------------
// Module mocks
// vi.mock factories are hoisted — they cannot reference variables declared
// in the outer scope, so we use vi.fn() directly inside.
// ---------------------------------------------------------------------------

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
  return { StreamableHTTPClientTransport: vi.fn() };
});

vi.mock("@strands-agents/sdk", () => {
  return { McpClient: vi.fn() };
});

// ---------------------------------------------------------------------------
// Typed access to the mocked constructors (resolved after hoisting)
// ---------------------------------------------------------------------------

const getMocks = async () => {
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const { McpClient } = await import("@strands-agents/sdk");
  return {
    MockTransport: StreamableHTTPClientTransport as ReturnType<typeof vi.fn>,
    MockMcp: McpClient as unknown as ReturnType<typeof vi.fn>,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CONTEXT7_URL", () => {
  it("points to the public Context7 MCP endpoint", () => {
    expect(CONTEXT7_URL).toBe("https://mcp.context7.com/mcp");
  });

  it("is a valid URL", () => {
    expect(() => new URL(CONTEXT7_URL)).not.toThrow();
  });
});

describe("createContext7Client", () => {
  beforeEach(async () => {
    const { MockTransport, MockMcp } = await getMocks();
    MockTransport.mockClear();
    MockMcp.mockClear();
  });

  it("returns a McpClient instance", async () => {
    const { MockMcp } = await getMocks();
    const client = createContext7Client();
    // client is the object created by `new McpClient(...)` — verify it was constructed
    expect(MockMcp).toHaveBeenCalledOnce();
    expect(client).toBeDefined();
  });

  it("creates a StreamableHTTPClientTransport with the default URL", async () => {
    const { MockTransport } = await getMocks();
    createContext7Client();
    expect(MockTransport).toHaveBeenCalledOnce();
    const passedUrl: URL = MockTransport.mock.calls[0][0] as URL;
    expect(passedUrl).toBeInstanceOf(URL);
    expect(passedUrl.href).toBe(CONTEXT7_URL);
  });

  it("passes the transport to McpClient", async () => {
    const { MockTransport, MockMcp } = await getMocks();
    createContext7Client();
    // The transport created by MockTransport is passed as { transport: <instance> }
    const transportInstance = MockTransport.mock.instances[0];
    expect(MockMcp).toHaveBeenCalledOnce();
    expect(MockMcp).toHaveBeenCalledWith({ transport: transportInstance });
  });

  it("accepts a custom URL override", async () => {
    const { MockTransport } = await getMocks();
    const customUrl = "https://custom.example.com/mcp";
    createContext7Client(customUrl);
    const passedUrl: URL = MockTransport.mock.calls[0][0] as URL;
    expect(passedUrl.href).toBe(customUrl);
  });

  it("each call creates a fresh client and transport", async () => {
    const { MockTransport, MockMcp } = await getMocks();
    createContext7Client();
    createContext7Client();
    expect(MockTransport).toHaveBeenCalledTimes(2);
    expect(MockMcp).toHaveBeenCalledTimes(2);
  });
});
