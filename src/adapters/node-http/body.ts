import type http from "node:http";

/**
 * Reads and JSON-parses the body of an incoming Node.js HTTP request.
 * Returns an empty object on empty or missing body.
 * Rejects with an `Error` when the body is not valid JSON.
 */
export function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
