import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";

// ── vi.hoisted ensures mockFileStorage exists before vi.mock is hoisted ─────
const mockFileStorage = vi.hoisted(() =>
  vi.fn().mockImplementation(function (dir: string) {
    return { _kind: "file-storage", dir };
  }),
);

vi.mock("@strands-agents/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strands-agents/sdk")>();
  return {
    ...actual,
    FileStorage: mockFileStorage,
    SessionManager: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
      return { _kind: "session-manager", ...opts };
    }),
    SlidingWindowConversationManager: vi.fn().mockImplementation(function (
      opts: Record<string, unknown>,
    ) {
      return { _kind: "sliding-window", ...opts };
    }),
    SummarizingConversationManager: vi.fn().mockImplementation(function (
      opts: Record<string, unknown>,
    ) {
      return { _kind: "summarizing", ...opts };
    }),
    Agent: vi.fn().mockImplementation(function (opts: Record<string, unknown>) {
      return {
        _kind: "agent",
        addHook: vi.fn(),
        asTool: vi.fn().mockImplementation((toolOpts: Record<string, unknown>) => ({
          _kind: "sub-agent-tool",
          ...toolOpts,
        })),
        ...opts,
      };
    }),
  };
});

import { resolveStorage, createAgentFactory } from "../../src/session/agent-factory.js";
import type { SessionConfig } from "../../src/session/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: SessionConfig = {
  getModel: async () => ({ _kind: "mock-model" }) as never,
  tools: [],
  systemPrompt: "You are a test assistant.",
  windowSize: 5,
};

// ---------------------------------------------------------------------------
// resolveStorage
// ---------------------------------------------------------------------------

describe("resolveStorage", () => {
  it("returns config.storage when provided (custom backend)", async () => {
    const customStorage = { _kind: "custom-storage" } as never;
    const result = await resolveStorage({ ...baseConfig, storage: customStorage });
    expect(result).toBe(customStorage);
  });

  it("creates FileStorage with config.sessionsDir when provided", async () => {
    mockFileStorage.mockClear();
    const dir = "/custom/sessions/dir";
    await resolveStorage({ ...baseConfig, sessionsDir: dir });
    expect(mockFileStorage).toHaveBeenCalledWith(dir);
  });

  it("creates FileStorage with default tmpdir when neither storage nor sessionsDir is set", async () => {
    mockFileStorage.mockClear();
    await resolveStorage(baseConfig);
    const expectedDir = path.join(os.tmpdir(), "litmdx-sessions");
    expect(mockFileStorage).toHaveBeenCalledWith(expectedDir);
  });

  it("custom storage takes precedence over sessionsDir", async () => {
    const customStorage = { _kind: "custom" } as never;
    mockFileStorage.mockClear();
    const result = await resolveStorage({
      ...baseConfig,
      storage: customStorage,
      sessionsDir: "/should-be-ignored",
    });
    expect(result).toBe(customStorage);
    expect(mockFileStorage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createAgentFactory
// ---------------------------------------------------------------------------

describe("createAgentFactory", () => {
  const mockStorage = { _kind: "mock-storage" } as never;

  it("returns a function", () => {
    const factory = createAgentFactory(baseConfig, mockStorage);
    expect(typeof factory).toBe("function");
  });

  it("returned factory resolves to an agent-like object", async () => {
    const factory = createAgentFactory(baseConfig, mockStorage);
    const agent = await factory("test-session");
    expect(agent).toBeDefined();
  });

  it("calls config.getModel to obtain the model", async () => {
    const getModel = vi.fn().mockResolvedValue({ _kind: "model" });
    const factory = createAgentFactory({ ...baseConfig, getModel }, mockStorage);
    await factory("s1");
    expect(getModel).toHaveBeenCalledOnce();
  });

  it("passes the sessionId when creating the session manager", async () => {
    const { SessionManager } = await import("@strands-agents/sdk");
    const smSpy = vi.mocked(SessionManager);
    smSpy.mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("my-session-id");

    expect(smSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "my-session-id" }));
  });

  it("passes the snapshotStorage to SessionManager", async () => {
    const { SessionManager } = await import("@strands-agents/sdk");
    const smSpy = vi.mocked(SessionManager);
    smSpy.mockClear();

    const storage = { _kind: "injected-storage" } as never;
    const factory = createAgentFactory(baseConfig, storage);
    await factory("s");

    expect(smSpy).toHaveBeenCalledWith(expect.objectContaining({ storage: { snapshot: storage } }));
  });

  it("passes config.systemPrompt to the Agent", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, systemPrompt: "Custom prompt" },
      mockStorage,
    );
    await factory("s");

    expect(agentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "Custom prompt" }),
    );
  });

  it("passes config.windowSize to SlidingWindowConversationManager", async () => {
    const { SlidingWindowConversationManager } = await import("@strands-agents/sdk");
    const swSpy = vi.mocked(SlidingWindowConversationManager);
    swSpy.mockClear();

    const factory = createAgentFactory({ ...baseConfig, windowSize: 12 }, mockStorage);
    await factory("s");

    expect(swSpy).toHaveBeenCalledWith(expect.objectContaining({ windowSize: 12 }));
  });

  it("stamps appState with session_id, started_at, and message_count=0", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("stamped-session");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const appState = call["appState"] as Record<string, unknown>;
    expect(appState["session_id"]).toBe("stamped-session");
    expect(typeof appState["started_at"]).toBe("string");
    expect(appState["message_count"]).toBe(0);
  });

  it("sets printer to false", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("s");

    expect(agentSpy).toHaveBeenCalledWith(expect.objectContaining({ printer: false }));
  });

  it("each call to the factory invokes getModel independently", async () => {
    const getModel = vi.fn().mockResolvedValue({ _kind: "model" });
    const factory = createAgentFactory({ ...baseConfig, getModel }, mockStorage);
    await factory("s1");
    await factory("s2");
    expect(getModel).toHaveBeenCalledTimes(2);
  });

  // ── mcpClients ─────────────────────────────────────────────────────────

  it("passes mcpClients alongside built-in tools when config.mcpClients is set", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const fakeClient = { _kind: "mcp-client" } as never;
    const builtinTool = { _kind: "tool", name: "search_docs" } as never;
    const factory = createAgentFactory(
      { ...baseConfig, tools: [builtinTool], mcpClients: [fakeClient] },
      mockStorage,
    );
    await factory("s-mcp");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const tools = call["tools"] as unknown[];
    expect(tools).toContain(builtinTool);
    expect(tools).toContain(fakeClient);
  });

  it("does not alter tools when mcpClients is empty", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const builtinTool = { _kind: "tool" } as never;
    const factory = createAgentFactory(
      { ...baseConfig, tools: [builtinTool], mcpClients: [] },
      mockStorage,
    );
    await factory("s-no-mcp");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["tools"]).toEqual([builtinTool]);
  });

  it("does not alter tools when mcpClients is undefined", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const builtinTool = { _kind: "tool" } as never;
    const factory = createAgentFactory({ ...baseConfig, tools: [builtinTool] }, mockStorage);
    await factory("s-undef-mcp");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["tools"]).toEqual([builtinTool]);
  });

  it("merges multiple mcpClients into the tools array", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const client1 = { _kind: "mcp-client-1" } as never;
    const client2 = { _kind: "mcp-client-2" } as never;
    const factory = createAgentFactory(
      { ...baseConfig, tools: [], mcpClients: [client1, client2] },
      mockStorage,
    );
    await factory("s-multi-mcp");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const tools = call["tools"] as unknown[];
    expect(tools).toContain(client1);
    expect(tools).toContain(client2);
    expect(tools).toHaveLength(2);
  });

  // ── plugins ────────────────────────────────────────────────────────────

  it("passes LoggingPlugin and RetryPlugin to Agent constructor by default", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("s-plugins");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = call["plugins"] as Array<{ name: string }>;
    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe("litmdx:logging");
    expect(plugins[1].name).toBe("litmdx:retry");
  });

  it("omits LoggingPlugin when logging is false, RetryPlugin still present", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory({ ...baseConfig, logging: false }, mockStorage);
    await factory("s-no-logging");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = call["plugins"] as Array<{ name: string }>;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("litmdx:retry");
  });

  it("adds SkillsPlugin when skills are provided", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const skills = [
      {
        name: "test-skill",
        description: "A test skill.",
        instructions: "# Test Skill\nDo the thing.",
      },
    ];
    const factory = createAgentFactory({ ...baseConfig, skills }, mockStorage);
    await factory("s-skills");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = call["plugins"] as Array<{ name: string }>;
    expect(plugins.some((p) => p.name === "litmdx:skills")).toBe(true);
  });

  it("does NOT add SkillsPlugin when skills array is empty", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory({ ...baseConfig, skills: [] }, mockStorage);
    await factory("s-no-skills");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = call["plugins"] as Array<{ name: string }>;
    expect(plugins.every((p) => p.name !== "litmdx:skills")).toBe(true);
  });

  it("adds InterruptPlugin when interceptToolCall is provided", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, interceptToolCall: () => null },
      mockStorage,
    );
    await factory("s-interrupt");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = call["plugins"] as Array<{ name: string }>;
    expect(plugins.some((p) => p.name === "litmdx:interrupt")).toBe(true);
  });

  it("does NOT add InterruptPlugin when interceptToolCall is not set", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("s-no-interrupt");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = call["plugins"] as Array<{ name: string }>;
    expect(plugins.every((p) => p.name !== "litmdx:interrupt")).toBe(true);
  });

  // ── conversationManager selection ──────────────────────────────────────

  it("uses SlidingWindowConversationManager by default", async () => {
    const { SlidingWindowConversationManager, SummarizingConversationManager } =
      await import("@strands-agents/sdk");
    vi.mocked(SlidingWindowConversationManager).mockClear();
    vi.mocked(SummarizingConversationManager).mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("s-default-cm");

    expect(SlidingWindowConversationManager).toHaveBeenCalledOnce();
    expect(SummarizingConversationManager).not.toHaveBeenCalled();
  });

  it("uses SlidingWindowConversationManager when conversationManager is 'sliding-window'", async () => {
    const { SlidingWindowConversationManager, SummarizingConversationManager } =
      await import("@strands-agents/sdk");
    vi.mocked(SlidingWindowConversationManager).mockClear();
    vi.mocked(SummarizingConversationManager).mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, conversationManager: "sliding-window" },
      mockStorage,
    );
    await factory("s-explicit-sw");

    expect(SlidingWindowConversationManager).toHaveBeenCalledOnce();
    expect(SummarizingConversationManager).not.toHaveBeenCalled();
  });

  it("uses SummarizingConversationManager when conversationManager is 'summarizing'", async () => {
    const { SlidingWindowConversationManager, SummarizingConversationManager } =
      await import("@strands-agents/sdk");
    vi.mocked(SlidingWindowConversationManager).mockClear();
    vi.mocked(SummarizingConversationManager).mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, conversationManager: "summarizing" },
      mockStorage,
    );
    await factory("s-summarizing");

    expect(SummarizingConversationManager).toHaveBeenCalledOnce();
    expect(SlidingWindowConversationManager).not.toHaveBeenCalled();
  });

  it("passes shouldTruncateResults to SlidingWindowConversationManager", async () => {
    const { SlidingWindowConversationManager } = await import("@strands-agents/sdk");
    vi.mocked(SlidingWindowConversationManager).mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, shouldTruncateResults: false },
      mockStorage,
    );
    await factory("s-truncate");

    expect(SlidingWindowConversationManager).toHaveBeenCalledWith(
      expect.objectContaining({ shouldTruncateResults: false }),
    );
  });

  it("passes summaryRatio to SummarizingConversationManager", async () => {
    const { SummarizingConversationManager } = await import("@strands-agents/sdk");
    vi.mocked(SummarizingConversationManager).mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, conversationManager: "summarizing", summaryRatio: 0.5 },
      mockStorage,
    );
    await factory("s-ratio");

    expect(SummarizingConversationManager).toHaveBeenCalledWith(
      expect.objectContaining({ summaryRatio: 0.5 }),
    );
  });

  it("passes preserveRecentMessages to SummarizingConversationManager", async () => {
    const { SummarizingConversationManager } = await import("@strands-agents/sdk");
    vi.mocked(SummarizingConversationManager).mockClear();

    const factory = createAgentFactory(
      { ...baseConfig, conversationManager: "summarizing", preserveRecentMessages: 20 },
      mockStorage,
    );
    await factory("s-preserve");

    expect(SummarizingConversationManager).toHaveBeenCalledWith(
      expect.objectContaining({ preserveRecentMessages: 20 }),
    );
  });

  // ── structuredOutputSchema ─────────────────────────────────────────────

  it("passes structuredOutputSchema to Agent when set", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const fakeSchema = { _zod: "FaqSchema" } as never;
    const factory = createAgentFactory(
      { ...baseConfig, structuredOutputSchema: fakeSchema },
      mockStorage,
    );
    await factory("s-structured");

    expect(agentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ structuredOutputSchema: fakeSchema }),
    );
  });

  it("passes structuredOutputSchema as undefined when not set", async () => {
    const { Agent } = await import("@strands-agents/sdk");
    const agentSpy = vi.mocked(Agent);
    agentSpy.mockClear();

    const factory = createAgentFactory(baseConfig, mockStorage);
    await factory("s-no-structured");

    const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call["structuredOutputSchema"]).toBeUndefined();
  });

  // ── subAgents — orchestrator mode ──────────────────────────────────────

  describe("subAgents", () => {
    const docsSpecialist = {
      name: "docs_specialist",
      description: "Search and retrieve documentation pages.",
    };
    const codeSpecialist = {
      name: "code_specialist",
      description: "Write working code examples.",
      systemPrompt: "You are a code example specialist.",
    };

    it("single-agent mode: when subAgents is undefined, tools are passed directly to Agent", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const builtinTool = { _kind: "tool", name: "search_docs" } as never;
      const factory = createAgentFactory({ ...baseConfig, tools: [builtinTool] }, mockStorage);
      await factory("s-single");

      expect(agentSpy).toHaveBeenCalledOnce();
      const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call["tools"]).toEqual([builtinTool]);
    });

    it("single-agent mode: when subAgents is empty array, tools are passed directly to Agent", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const builtinTool = { _kind: "tool", name: "get_page" } as never;
      const factory = createAgentFactory(
        { ...baseConfig, tools: [builtinTool], subAgents: [] },
        mockStorage,
      );
      await factory("s-empty-subagents");

      expect(agentSpy).toHaveBeenCalledOnce();
      const call = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call["tools"]).toEqual([builtinTool]);
    });

    it("orchestrator mode: creates one Agent per sub-agent plus one for the orchestrator", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [docsSpecialist, codeSpecialist] },
        mockStorage,
      );
      await factory("s-orch");

      // 2 sub-agents + 1 orchestrator = 3 total
      expect(agentSpy).toHaveBeenCalledTimes(3);
    });

    it("orchestrator mode: calls getModel once per sub-agent plus once for the orchestrator", async () => {
      const getModel = vi.fn().mockResolvedValue({ _kind: "model" });
      const factory = createAgentFactory(
        { ...baseConfig, getModel, subAgents: [docsSpecialist, codeSpecialist] },
        mockStorage,
      );
      await factory("s-orch-model");

      expect(getModel).toHaveBeenCalledTimes(3);
    });

    it("orchestrator mode: orchestrator tools are the asTool() results from sub-agents", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [docsSpecialist] },
        mockStorage,
      );
      await factory("s-orch-tools");

      // Last Agent call is the orchestrator
      const orchestratorCall = agentSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      const tools = orchestratorCall["tools"] as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(1);
      expect(tools[0]["_kind"]).toBe("sub-agent-tool");
      expect(tools[0]["name"]).toBe("docs_specialist");
      expect(tools[0]["description"]).toBe("Search and retrieve documentation pages.");
    });

    it("orchestrator mode: sub-agents are created with printer: false", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [docsSpecialist] },
        mockStorage,
      );
      await factory("s-subagent-printer");

      // First call is the sub-agent
      const subAgentCall = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(subAgentCall["printer"]).toBe(false);
    });

    it("orchestrator mode: sub-agent inherits config.systemPrompt when systemPrompt not set", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, systemPrompt: "Orchestrator prompt", subAgents: [docsSpecialist] },
        mockStorage,
      );
      await factory("s-subagent-default-prompt");

      const subAgentCall = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(subAgentCall["systemPrompt"]).toBe("Orchestrator prompt");
    });

    it("orchestrator mode: sub-agent uses cfg.systemPrompt when explicitly set", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [codeSpecialist] },
        mockStorage,
      );
      await factory("s-subagent-custom-prompt");

      // calls[0] = auto-injected docs_specialist, calls[1] = codeSpecialist
      const subAgentCall = agentSpy.mock.calls[1]?.[0] as Record<string, unknown>;
      expect(subAgentCall["systemPrompt"]).toBe("You are a code example specialist.");
    });

    it("orchestrator mode: sub-agent uses sessionTools when cfg.tools not set", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const builtinTool = { _kind: "tool", name: "search_docs" } as never;
      const factory = createAgentFactory(
        { ...baseConfig, tools: [builtinTool], subAgents: [docsSpecialist] },
        mockStorage,
      );
      await factory("s-subagent-default-tools");

      const subAgentCall = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(subAgentCall["tools"]).toEqual([builtinTool]);
    });

    it("orchestrator mode: sub-agent uses cfg.tools when explicitly set", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const customTool = { _kind: "tool", name: "context7" } as never;
      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [{ ...docsSpecialist, tools: [customTool] }] },
        mockStorage,
      );
      await factory("s-subagent-custom-tools");

      const subAgentCall = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(subAgentCall["tools"]).toEqual([customTool]);
    });

    it("orchestrator mode: asTool is called with preserveContext: false by default", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [docsSpecialist] },
        mockStorage,
      );
      await factory("s-preserve-default");

      const subAgentInstance = agentSpy.mock.results[0]?.value as {
        asTool: ReturnType<typeof vi.fn>;
      };
      expect(subAgentInstance.asTool).toHaveBeenCalledWith(
        expect.objectContaining({ preserveContext: false }),
      );
    });

    it("orchestrator mode: asTool is called with preserveContext: true when set", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [{ ...docsSpecialist, preserveContext: true }] },
        mockStorage,
      );
      await factory("s-preserve-true");

      const subAgentInstance = agentSpy.mock.results[0]?.value as {
        asTool: ReturnType<typeof vi.fn>;
      };
      expect(subAgentInstance.asTool).toHaveBeenCalledWith(
        expect.objectContaining({ preserveContext: true }),
      );
    });

    it("orchestrator mode: each sub-agent tool is named via cfg.name and cfg.description", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [docsSpecialist, codeSpecialist] },
        mockStorage,
      );
      await factory("s-orch-names");

      const docsInstance = agentSpy.mock.results[0]?.value as {
        asTool: ReturnType<typeof vi.fn>;
      };
      const codeInstance = agentSpy.mock.results[1]?.value as {
        asTool: ReturnType<typeof vi.fn>;
      };

      expect(docsInstance.asTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "docs_specialist",
          description: "Search and retrieve documentation pages.",
        }),
      );
      expect(codeInstance.asTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "code_specialist",
          description: "Write working code examples.",
        }),
      );
    });

    // ── auto-injection ─────────────────────────────────────────────────

    it("auto-injects docs_specialist as first sub-agent when not already present", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      // Only code_specialist is configured — docs_specialist should be auto-prepended
      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [codeSpecialist] },
        mockStorage,
      );
      await factory("s-auto-inject");

      // 1 auto docs_specialist + 1 code_specialist + 1 orchestrator = 3 total
      expect(agentSpy).toHaveBeenCalledTimes(3);

      const firstSubAgentCall = agentSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      // First sub-agent built must be the auto-injected docs_specialist
      expect(firstSubAgentCall["systemPrompt"]).toContain("Docs Specialist");
    });

    it("auto-injected docs_specialist is named 'docs_specialist'", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [codeSpecialist] },
        mockStorage,
      );
      await factory("s-auto-name");

      const autoInjectedInstance = agentSpy.mock.results[0]?.value as {
        asTool: ReturnType<typeof vi.fn>;
      };
      expect(autoInjectedInstance.asTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: "docs_specialist" }),
      );
    });

    it("does NOT auto-inject docs_specialist when already present", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      // docs_specialist already provided explicitly
      const factory = createAgentFactory(
        { ...baseConfig, subAgents: [docsSpecialist, codeSpecialist] },
        mockStorage,
      );
      await factory("s-no-double-inject");

      // 2 sub-agents (no extra) + 1 orchestrator = 3 total
      expect(agentSpy).toHaveBeenCalledTimes(3);
    });

    it("auto-generates orchestrator system prompt when no explicit systemPrompt given", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        {
          ...baseConfig,
          systemPrompt: "You are a test assistant.",
          subAgents: [codeSpecialist],
        },
        mockStorage,
      );
      await factory("s-auto-orch-prompt");

      // Last Agent call is the orchestrator
      const orchestratorCall = agentSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(orchestratorCall["systemPrompt"]).toContain("Orchestrator");
    });

    it("uses orchestratorSystemPrompt when explicitly provided", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const customPrompt = "# My Custom Orchestrator\nDo what I say.";
      const factory = createAgentFactory(
        {
          ...baseConfig,
          subAgents: [codeSpecialist],
          orchestratorSystemPrompt: customPrompt,
        },
        mockStorage,
      );
      await factory("s-custom-orch-prompt");

      const orchestratorCall = agentSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(orchestratorCall["systemPrompt"]).toBe(customPrompt);
    });

    it("auto-generated orchestrator prompt includes projectName when provided", async () => {
      const { Agent } = await import("@strands-agents/sdk");
      const agentSpy = vi.mocked(Agent);
      agentSpy.mockClear();

      const factory = createAgentFactory(
        {
          ...baseConfig,
          projectName: "AcmeDocs",
          subAgents: [codeSpecialist],
        },
        mockStorage,
      );
      await factory("s-project-name");

      const orchestratorCall = agentSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(orchestratorCall["systemPrompt"]).toContain("AcmeDocs");
    });
  });
});
