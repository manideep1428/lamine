import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Default to node. Files that need a DOM opt in with
    // `// @vitest-environment jsdom` at the top.
    environment: "node",
    include: ["{lib,components,convex}/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/core/**", "lib/*.ts", "components/blocks/**"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
})
