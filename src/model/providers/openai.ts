/**
 * Provider: OpenAI
 *
 * Lazily imports `@strands-agents/sdk/models/openai` so the module is only
 * loaded when the openai provider is actually requested.
 */

import type { Model, BaseModelConfig } from "@strands-agents/sdk";

export const DEFAULT_OPENAI_MODEL = "gpt-4o";

export async function buildOpenAIModel(
  apiKey: string,
  modelId?: string,
): Promise<Model<BaseModelConfig>> {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  const { OpenAIModel } = await import("@strands-agents/sdk/models/openai");
  return new OpenAIModel({ api: "chat", apiKey, modelId: modelId ?? DEFAULT_OPENAI_MODEL });
}
