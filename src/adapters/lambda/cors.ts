/**
 * Resolves the request origin against the allowed origins list.
 *
 * Returns the origin to reflect back in `Access-Control-Allow-Origin` when
 * it is in the allowed list (or `*` is present), or an empty string when the
 * origin is not allowed.
 */
export function resolveCorsOrigin(allowedOrigins: string[], origin: string): string {
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return origin || "*";
  }
  return "";
}

/**
 * Builds the CORS response headers for a Lambda response.
 * When `corsOrigin` is empty (origin not allowed) the ACAO header is omitted.
 */
export function buildCorsHeaders(corsOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
  };
}
