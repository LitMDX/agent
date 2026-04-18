/**
 * File-system walker.
 *
 * Yields absolute paths of every `.mdx` / `.md` file found under `dir`,
 * recursing into sub-directories.
 */

import fs from "node:fs";
import path from "node:path";

export function* walkMdx(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMdx(fullPath);
    } else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
      yield fullPath;
    }
  }
}
