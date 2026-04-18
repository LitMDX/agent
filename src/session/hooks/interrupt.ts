/**
 * InterruptPlugin — TypeScript implementation of the Strands Interrupt pattern.
 *
 * The Strands Python SDK provides `event.interrupt()` on `BeforeToolCallEvent`
 * to pause agent execution and request human input before continuing.
 * The TypeScript SDK (v1.0.0-rc.3) does not yet expose `event.interrupt()` —
 * instead it provides `BeforeToolCallEvent.cancel` to block individual tool
 * calls, which is the TypeScript equivalent of Python's `event.cancel_tool`.
 *
 * This plugin wraps that mechanism in a composable `Plugin` that accepts a
 * user-supplied interceptor function:
 *
 *   - Return a **string** → cancel the tool call and send that string as the
 *     error result back to the model.
 *   - Return **`true`** → cancel with a generic "tool call intercepted" message.
 *   - Return `null`, `undefined`, or `false` → allow the tool call to proceed.
 *
 * Use cases for `@litmdx/agent`:
 *   - Block tool calls that would expose restricted documentation.
 *   - Rate-limit expensive search/fetch operations.
 *   - Log or audit every tool invocation with custom logic.
 *   - Deny calls based on session context stored in `appState`.
 *
 * @example Basic deny-by-name
 * ```typescript
 * import { InterruptPlugin } from "@litmdx/agent";
 *
 * const plugin = new InterruptPlugin(({ name }) =>
 *   name === "get_page" ? "Access to this tool is restricted." : null
 * );
 * ```
 *
 * @example Via SessionConfig
 * ```typescript
 * createNodeHttpServer({
 *   docsDir: "./docs",
 *   interceptToolCall: ({ name }) =>
 *     name === "search_docs" ? "Search is temporarily disabled." : null,
 * });
 * ```
 *
 * @see https://strandsagents.com/docs/user-guide/concepts/interrupts/
 */

import { BeforeToolCallEvent } from "@strands-agents/sdk";
import type { Plugin, LocalAgent } from "@strands-agents/sdk";
import type { JSONValue } from "@strands-agents/sdk";

/**
 * Interceptor function type.
 *
 * Called before every tool execution with the tool use metadata.
 * Return a string to cancel with a custom message, `true` to cancel with the
 * default message, or a falsy value to allow the call to proceed.
 */
export type ToolInterceptFn = (toolUse: {
  /** Name of the tool being called. */
  name: string;
  /** Unique identifier for this tool use instance. */
  toolUseId: string;
  /** Input arguments passed to the tool by the model. */
  input: JSONValue;
}) => string | boolean | null | undefined;

export class InterruptPlugin implements Plugin {
  readonly name = "litmdx:interrupt";

  constructor(private readonly shouldCancel: ToolInterceptFn) {}

  /**
   * Registers a `BeforeToolCallEvent` hook that invokes the interceptor before
   * every tool execution.
   *
   * When the interceptor returns a truthy value the SDK's `event.cancel`
   * mechanism is engaged:
   *   - A string → used as the error message returned to the model.
   *   - `true`   → SDK default cancel message is used.
   *
   * The agent loop continues after a cancellation (the model receives the
   * error result and may decide how to proceed), which mirrors the semantics
   * of Python's `event.cancel_tool`.
   */
  initAgent(agent: LocalAgent): void {
    agent.addHook(BeforeToolCallEvent, (event) => {
      const result = this.shouldCancel({
        name: event.toolUse.name,
        toolUseId: event.toolUse.toolUseId,
        input: event.toolUse.input,
      });
      if (result) {
        event.cancel = typeof result === "string" ? result : true;
      }
    });
  }
}
