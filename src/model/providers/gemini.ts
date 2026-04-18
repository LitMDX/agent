/**
 * Provider: Google Gemini
 *
 * Lazily imports `@strands-agents/sdk/models/google`. If the optional peer
 * dependency `@google/generative-ai` is missing the import will fail with a
 * helpful installation message.
 */

import type { Model, BaseModelConfig } from "@strands-agents/sdk";

export const DEFAULT_GEMINI_MODEL = "gemini-1.5-pro";

export async function buildGeminiModel(
  apiKey: string,
  modelId?: string,
): Promise<Model<BaseModelConfig>> {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const { GoogleModel } = await import("@strands-agents/sdk/models/google").catch(() => {
    throw new Error("Gemini support requires: npm install @google/generative-ai");
  });
  return new GoogleModel({ apiKey, modelId: modelId ?? DEFAULT_GEMINI_MODEL });
}
