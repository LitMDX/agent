/**
 * Agent factory.
 *
 * Builds a fully configured Strands Agent for a given sessionId:
 *   - resolves the SnapshotStorage backend (custom or FileStorage)
 *   - wires up SessionManager with snapshot persistence
 *   - wires up SlidingWindowConversationManager
 *   - stamps initial appState
 *
 * Exported individually so adapters and tests can inject custom storage or
 * bypass the factory entirely.
 */

import {
  Agent,
  SlidingWindowConversationManager,
  SummarizingConversationManager,
  SessionManager,
} from "@strands-agents/sdk";
import { notebook as notebookTool } from "@strands-agents/sdk/vended-tools/notebook";
import type { SnapshotStorage } from "@strands-agents/sdk";
import type { Plugin } from "@strands-agents/sdk";
import type { SessionConfig, AgentFactory } from "./types.js";
import { LoggingPlugin, RetryPlugin, InterruptPlugin } from "./hooks/index.js";
import { SkillsPlugin } from "./skills/index.js";
import {
  defaultDocsSpecialistSystemPrompt,
  defaultOrchestratorSystemPrompt,
} from "../adapters/shared.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the built-in documentation retrieval specialist. */
export const DOCS_SPECIALIST_NAME = "docs_specialist";

/** Description used when auto-injecting the docs_specialist sub-agent. */
const DOCS_SPECIALIST_DESCRIPTION =
  "Search and retrieve relevant documentation pages. Use for conceptual questions, " +
  "explanations, feature overviews, and configuration reference lookups.";

// ---------------------------------------------------------------------------
// Storage resolution
// ---------------------------------------------------------------------------

export interface S3SessionsConfig {
  bucket: string;
  prefix?: string;
  region?: string;
}

/**
 * Lazily constructs an S3Storage from an `{ bucket, prefix?, region? }` config.
 * Returns `undefined` when no config is provided.
 * The `@aws-sdk/client-s3` package is imported dynamically — callers that never
 * use S3 pay no startup cost.
 */
export async function resolveS3Storage(
  s3Sessions?: S3SessionsConfig,
): Promise<SnapshotStorage | undefined> {
  if (!s3Sessions) return undefined;
  const { S3Storage } = await import("@strands-agents/sdk/session/s3-storage");
  return new S3Storage(s3Sessions);
}

/**
 * Resolves the SnapshotStorage backend.
 * When `config.storage` is provided it is used directly — no Node.js modules
 * are imported, making this path safe for Cloudflare Workers and other
 * edge runtimes.
 * When no storage is supplied we fall back to `FileStorage` (Node.js only).
 */
export async function resolveStorage(config: SessionConfig): Promise<SnapshotStorage> {
  if (config.storage) return config.storage;

  // Dynamic import keeps node:fs / node:os out of the CF Workers bundle when
  // a custom storage adapter is provided.
  const [{ default: os }, { default: path }, { FileStorage }] = await Promise.all([
    import("node:os"),
    import("node:path"),
    import("@strands-agents/sdk"),
  ]);
  return new FileStorage(config.sessionsDir ?? path.join(os.tmpdir(), "litmdx-sessions"));
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

export function createAgentFactory(
  config: SessionConfig,
  snapshotStorage: SnapshotStorage,
): AgentFactory {
  return async (sessionId: string) => {
    const model = await config.getModel();

    const sessionManager = new SessionManager({
      sessionId,
      storage: { snapshot: snapshotStorage },
      saveLatestOn: "invocation",
    });

    // Merge built-in tools with optional vended tools and external MCP clients.
    // McpClient instances are accepted directly in ToolList and their tools
    // are resolved lazily during Agent.initialize().
    const extraTools: unknown[] = [];
    if (config.notebook) extraTools.push(notebookTool);
    if (config.mcpClients?.length) extraTools.push(...config.mcpClients);
    const sessionTools = extraTools.length
      ? ([...(config.tools as unknown[]), ...extraTools] as typeof config.tools)
      : config.tools;

    // Orchestrator mode: when subAgents are configured, build each specialist
    // agent and expose it as a tool. The orchestrator's own tool list is
    // replaced by these sub-agent tools so it delegates every domain call.
    //
    // Auto-injections (both skipped when already explicitly configured):
    //   1. `docs_specialist` — prepended to the sub-agents list so it is
    //      always available for documentation retrieval, even when the user
    //      only registered custom specialists.
    //   2. Orchestrator system prompt — generated from
    //      `defaultOrchestratorSystemPrompt()` when no explicit `systemPrompt`
    //      was provided in the session config.
    let tools = sessionTools;
    if (config.subAgents?.length) {
      // 1. Auto-inject docs_specialist if not already present
      const hasDocsSpecialist = config.subAgents.some((s) => s.name === DOCS_SPECIALIST_NAME);
      const resolvedSubAgents = hasDocsSpecialist
        ? config.subAgents
        : [
            {
              name: DOCS_SPECIALIST_NAME,
              description: DOCS_SPECIALIST_DESCRIPTION,
              systemPrompt: defaultDocsSpecialistSystemPrompt(),
            },
            ...config.subAgents,
          ];

      // 2. Auto-generate orchestrator system prompt if not explicitly set
      const orchestratorPrompt =
        config.orchestratorSystemPrompt ??
        defaultOrchestratorSystemPrompt(
          config.projectName ?? "Docs",
          resolvedSubAgents.filter((s) => s.name !== DOCS_SPECIALIST_NAME).map((s) => s.name),
        );

      const subAgentTools = await Promise.all(
        resolvedSubAgents.map(async (cfg) => {
          const subModel = await config.getModel();
          const subTools = cfg.tools ?? sessionTools;
          const subAgent = new Agent({
            model: subModel,
            tools: subTools,
            systemPrompt: cfg.systemPrompt ?? config.systemPrompt,
            printer: false,
          });
          return subAgent.asTool({
            name: cfg.name,
            description: cfg.description,
            preserveContext: cfg.preserveContext ?? false,
          });
        }),
      );
      tools = subAgentTools as unknown as typeof config.tools;

      // Override the system prompt with the orchestrator's prompt for this session
      config = { ...config, systemPrompt: orchestratorPrompt };
    }

    // Build the plugins array — passed to the Agent constructor so the SDK calls
    // `plugin.initAgent(agent)` during initialization (idiomatic Plugin pattern).
    const plugins: Plugin[] = [];
    if (config.logging !== false) {
      plugins.push(new LoggingPlugin());
    }
    if (config.maxRetries === undefined || config.maxRetries > 0) {
      plugins.push(
        new RetryPlugin({
          maxRetries: config.maxRetries,
          retryDelayMs: config.retryDelayMs,
        }),
      );
    }
    if (config.skills?.length) {
      plugins.push(new SkillsPlugin(config.skills));
    }
    if (config.interceptToolCall) {
      plugins.push(new InterruptPlugin(config.interceptToolCall));
    }

    const agent = new Agent({
      model,
      tools,
      systemPrompt: config.systemPrompt,
      structuredOutputSchema: config.structuredOutputSchema,
      conversationManager:
        config.conversationManager === "summarizing"
          ? new SummarizingConversationManager({
              summaryRatio: config.summaryRatio,
              preserveRecentMessages: config.preserveRecentMessages,
            })
          : new SlidingWindowConversationManager({
              windowSize: config.windowSize,
              shouldTruncateResults: config.shouldTruncateResults,
            }),
      sessionManager,
      plugins,
      appState: {
        session_id: sessionId,
        started_at: new Date().toISOString(),
        message_count: 0,
      },
      printer: false,
    });

    return agent;
  };
}
