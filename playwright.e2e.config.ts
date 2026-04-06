// Full E2E tests — requires Google Photos auth (GP_AUTH_COOKIES or .gp-auth.json).
// Run: npm run test:e2e
// Setup: npm run auth:export
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e/full",
  // Generous timeout: real library scans can take several minutes
  timeout: 600_000,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "chromium-extension",
      use: { headless: false },
    },
  ],
})
