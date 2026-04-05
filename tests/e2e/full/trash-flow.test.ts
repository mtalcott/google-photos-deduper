/**
 * Full E2E: trash flow against real Google Photos library.
 * Trashes duplicates then immediately undoes it — safe for any test account.
 *
 * Prerequisites:
 *   1. `npm run build`
 *   2. `npm run auth:export` (generates .gp-auth.json) OR set GP_AUTH_COOKIES env var
 *   3. Google Photos account must have at least one duplicate group
 * Run: `npm run test:e2e`
 */
import { test, expect } from "@playwright/test"
import {
  launchExtension,
  openAppTab,
  injectGpAuth,
  clearStorage,
} from "../fixtures/extension"

test.setTimeout(600_000)

test("trashes duplicates via API and undoes via undo snackbar", async () => {
  const { context, extensionId } = await launchExtension()

  try {
    await injectGpAuth(context)

    // Open GP tab and wait for GPTK
    const gpPage = await context.newPage()
    await gpPage.goto("https://photos.google.com")
    await gpPage.waitForLoadState("networkidle")
    await gpPage.waitForFunction(() => typeof window.gptkApi !== "undefined", {
      timeout: 15_000,
    })

    const appPage = await openAppTab(context, extensionId)

    // Wait for connected state
    const scanButton = appPage.getByRole("button", { name: /scan library/i })
    await expect(scanButton).toBeVisible({ timeout: 15_000 })

    // Use saved results if available (avoids re-scanning), otherwise scan
    const hasSavedResults = await appPage.getByText(/Duplicate Groups Found/).isVisible()
    if (!hasSavedResults) {
      await scanButton.click()
      await expect(appPage.getByText(/items scanned/)).toBeVisible({ timeout: 300_000 })
    }

    // Skip if no duplicates found in this account
    const trashButton = appPage.getByRole("button", { name: /Move .+ Duplicate/i })
    const trashEnabled = await trashButton.isEnabled()
    if (!trashEnabled) {
      test.skip()
      return
    }

    // Record state before trash
    const groupCountEl = appPage.getByText(/\d+ duplicate groups?$/)
    const groupCountBefore = await groupCountEl.textContent()

    // Trash all selected duplicates
    appPage.once("dialog", (dialog) => dialog.accept())
    await trashButton.click()

    // Undo snackbar should appear within 30s (API call time)
    await expect(appPage.getByText(/moved to trash/i)).toBeVisible({ timeout: 30_000 })

    // Group count should have dropped
    const groupCountAfter = await groupCountEl.textContent()
    expect(groupCountAfter).not.toBe(groupCountBefore)

    // Immediately undo to restore the test account
    await appPage.getByRole("button", { name: /undo/i }).click()

    // State should restore to pre-trash group count
    await expect(appPage.getByText(groupCountBefore!)).toBeVisible({ timeout: 30_000 })
  } finally {
    await clearStorage(context)
    await context.close()
  }
})
