import { configureLogging } from "@strands-agents/sdk";
import type { Logger } from "@strands-agents/sdk";

export type SdkLoggingOption = boolean | Logger;

/**
 * Configures the official Strands SDK logger.
 *
 * - `false` / `undefined`: leave SDK logging untouched
 * - `true`: route SDK logs to `console`
 * - `Logger`: use a custom logger implementation (Pino, Winston, etc.)
 *
 * @see https://strandsagents.com/docs/user-guide/observability-evaluation/logs/
 */
export function configureSdkLogging(logging?: SdkLoggingOption): void {
  if (!logging) return;
  configureLogging(logging === true ? console : logging);
}
