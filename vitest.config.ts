import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Behaviour cases are run by `claude plugin eval`, not by vitest.
    exclude: ["**/node_modules/**", "tests/skills/**/behaviour/**"],
  },
  resolve: {
    alias: { "@testkit": resolve(import.meta.dirname, "scripts/testkit") },
  },
});
