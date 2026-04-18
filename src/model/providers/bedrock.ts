/**
 * Provider: Amazon Bedrock
 *
 * Uses AWS SDK credentials from the environment (no explicit API key needed).
 * Lazily imports `BedrockModel` from the main `@strands-agents/sdk` entry.
 */

import type { Model, BaseModelConfig } from "@strands-agents/sdk";

export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-3-5-sonnet-20241022-v2:0";

export async function buildBedrockModel(modelId?: string): Promise<Model<BaseModelConfig>> {
  const { BedrockModel } = await import("@strands-agents/sdk");
  return new BedrockModel({ modelId: modelId ?? DEFAULT_BEDROCK_MODEL });
}
