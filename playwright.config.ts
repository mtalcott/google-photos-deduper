import { defineConfig } from "@playwright/test"
import path from "path"

const extensionPath = path.resolve(__dirname, "build/chrome-mv3-dev")

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    // Chromium launched with the unpacked extension loaded
    // Note: headed mode is required for extensions in Playwright
    headless: false,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        // Playwright's launchOptions for loading an unpacked extension
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            "--no-sandbox",
          ],
          headless: false,
        },
      },
    },
  ],
})
