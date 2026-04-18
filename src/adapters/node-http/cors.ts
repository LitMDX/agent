import type http from "node:http";

/** Dev origins always included in the allowed list. */
export const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/**
 * Applies CORS headers to a Node.js `ServerResponse`.
 * Reflects the request origin when it is in the allowed list (or `*` is present).
 */
export function applyCors(
  res: http.ServerResponse,
  allowedOrigins: string[],
  origin: string,
): void {
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
