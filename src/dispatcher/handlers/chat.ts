/**
 * Handler: POST /chat  (blocking)
 *
 * Invokes the agent synchronously and returns the full response as JSON.
 *
 * Optional request body fields:
 *   include_metrics: boolean  — include AgentMetrics in the response
 *   include_traces:  boolean  — include AgentTrace[] in the response
 */

import type { AgentResult } from "@strands-agents/sdk";
import type { SessionStore } from "../../session/index.js";
import type { AgentRequest, AgentResponseKind } from "../types.js";

export async function handleChat(
  req: AgentRequest,
  store: SessionStore,
): Promise<AgentResponseKind> {
  const message = (req.body["message"] as string | undefined)?.trim();
  if (!message) {
    return { kind: "json", status: 400, body: { error: '"message" is required' } };
  }
  const sessionId = (req.body["session_id"] as string | undefined) ?? "default";
  const includeMetrics = req.body["include_metrics"] === true;
  const includeTraces = req.body["include_traces"] === true;

  const agent = await store.getOrCreate(sessionId);
  const result = await agent.invoke(message);
  const agentResult = result as unknown as AgentResult;

  const body: Record<string, unknown> = { response: String(result) };

  if (agentResult.structuredOutput !== undefined) {
    body["structuredOutput"] = agentResult.structuredOutput;
  }
  if (includeMetrics && agentResult.metrics !== undefined) {
    body["metrics"] = agentResult.metrics;
  }
  if (includeTraces && agentResult.traces !== undefined) {
    body["traces"] = agentResult.traces;
  }

  return { kind: "json", status: 200, body };
}
