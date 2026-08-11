import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./src"),
      // See src/test/server-only-stub.ts.
      "server-only": here("./src/test/server-only-stub.ts"),
    },
  },
  test: {
    setupFiles: [here("./src/test/setup.ts")],
    // The live tests call Gemini and Supabase; a batch of page images is slow.
    testTimeout: 120_000,
  },
});
