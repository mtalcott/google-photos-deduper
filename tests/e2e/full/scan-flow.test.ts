/**
 * Full E2E: scan flow against real Google Photos library.
 *
 * Runs inside an already-running Chrome instance via CDP — no session transfer,
 * no Google auth invalidation.
 *
 * Prerequisites:
 *   1. `npm run build`
 *   2. Chrome running with --remote-debugging-port=9222, extension loaded,
 *      and logged into Google Photos. (Same Chrome used for chrome-devtools MCP.)
 *
 * Run: `npm run test:e2e`
 */
import { test, expect } from "@playwright/test"
import { connectToChrome, clearStorage } from "../fixtures/extension"

test.setTimeout(600_000)

test("connects to Google Photos and completes a scan", async () => {
  const { browser, context, extensionId } = await connectToChrome()
  const gpPage = await context.newPage()
  const appPage = await context.newPage()

  try {
    // Try to clear cached results so we exercise the full scan path.
    // clearStorage is best-effort — silently skipped if no SW available via CDP.
    await clearStorage(context)

    // Load Google Photos — must be open for the service worker to find the GP tab
    await gpPage.goto("https://photos.google.com")
    await gpPage.waitForLoadState("networkidle")

    // Wait for GPTK to inject
    await gpPage.waitForFunction(() => typeof window.gptkApi !== "undefined", {
      timeout: 15_000,
    })

    // Open the app tab
    await appPage.goto(`chrome-extension://${extensionId}/tabs/app.html`)

    // Wait for the app to be ready — either fresh (Scan Library) or with saved results (Re-scan)
    const scanButton = appPage.getByRole("button", { name: "Scan Library" })
    const rescanButton = appPage.getByRole("button", { name: "Re-scan" })

    await expect(scanButton.or(rescanButton)).toBeVisible({ timeout: 15_000 })

    // Click whichever button is visible to trigger a scan
    const isFresh = await scanButton.isVisible()
    if (isFresh) {
      await scanButton.click()
    } else {
      await rescanButton.click()
    }

    // Scanning progress should appear
    await expect(appPage.getByText(/fetching/i)).toBeVisible({ timeout: 10_000 })

    // Wait for scan to complete (real libraries can take minutes)
    await expect(appPage.getByText(/items scanned/)).toBeVisible({ timeout: 300_000 })

    // Should show either results or no-duplicates state
    const hasDuplicates = await appPage.getByText(/Duplicate Groups Found/).isVisible()
    const hasNoDuplicates = await appPage
      .getByText("No duplicates found in your library.")
      .isVisible()
    expect(hasDuplicates || hasNoDuplicates).toBe(true)
  } finally {
    await gpPage.close()
    await appPage.close()
    await browser.close()
  }
})
