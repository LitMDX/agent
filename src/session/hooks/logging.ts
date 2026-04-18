/**
 * Logging Plugin for @litmdx/agent.
 *
 * Implements the Strands `Plugin` interface to register lifecycle hook callbacks
 * on an Agent for structured console logging: invocation start/end, model calls,
 * and tool calls with timing.
 *
 * The Plugin interface is the idiomatic TypeScript SDK way to bundle hooks into a
 * reusable, composable unit with a stable name. Plugins are passed to the Agent
 * constructor via `new Agent({ plugins: [...] })`, which calls `initAgent(agent)`
 * for each plugin during initialization — cleaner than post-construction mutation.
 */

import type { Plugin, LocalAgent, Logger } from "@strands-agents/sdk";
import {
  BeforeInvocationEvent,
  AfterInvocationEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  AfterModelCallEvent,
} from "@strands-agents/sdk";
import type { Agent } from "@strands-agents/sdk";

export interface LoggingHooksConfig {
  /**
   * Custom logger implementation compatible with the Strands SDK `Logger` interface.
   * Defaults to `console`.
   */
  logger?: Logger;
  /**
   * Prefix for all log messages. Defaults to `[litmdx-agent]`.
   */
  prefix?: string;
}

/**
 * Strands Plugin that registers lifecycle hooks for structured console logging.
 *
 * Implements the `Plugin` interface — the idiomatic TypeScript SDK way to bundle
 * hooks into a reusable, composable unit. The SDK calls `initAgent(agent)` during
 * `new Agent({ plugins: [...] })` initialization, avoiding post-construction mutation.
 *
 * Hooks registered via `initAgent()`:
 * - `BeforeInvocationEvent` — logs when an agent invocation starts
 * - `AfterInvocationEvent`  — logs when an agent invocation ends
 * - `BeforeModelCallEvent`  — logs before the model is called
 * - `AfterModelCallEvent`   — logs after the model replies (includes stop reason)
 * - `BeforeToolCallEvent`   — logs tool name + input, starts a per-call timer
 * - `AfterToolCallEvent`    — logs tool result status + elapsed time
 *
 * @example
 * ```typescript
 * import { Agent } from '@strands-agents/sdk';
 * import { LoggingPlugin } from '@litmdx/agent';
 *
 * const agent = new Agent({ model, tools, plugins: [new LoggingPlugin()] });
 * ```
 */
export class LoggingPlugin implements Plugin {
  readonly name = "litmdx:logging";

  constructor(private readonly config?: LoggingHooksConfig) {}

  initAgent(agent: LocalAgent): void {
    const logger = this.config?.logger ?? console;
    const prefix = this.config?.prefix ?? "[litmdx-agent]";

    // Per-tool-call timers keyed by toolUseId
    const timings = new Map<string, number>();

    agent.addHook(BeforeInvocationEvent, (_event) => {
      logger.info({ prefix }, "invocation started");
    });

    agent.addHook(AfterInvocationEvent, (_event) => {
      logger.info({ prefix }, "invocation completed");
    });

    agent.addHook(BeforeModelCallEvent, (event) => {
      logger.debug({ prefix, modelId: event.model.modelId ?? "unknown" }, "model call");
    });

    agent.addHook(AfterModelCallEvent, (event) => {
      const stopReason = event.stopData?.stopReason ?? (event.error ? "error" : "unknown");
      const payload = { prefix, stopReason, error: event.error?.message };
      if (event.error) {
        logger.error(payload, "model done");
        return;
      }
      logger.debug(payload, "model done");
    });

    agent.addHook(BeforeToolCallEvent, (event) => {
      const { name, toolUseId, input } = event.toolUse;
      timings.set(toolUseId, Date.now());
      logger.debug({ prefix, toolName: name, toolUseId, input }, "tool call");
    });

    agent.addHook(AfterToolCallEvent, (event) => {
      const { name, toolUseId } = event.toolUse;
      const start = timings.get(toolUseId);
      const elapsedMs = start !== undefined ? Date.now() - start : undefined;
      timings.delete(toolUseId);

      const status = event.error ? "error" : (event.result.status ?? "success");
      const payload = {
        prefix,
        toolName: name,
        toolUseId,
        status,
        elapsedMs,
        elapsed: elapsedMs !== undefined ? `${elapsedMs}ms` : "?ms",
        error: event.error?.message,
      };

      if (event.error) {
        logger.error(payload, "tool done");
        return;
      }
      logger.debug(payload, "tool done");
    });
  }
}

/**
 * Convenience wrapper — creates a `LoggingPlugin` and calls `initAgent(agent)`.
 *
 * For new code, prefer passing a `LoggingPlugin` instance to `new Agent({ plugins })`:
 * ```typescript
 * new Agent({ model, tools, plugins: [new LoggingPlugin(config)] })
 * ```
 */
export function registerLoggingHooks(agent: Agent, config?: LoggingHooksConfig): void {
  new LoggingPlugin(config).initAgent(agent as unknown as LocalAgent);
}
