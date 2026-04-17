import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "tests/perf/**"],
  },
  benchmark: {
    include: ["tests/perf/**/*.bench.ts?(x)"],
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "."),
    },
  },
})
