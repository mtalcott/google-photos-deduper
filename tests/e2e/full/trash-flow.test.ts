/**
 * Full E2E: trash flow against real Google Photos library.
 * Trashes all selected duplicates then immediately undoes — safe for any account.
 *
 * Prerequisites:
 *   1. `npm run build`
 *   2. Chrome running with --remote-debugging-port=9222, extension loaded,
 *      and logged into Google Photos. (Same Chrome used for chrome-devtools MCP.)
 *   3. Google Photos account must have at least one duplicate group.
 *      (Run the scan test first, or have saved results from a prior scan.)
 *
 * Run: `npm run test:e2e`
 */
import { test, expect } from "@playwright/test"
import {
  connectToChrome,
} from "../fixtures/extension"

test.setTimeout(600_000)

test("trashes duplicates via API and undoes via undo snackbar", async () => {
  const { browser, context, extensionId } = await connectToChrome()
  const gpPage = await context.newPage()
  const appPage = await context.newPage()

  try {
    // Open GP tab
    await gpPage.goto("https://photos.google.com")
    await gpPage.waitForLoadState("networkidle")
    await gpPage.waitForFunction(() => typeof window.gptkApi !== "undefined", {
      timeout: 15_000,
    })

    await appPage.goto(`chrome-extension://${extensionId}/tabs/app.html`)

    // Wait for the app to be ready — either fresh connected state or already showing results
    const scanButton = appPage.getByRole("button", { name: /scan library/i })
    const rescanButton = appPage.getByRole("button", { name: /re-scan/i })
    const resultsHeading = appPage.getByText(/Duplicate Groups Found/)

    await expect(
      scanButton.or(rescanButton).or(resultsHeading).first()
    ).toBeVisible({ timeout: 15_000 })

    // If we have saved results, use them directly; otherwise run a scan
    const hasSavedResults = await resultsHeading.isVisible()
    if (!hasSavedResults) {
      const isFresh = await scanButton.isVisible()
      await (isFresh ? scanButton : rescanButton).click()
      await expect(appPage.getByText(/items scanned/)).toBeVisible({ timeout: 300_000 })
    }

    // Skip gracefully if no duplicates in this account
    const trashButton = appPage.getByRole("button", { name: /Move .+ Duplicate/i })
    if (!(await trashButton.isEnabled())) {
      test.skip()
      return
    }

    // Record group count before trash
    const groupCountEl = appPage.getByText(/\d+ duplicate groups?$/)
    const groupCountBefore = await groupCountEl.textContent()

    // Confirm the dialog and trash
    appPage.once("dialog", (dialog) => dialog.accept())
    await trashButton.click()

    // Undo snackbar should appear (API call succeeds)
    await expect(appPage.getByText(/moved to trash/i)).toBeVisible({ timeout: 30_000 })

    // Group count should have dropped
    const groupCountAfter = await groupCountEl.textContent()
    expect(groupCountAfter).not.toBe(groupCountBefore)

    // Immediately undo to leave the test account unchanged
    await appPage.getByRole("button", { name: /undo/i }).click()

    // State should restore to pre-trash group count
    await expect(appPage.getByText(groupCountBefore!)).toBeVisible({ timeout: 30_000 })
  } finally {
    await gpPage.close()
    await appPage.close()
    // Disconnects Playwright from Chrome without closing the browser
    await browser.close()
  }
})
