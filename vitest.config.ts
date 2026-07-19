import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Alias workspace packages to their source so tests run without a build step.
export default defineConfig({
  resolve: {
    alias: {
      "@stampdraft/schema": r("./packages/schema/src/index.ts"),
      "@stampdraft/engine": r("./packages/engine/src/index.ts"),
      "@stampdraft/store": r("./packages/store/src/index.ts"),
    },
  },
  test: {
    globals: false,
    include: ["packages/**/*.test.ts", "scripts/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
    environment: "node",
  },
});
