/**
 * LLM model factory.
 *
 * Resolves the API key for the requested provider, then delegates to the
 * provider-specific builder. All provider SDK packages are lazily imported
 * so only the provider you actually use pays the startup cost.
 *
 * Supported providers: openai | anthropic | bedrock | gemini | ollama
 */

import type { Model, BaseModelConfig } from "@strands-agents/sdk";
import type { AgentProvider } from "./types.js";
import { resolveApiKey } from "./env.js";
import { buildOpenAIModel } from "./providers/openai.js";
import { buildAnthropicModel } from "./providers/anthropic.js";
import { buildBedrockModel } from "./providers/bedrock.js";
import { buildGeminiModel } from "./providers/gemini.js";
import { buildOllamaModel } from "./providers/ollama.js";

export type { AgentProvider } from "./types.js";
export { resolveApiKey } from "./env.js";

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export async function buildModel(
  provider: AgentProvider,
  configKey: string,
  modelId?: string,
): Promise<Model<BaseModelConfig>> {
  const apiKey = resolveApiKey(provider, configKey);

  switch (provider) {
    case "openai":
      return buildOpenAIModel(apiKey, modelId);
    case "anthropic":
      return buildAnthropicModel(apiKey, modelId);
    case "bedrock":
      return buildBedrockModel(modelId);
    case "gemini":
      return buildGeminiModel(apiKey, modelId);
    case "ollama":
      return buildOllamaModel();
    default: {
      const _exhaustive: never = provider;
      throw new Error(
        `Unsupported provider: '${_exhaustive}'. Supported: openai, anthropic, bedrock, gemini.`,
      );
    }
  }
}
