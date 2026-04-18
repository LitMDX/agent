/**
 * Session layer.
 *
 * Re-exports all public symbols from the session sub-modules so that the
 * rest of the codebase can import from a single path.
 */

export { SessionStore } from "./store.js";
export {
  resolveStorage,
  resolveS3Storage,
  createAgentFactory,
  DOCS_SPECIALIST_NAME,
} from "./agent-factory.js";
export type { S3SessionsConfig } from "./agent-factory.js";
export type { ModelFactory, SessionConfig, AgentFactory, SubAgentConfig } from "./types.js";
export { MemoryStorage } from "./memory-storage.js";
export { registerLoggingHooks } from "./hooks/index.js";
export type { LoggingHooksConfig } from "./hooks/index.js";
export { SkillsPlugin } from "./skills/index.js";
export type { SkillDefinition } from "./skills/index.js";
export { InterruptPlugin } from "./hooks/index.js";
export type { ToolInterceptFn } from "./hooks/index.js";
