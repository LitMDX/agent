/**
 * Retry Plugin for @litmdx/agent.
 *
 * Implements the Strands `Plugin` interface to register an AfterModelCallEvent hook
 * that retries ModelThrottledError failures with exponential backoff using the
 * Strands SDK's `event.retry = true` mechanism — the TypeScript equivalent of
 * Python's `ModelRetryStrategy`.
 *
 * See: https://strandsagents.com/docs/user-guide/concepts/agents/retry-strategies/
 */

import type { Plugin, LocalAgent } from "@strands-agents/sdk";
import { AfterModelCallEvent, ModelThrottledError } from "@strands-agents/sdk";
import type { Agent } from "@strands-agents/sdk";

export interface RetryHookConfig {
  /**
   * Maximum number of retry attempts after an initial failure.
   * Set to 0 to disable retries.
   * @default 3
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds before the first retry.
   * Doubles with each subsequent attempt (exponential backoff).
   * @default 1000
   */
  retryDelayMs?: number;
  /**
   * Custom logger for retry messages. Defaults to `console.log`.
   */
  logger?: (msg: string) => void;
}

/**
 * Strands Plugin that registers a `AfterModelCallEvent` hook for automatic retry
 * of `ModelThrottledError` failures with exponential backoff.
 *
 * Implements the `Plugin` interface — the idiomatic TypeScript SDK way to bundle
 * hooks into a reusable, composable unit. The SDK calls `initAgent(agent)` during
 * `new Agent({ plugins: [...] })` initialization.
 *
 * @example
 * ```typescript
 * import { Agent } from '@strands-agents/sdk';
 * import { RetryPlugin } from '@litmdx/agent';
 *
 * const agent = new Agent({
 *   model, tools,
 *   plugins: [new RetryPlugin({ maxRetries: 3, retryDelayMs: 2000 })],
 * });
 * ```
 */
export class RetryPlugin implements Plugin {
  readonly name = "litmdx:retry";

  constructor(private readonly config?: RetryHookConfig) {}

  initAgent(agent: LocalAgent): void {
    const maxRetries = this.config?.maxRetries ?? 3;
    const retryDelayMs = this.config?.retryDelayMs ?? 1000;
    const log = this.config?.logger ?? ((msg: string) => console.log(msg));

    let attempts = 0;

    agent.addHook(AfterModelCallEvent, async (event) => {
      if (!event.error || !(event.error instanceof ModelThrottledError)) {
        // Non-throttle errors or successful calls: reset counter, do not retry
        attempts = 0;
        return;
      }

      if (attempts >= maxRetries) {
        log(`[litmdx-agent] ⚠️  model throttled — max retries (${maxRetries}) reached`);
        attempts = 0;
        return;
      }

      attempts++;
      const delay = retryDelayMs * Math.pow(2, attempts - 1);
      log(`[litmdx-agent] 🔄 model throttled — retry ${attempts}/${maxRetries} in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      event.retry = true;
    });
  }
}

/**
 * Convenience wrapper — creates a `RetryPlugin` and calls `initAgent(agent)`.
 *
 * For new code, prefer passing a `RetryPlugin` instance to `new Agent({ plugins })`:
 * ```typescript
 * new Agent({ model, tools, plugins: [new RetryPlugin(config)] })
 * ```
 */
export function registerRetryHook(agent: Agent, config?: RetryHookConfig): void {
  new RetryPlugin(config).initAgent(agent as unknown as LocalAgent);
}
