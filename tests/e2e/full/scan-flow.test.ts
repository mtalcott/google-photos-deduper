/**
 * Full E2E: scan flow against real Google Photos library.
 *
 * Prerequisites:
 *   1. `npm run build`
 *   2. `npm run auth:export` (generates .gp-auth.json) OR set GP_AUTH_COOKIES env var
 * Run: `npm run test:e2e`
 */
import { test, expect } from "@playwright/test"
import {
  launchExtension,
  openAppTab,
  injectGpAuth,
  clearStorage,
} from "../fixtures/extension"

// Generous timeout — real libraries with many items can take several minutes
test.setTimeout(600_000)

test("connects to Google Photos and enters scanning state", async () => {
  const { context, extensionId } = await launchExtension()

  try {
    await injectGpAuth(context)

    // Open GP tab and wait for GPTK injection
    const gpPage = await context.newPage()
    await gpPage.goto("https://photos.google.com")
    await gpPage.waitForLoadState("networkidle")
    await gpPage.waitForFunction(() => typeof window.gptkApi !== "undefined", {
      timeout: 15_000,
    })

    const appPage = await openAppTab(context, extensionId)

    // App should reach connected state (GP tab found + GPTK loaded)
    await expect(
      appPage.getByRole("button", { name: /scan library/i })
    ).toBeVisible({ timeout: 15_000 })

    await appPage.getByRole("button", { name: /scan library/i }).click()

    // Scanning progress should appear
    await expect(appPage.getByText(/fetching/i)).toBeVisible({ timeout: 10_000 })

    // Wait for scan to complete
    await expect(appPage.getByText(/items scanned/)).toBeVisible({ timeout: 300_000 })

    // Results or no-duplicates state should render
    const hasDuplicates = await appPage.getByText(/Duplicate Groups Found/).isVisible()
    const hasNoDuplicates = await appPage
      .getByText("No duplicates found in your library.")
      .isVisible()

    expect(hasDuplicates || hasNoDuplicates).toBe(true)
  } finally {
    await context.close()
  }
})
