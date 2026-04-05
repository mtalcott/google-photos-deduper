// Integration E2E tests — no Google Photos auth required.
// Run: npm run test:integration
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e/integration",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "chromium-extension",
      use: { headless: false },
    },
  ],
})
