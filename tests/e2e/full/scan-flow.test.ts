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
import { expect, test, type Page } from "@playwright/test"

import { clearStorage, connectToChrome } from "../fixtures/extension"

test.setTimeout(600_000)

async function expandMoreOptions(page: Page): Promise<void> {
  const albumInput = page.getByRole("combobox", { name: /Library area/i })
  if (await albumInput.isVisible().catch(() => false)) return
  await page.getByRole("button", { name: /Advanced matching/i }).click()
}

async function applyConfiguredScope(page: Page): Promise<string> {
  const albumTitle = process.env.GPD_E2E_ALBUM_TITLE
  const dateFrom = process.env.GPD_E2E_DATE_FROM
  const dateTo = process.env.GPD_E2E_DATE_TO

  await expandMoreOptions(page)

  if (albumTitle) {
    await page.getByRole("combobox", { name: /Library area/i }).click()
    await page
      .getByRole("option", { name: new RegExp(albumTitle, "i") })
      .click()
    return `album:${albumTitle}`
  }

  if (dateFrom || dateTo) {
    if (dateFrom) await page.getByLabel("From").fill(dateFrom)
    if (dateTo) await page.getByLabel("To").fill(dateTo)
    return `date:${dateFrom || "start"}..${dateTo || "end"}`
  }

  const today = new Date().toISOString().slice(0, 10)
  await page.getByLabel("From").fill(today)
  await page.getByLabel("To").fill(today)
  return `date:${today}..${today}`
}

async function waitForGooglePhotosApp(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded")
  const currentUrl = page.url()
  const host = new URL(currentUrl).hostname
  if (host !== "photos.google.com") {
    throw new Error(
      `Google Photos app did not load. Current URL is ${currentUrl}. ` +
        "Open this profile in Chrome, sign into Google Photos, then rerun the live e2e."
    )
  }
}

async function waitForGptkInjection(page: Page): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const injected = await page
      .evaluate(() => typeof window.gptkApi !== "undefined")
      .catch(() => false)
    if (injected) return
    await page.waitForTimeout(250)
  }

  throw new Error(
    `Google Photos Toolkit did not inject into ${page.url()}. ` +
      "Confirm the extension is loaded and the page is the Google Photos app."
  )
}

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
    await waitForGooglePhotosApp(gpPage)
    await waitForGptkInjection(gpPage)

    // Open the app tab
    await appPage.goto(`chrome-extension://${extensionId}/tabs/app.html`)

    // Wait for the app to be ready — either fresh or with saved results.
    const scanButton = appPage.getByRole("button", {
      name: /Check (entire library|this album|this date range)/i
    })
    const rescanButton = appPage.getByRole("button", { name: "Scan again" })

    await expect(scanButton.or(rescanButton)).toBeVisible({ timeout: 15_000 })

    if (await rescanButton.isVisible()) {
      await rescanButton.click()
    }

    await expect(scanButton).toBeVisible({ timeout: 15_000 })

    const scope = await applyConfiguredScope(appPage)
    test.info().annotations.push({
      type: "live-scope",
      description: scope
    })

    await scanButton.click()

    // Scanning progress should appear
    await expect(appPage.getByText(/Reading your library/i)).toBeVisible({
      timeout: 10_000
    })

    // Wait for scan to complete (real libraries can take minutes)
    await expect(appPage.getByText(/photos and videos checked/)).toBeVisible({
      timeout: 300_000
    })

    // Should show either results or no-duplicates state
    const hasDuplicates = await appPage
      .getByText(/Duplicate Sets Ready/)
      .isVisible()
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
