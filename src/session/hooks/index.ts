/**
 * Strands Hooks + Plugin integration for @litmdx/agent.
 *
 * TypeScript SDK uses the Plugin interface (not callback handlers — that's Python-only).
 * Plugins wrap hooks into named, composable units passed to `new Agent({ plugins: [...] })`.
 * See: https://strandsagents.com/docs/user-guide/concepts/agents/hooks/
 */

export { LoggingPlugin, registerLoggingHooks } from "./logging.js";
export type { LoggingHooksConfig } from "./logging.js";

export { RetryPlugin, registerRetryHook } from "./retry.js";
export type { RetryHookConfig } from "./retry.js";

export { InterruptPlugin } from "./interrupt.js";
export type { ToolInterceptFn } from "./interrupt.js";
