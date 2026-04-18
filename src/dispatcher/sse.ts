/**
 * SSE (Server-Sent Events) streaming generator.
 *
 * Consumes the Strands agent stream using the official async-iterator pattern
 * and yields SSE-encoded strings that any adapter can write directly to an
 * HTTP response.
 *
 * @see https://strandsagents.com/docs/user-guide/concepts/streaming/async-iterators/
 *
 * Protocol:
 *   data: <text>\n\n              — incremental text delta (newlines escaped as \n)
 *   data: [STRUCTURED_OUTPUT] …\n\n — JSON-encoded structured output (when schema set)
 *   data: [METRICS] …\n\n         — JSON-encoded AgentMetrics (when include_metrics is true)
 *   data: [TRACES] …\n\n          — JSON-encoded AgentTrace[] (when include_traces is true)
 *   data: [DONE]\n\n              — stream completed successfully
 *   data: [ERROR] …\n\n           — stream terminated with an error
 *   : keepalive\n\n               — SSE comment (ignored by clients, keeps connection alive
 *                                   during long-running tool calls such as sub-agents)
 */

import type { Agent, AgentResult } from "@strands-agents/sdk";

export interface StreamResponseOptions {
  /** Include AgentMetrics as a [METRICS] event before [DONE]. */
  includeMetrics?: boolean;
  /** Include AgentTrace[] as a [TRACES] event before [DONE]. */
  includeTraces?: boolean;
}

export async function* streamResponse(
  agent: Agent,
  message: string,
  opts?: StreamResponseOptions,
): AsyncGenerator<string> {
  const controller = new AbortController();

  try {
    let agentResult: AgentResult | undefined;

    for await (const event of agent.stream(message, { cancelSignal: controller.signal })) {
      switch (event.type) {
        case "modelStreamUpdateEvent": {
          if (
            event.event.type === "modelContentBlockDeltaEvent" &&
            event.event.delta.type === "textDelta"
          ) {
            yield `data: ${event.event.delta.text.replace(/\n/g, "\\n")}\n\n`;
          }
          break;
        }
        case "agentResultEvent": {
          agentResult = event.result;
          break;
        }
        default: {
          // Emit an SSE comment for every unhandled event (tool calls, tool
          // results, cycle events, etc.).  SSE comment lines start with ':'
          // and are silently ignored by EventSource clients, but they DO
          // flush the TCP write buffer — keeping the connection alive during
          // long-running tool calls (e.g. a sub-agent that takes several
          // seconds to complete).
          yield ": keepalive\n\n";
          break;
        }
      }
    }

    if (agentResult?.structuredOutput !== undefined) {
      yield `data: [STRUCTURED_OUTPUT] ${JSON.stringify(agentResult.structuredOutput)}\n\n`;
    }
    if (opts?.includeMetrics && agentResult?.metrics !== undefined) {
      yield `data: [METRICS] ${JSON.stringify(agentResult.metrics)}\n\n`;
    }
    if (opts?.includeTraces && agentResult?.traces !== undefined) {
      yield `data: [TRACES] ${JSON.stringify(agentResult.traces)}\n\n`;
    }
    yield "data: [DONE]\n\n";
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).replace(/\n/g, " ");
    yield `data: [ERROR] ${msg}\n\n`;
  }
}
