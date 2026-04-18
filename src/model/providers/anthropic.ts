/**
 * Provider: Anthropic
 *
 * Lazily imports `@strands-agents/sdk/models/anthropic`. If the optional
 * peer dependency `@anthropic-ai/sdk` is missing the import will fail with a
 * helpful installation message.
 */

import type { Model, BaseModelConfig } from "@strands-agents/sdk";

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";

export async function buildAnthropicModel(
  apiKey: string,
  modelId?: string,
): Promise<Model<BaseModelConfig>> {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const mod = await import("@strands-agents/sdk/models/anthropic").catch(() => {
    throw new Error("Anthropic support requires: npm install @anthropic-ai/sdk");
  });
  return new mod.AnthropicModel({ apiKey, modelId: modelId ?? DEFAULT_ANTHROPIC_MODEL });
}
