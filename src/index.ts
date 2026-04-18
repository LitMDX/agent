/**
 * @litmdx/agent — Strands-powered documentation agent for LitMDX.
 *
 * Core exports — use these to build custom integrations:
 *
 *   import { buildIndex, SessionStore, createTools, buildModel } from '@litmdx/agent';
 *
 * For ready-made deployment adapters use the sub-path exports:
 *
 *   import { createNodeHttpServer } from '@litmdx/agent/adapters/node-http';
 *   import { createLambdaHandler }  from '@litmdx/agent/adapters/lambda';
 *   import { createHonoApp }        from '@litmdx/agent/adapters/hono';
 */

// Indexer
export { buildIndex } from "./indexer/index.js";
export type { PageEntry, DocsIndex } from "./indexer/index.js";

// Tools
export {
  createTools,
  createListPagesTool,
  createGetPageTool,
  createSearchDocsTool,
  listPagesImpl,
  getPageImpl,
  searchDocsImpl,
} from "./tools/index.js";
export type { SearchResult } from "./tools/index.js";

// Model
export { buildModel, resolveApiKey } from "./model/index.js";
export type { AgentProvider } from "./model/index.js";

// Official Strands SDK logging
export { configureSdkLogging } from "./logging/sdk.js";
export type { SdkLoggingOption } from "./logging/sdk.js";

// Session
export { SessionStore, DOCS_SPECIALIST_NAME } from "./session/index.js";
export type { ModelFactory, SessionConfig, AgentFactory, SubAgentConfig } from "./session/index.js";
export { SkillsPlugin } from "./session/index.js";
export type { SkillDefinition } from "./session/index.js";
export { InterruptPlugin } from "./session/index.js";
export type { ToolInterceptFn } from "./session/index.js";

// Default prompts (for custom orchestrators / specialists)
export {
  defaultSystemPrompt,
  defaultDocsSpecialistSystemPrompt,
  defaultOrchestratorSystemPrompt,
} from "./adapters/shared.js";

// Dispatcher (for custom adapters)
export { createDispatcher } from "./dispatcher/index.js";
export type { AgentRequest, AgentResponseKind, DispatcherConfig } from "./dispatcher/index.js";

// Vite plugin
export { litmdxAgentPlugin } from "./vite-plugin/index.js";
export type { LitmdxAgentPluginOptions } from "./vite-plugin/index.js";
