/**
 * Full E2E: trash flow against real Google Photos library.
 * Trashes all selected duplicates then immediately undoes — safe for any account.
 *
 * Prerequisites:
 *   1. `npm run build`
 *   2. Chrome running with --remote-debugging-port=9222, extension loaded,
 *      and logged into Google Photos. (Same Chrome used for chrome-devtools MCP.)
 *   3. Google Photos account must have at least one duplicate set.
 *      (Run the scan test first, or have saved results from a prior scan.)
 *
 * Run: `npm run test:e2e`
 */
import { expect, test, type Page } from "@playwright/test"

import { connectToChrome } from "../fixtures/extension"

test.setTimeout(600_000)

async function expandMoreOptions(page: Page): Promise<void> {
  const albumInput = page.getByRole("combobox", { name: /Library area/i })
  if (await albumInput.isVisible().catch(() => false)) return
  await page.getByRole("button", { name: /Advanced matching/i }).click()
}

async function applyConfiguredScope(page: Page): Promise<void> {
  const albumTitle = process.env.GPD_E2E_ALBUM_TITLE
  const dateFrom = process.env.GPD_E2E_DATE_FROM
  const dateTo = process.env.GPD_E2E_DATE_TO

  await expandMoreOptions(page)

  if (albumTitle) {
    await page.getByRole("combobox", { name: /Library area/i }).click()
    await page
      .getByRole("option", { name: new RegExp(albumTitle, "i") })
      .click()
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  await page.getByLabel("From").fill(dateFrom || today)
  await page.getByLabel("To").fill(dateTo || today)
}

test("trashes duplicates via API and undoes via undo snackbar", async () => {
  test.skip(
    process.env.GPD_E2E_ALLOW_TRASH !== "1",
    "Set GPD_E2E_ALLOW_TRASH=1 to run this live Trash validation."
  )

  const { browser, context, extensionId } = await connectToChrome()
  const gpPage = await context.newPage()
  const appPage = await context.newPage()

  try {
    // Open GP tab
    await gpPage.goto("https://photos.google.com")
    await gpPage.waitForLoadState("networkidle")
    await gpPage.waitForFunction(() => typeof window.gptkApi !== "undefined", {
      timeout: 15_000
    })

    await appPage.goto(`chrome-extension://${extensionId}/tabs/app.html`)

    // Wait for the app to be ready — either fresh connected state or already showing results
    const scanButton = appPage.getByRole("button", {
      name: /Check (entire library|this album|this date range)/i
    })
    const rescanButton = appPage.getByRole("button", { name: /Scan again/i })
    const resultsHeading = appPage.getByText(/Duplicate Sets Ready/)

    await expect(
      scanButton.or(rescanButton).or(resultsHeading).first()
    ).toBeVisible({ timeout: 15_000 })

    // If we have saved results, use them directly; otherwise run a scan
    const hasSavedResults = await resultsHeading.isVisible()
    if (!hasSavedResults) {
      const isFresh = await scanButton.isVisible()
      if (!isFresh) {
        await rescanButton.click()
        await expect(scanButton).toBeVisible({ timeout: 15_000 })
      }
      await applyConfiguredScope(appPage)
      await scanButton.click()
      await expect(appPage.getByText(/photos and videos checked/)).toBeVisible({
        timeout: 300_000
      })
    }

    // Keep the live test conservative: trash only the first visible duplicate set.
    await appPage.getByRole("button", { name: /^Skip all$/i }).click()
    await appPage.locator('input[type="checkbox"]').first().check()

    // Skip gracefully if no duplicates are selected in this account.
    const trashButton = appPage.getByRole("button", {
      name: /Review & move \d+ to Trash/i
    })
    if (!(await trashButton.isEnabled())) {
      test.skip()
      return
    }

    // Record group count before trash
    const groupCountEl = appPage.getByText(/\d+ duplicate sets? to review$/)
    const groupCountBefore = await groupCountEl.textContent()

    const trashButtonText = (await trashButton.textContent()) || ""
    const countMatch = trashButtonText.match(
      /Review\s*&\s*move\s+([\d,]+)\s+to\s+Trash/i
    )
    expect(
      countMatch,
      `Could not parse Trash count from "${trashButtonText}"`
    ).toBeTruthy()
    const trashCount = Number(countMatch![1].replaceAll(",", ""))

    // Confirm the dialog by typing the exact item count.
    await trashButton.click()
    await expect(appPage.getByRole("dialog")).toBeVisible()
    const confirmButton = appPage
      .getByRole("button", { name: /^Move to Trash$/i })
      .last()
    await expect(confirmButton).toBeDisabled()
    await appPage
      .getByLabel(`Type ${trashCount} to confirm`)
      .fill(String(trashCount))
    await expect(confirmButton).toBeEnabled()
    await confirmButton.click()

    // Undo snackbar should appear (API call succeeds)
    await expect(appPage.getByText(/moved to trash/i)).toBeVisible({
      timeout: 30_000
    })

    // Group count should have dropped
    const groupCountAfter = await groupCountEl.textContent()
    expect(groupCountAfter).not.toBe(groupCountBefore)

    // Immediately undo to leave the test account unchanged
    await appPage.getByRole("button", { name: /undo/i }).click()

    // State should restore to pre-trash group count
    await expect(appPage.getByText(groupCountBefore!)).toBeVisible({
      timeout: 30_000
    })
  } finally {
    await gpPage.close()
    await appPage.close()
    // Disconnects Playwright from Chrome without closing the browser
    await browser.close()
  }
})
