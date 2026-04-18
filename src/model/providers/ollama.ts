/**
 * Provider: Ollama
 *
 * Not yet available in the TypeScript Strands SDK. Throws a clear error
 * directing users to supported providers.
 */

export function buildOllamaModel(): never {
  throw new Error(
    "Ollama provider is not yet available in the TypeScript SDK. Use openai, anthropic, bedrock, or gemini.",
  );
}
