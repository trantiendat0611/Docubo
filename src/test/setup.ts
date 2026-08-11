import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load .env for tests.
 *
 * Next.js does this itself at runtime, so nothing in src/ carries a loader.
 * Vitest runs outside Next, and the live ingest tests need real credentials —
 * a five-line parser is cheaper than another dependency.
 *
 * Values already present in the environment win, so CI placeholders are not
 * overwritten by a stray local file.
 */
const envPath = join(process.cwd(), ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
