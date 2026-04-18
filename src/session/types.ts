/**
 * Shared types for the session layer.
 */

import type {
  Agent,
  ToolList,
  Model,
  BaseModelConfig,
  SnapshotStorage,
  McpClient,
} from "@strands-agents/sdk";
import type { z } from "zod";
import type { SkillDefinition } from "./skills/index.js";
import type { ToolInterceptFn } from "./hooks/index.js";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type ModelFactory = () => Promise<Model<BaseModelConfig>>;

/**
 * Configuration for a sub-agent that is exposed as a tool to the orchestrator.
 *
 * When `SessionConfig.subAgents` is non-empty the session enters **orchestrator
 * mode**: the main agent's tool list is replaced by the sub-agent tools so the
 * orchestrator delegates every domain task to a specialist rather than calling
 * built-in tools directly.
 *
 * @example
 * ```typescript
 * subAgents: [
 *   {
 *     name: 'docs_specialist',
 *     description: 'Search and retrieve documentation pages.',
 *     systemPrompt: 'You are a documentation retrieval specialist…',
 *   },
 *   {
 *     name: 'code_specialist',
 *     description: 'Write working code examples using docs and Context7.',
 *     systemPrompt: 'You are a code example specialist…',
 *     tools: [getPageTool, context7Client],
 *   },
 * ]
 * ```
 */
export interface SubAgentConfig {
  /** Tool name the orchestrator uses when calling this sub-agent. */
  name: string;
  /**
   * Natural-language description of this sub-agent's role.
   * The orchestrator reads this to decide when to delegate to it.
   */
  description: string;
  /**
   * System prompt for the sub-agent.
   * Defaults to the same system prompt as the orchestrator.
   */
  systemPrompt?: string;
  /**
   * Tools available to the sub-agent.
   * Defaults to the session's built-in tools plus any configured mcpClients.
   */
  tools?: ToolList;
  /**
   * Whether to preserve conversation context between calls from the orchestrator.
   * @default false
   */
  preserveContext?: boolean;
}

export interface SessionConfig {
  getModel: ModelFactory;
  tools: ToolList;
  systemPrompt: string;
  windowSize: number;
  /**
   * Root directory for FileStorage session snapshots.
   * Defaults to `<os.tmpdir()>/litmdx-sessions`.
   * Ignored when `storage` is provided.
   */
  sessionsDir?: string;
  /**
   * Custom SnapshotStorage backend (e.g. S3Storage).
   * When set, takes precedence over `sessionsDir`.
   */
  storage?: SnapshotStorage;
  /**
   * External MCP servers to use as additional tool sources.
   * Each McpClient is connected and its tools are registered alongside the
   * built-in `list_pages`, `get_page`, and `search_docs` tools.
   *
   * @example
   * ```typescript
   * import { McpClient } from '@strands-agents/sdk';
   * import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
   *
   * const mcpClient = new McpClient({
   *   transport: new SSEClientTransport(new URL('http://localhost:3001/sse'))
   * });
   * ```
   */
  mcpClients?: McpClient[];
  /**
   * Enable @litmdx/agent lifecycle hooks for structured console logging.
   * Logs tool calls (with timing), model calls, and invocation lifecycle.
   * Defaults to `true`.
   */
  logging?: boolean;
  /**
   * Conversation history management strategy.
   *
   * - `'sliding-window'` (default): Keeps the last `windowSize` messages,
   *   discarding older ones. Fast and deterministic.
   * - `'summarizing'`: When a context overflow occurs, summarises the oldest
   *   messages with a model call and replaces them with a compact summary,
   *   preserving context that would otherwise be lost.
   *
   * @default 'sliding-window'
   */
  conversationManager?: "sliding-window" | "summarizing";
  /**
   * Whether to truncate tool results that are too large for the model's context window.
   * Only applies when `conversationManager` is `'sliding-window'`.
   * @default true
   */
  shouldTruncateResults?: boolean;
  /**
   * Ratio of older messages to summarize when a context overflow occurs.
   * Clamped to [0.1, 0.8].
   * Only applies when `conversationManager` is `'summarizing'`.
   * @default 0.3
   */
  summaryRatio?: number;
  /**
   * Minimum number of recent messages to always keep in the history.
   * Only applies when `conversationManager` is `'summarizing'`.
   * @default 10
   */
  preserveRecentMessages?: number; /**
   * Zod schema for structured output. When set, every agent invocation will
   * attempt to coerce the model response into the given schema and expose the
   * validated object via `AgentResult.structuredOutput`.
   *
   * Per the Strands TypeScript SDK, this maps to `structuredOutputSchema` on
   * the `Agent` constructor (agent-level default) and can be overridden
   * per-invocation via `agent.invoke(msg, { structuredOutputSchema })`.
   *
   * @example
   * ```typescript
   * import { z } from 'zod';
   * const FaqSchema = z.object({
   *   question: z.string(),
   *   answer: z.string(),
   * });
   * createNodeHttpServer({ ..., structuredOutputSchema: FaqSchema });
   * ```
   */
  structuredOutputSchema?: z.ZodSchema;
  /**
   * Interceptor function called before every tool execution.
   *
   * Implements the TypeScript equivalent of the Strands interrupt pattern:
   * return a **string** to cancel the tool call with that message, **`true`**
   * to cancel with the default message, or a falsy value to allow the call.
   *
   * When set, `InterruptPlugin` is automatically added to the agent's plugins.
   * The plugin hooks `BeforeToolCallEvent` and sets `event.cancel` when the
   * interceptor returns a truthy value.
   *
   * This is the TypeScript equivalent of Python's `event.cancel_tool` /
   * `event.interrupt()` patterns (full pause/resume not yet in the TS SDK).
   *
   * @example Block a specific tool
   * ```typescript
   * interceptToolCall: ({ name }) =>
   *   name === 'get_page' ? 'Access restricted.' : null,
   * ```
   *
   * @see https://strandsagents.com/docs/user-guide/concepts/interrupts/
   */
  interceptToolCall?: ToolInterceptFn;
  /**
   * Skills available to the agent for on-demand specialised instructions.
   *
   * When provided, `SkillsPlugin` is automatically added to the agent's plugin
   * list.  The plugin injects an `<available_skills>` XML discovery block into
   * the system prompt before every invocation, and registers a `skills` tool
   * that the model can call to load a skill's full instructions on demand.
   *
   * This is the TypeScript equivalent of the Python SDK's `AgentSkills` plugin
   * (not yet available in the TypeScript SDK as of v1.0.0-rc.3).
   *
   * @example
   * ```typescript
   * skills: [
   *   {
   *     name: "mdx-troubleshooting",
   *     description: "Diagnose and fix common MDX compilation errors.",
   *     instructions: "# MDX Troubleshooting\nYou are an expert…",
   *   },
   * ]
   * ```
   */
  skills?: SkillDefinition[];
  /**
   * Maximum number of retry attempts when the model returns a `ModelThrottledError`.
   * Uses exponential backoff starting at `retryDelayMs`.
   * Set to 0 to disable retries.
   *
   * Implemented via `AfterModelCallEvent.retry = true` — the TypeScript SDK
   * equivalent of Python's `ModelRetryStrategy`.
   *
   * @default 3
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds before the first retry attempt.
   * Doubles with each subsequent retry (exponential backoff).
   * Only used when `maxRetries` is greater than 0.
   * @default 1000
   */
  retryDelayMs?: number;
  /**
   * Enable the `notebook` vended tool from `@strands-agents/sdk`.
   * Gives the agent a persistent scratchpad it can read and write across
   * invocations — ideal for multi-step documentation explorations and
   * planning tasks. Notebook state is persisted automatically as part of
   * the session snapshot.
   *
   * Works in all environments: Node.js, browsers, Cloudflare Workers.
   * @default false
   */
  notebook?: boolean;
  /**
   * Sub-agents to register as tools for an orchestrator agent.
   *
   * When non-empty, the session enters **orchestrator mode**: the main agent's
   * tool list is replaced by the sub-agent tools (each wrapping its own
   * `Agent` via `agent.asTool()`). The orchestrator uses its `systemPrompt`
   * to decide which specialist to call for each user request.
   *
   * Each sub-agent receives its own model instance and, by default, a
   * stateless context (reset between orchestrator calls). Set
   * `SubAgentConfig.preserveContext: true` to maintain state.
   *
   * @see {@link SubAgentConfig}
   */
  subAgents?: SubAgentConfig[];
  /**
   * Project name used when auto-generating the orchestrator system prompt.
   *
   * When `subAgents` is non-empty and no explicit `orchestratorSystemPrompt`
   * is set, this name appears in the auto-generated orchestrator identity
   * header (e.g. `# MyProject Docs Assistant — Orchestrator`).
   *
   * Adapters populate this automatically from the docs directory basename
   * or `docsIndexUrl` hostname. You rarely need to set it manually.
   */
  projectName?: string;
  /**
   * Custom system prompt for the orchestrator agent.
   *
   * Only used when `subAgents` is non-empty (orchestrator mode). When omitted,
   * `defaultOrchestratorSystemPrompt()` is used automatically — so you only
   * need this field to override the generated prompt.
   *
   * The generated prompt already includes routing constraints for
   * `docs_specialist` and all registered sub-agents, and instructs the
   * orchestrator to return specialist responses verbatim.
   */
  orchestratorSystemPrompt?: string;
}

export type AgentFactory = (sessionId: string) => Promise<Agent>;
