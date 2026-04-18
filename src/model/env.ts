/**
 * API-key resolution.
 *
 * Priority: explicit configKey → well-known process.env var → empty string.
 * Reads process.env lazily (at call time) so tests can override env vars.
 */

import type { AgentProvider } from "./types.js";

export const PROVIDER_ENV_VARS: Partial<Record<AgentProvider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function resolveApiKey(provider: AgentProvider, configKey: string): string {
  if (configKey) return configKey;
  const envVar = PROVIDER_ENV_VARS[provider];
  return envVar ? (process.env[envVar] ?? "") : "";
}
