/**
 * E2E tests for the extension app tab.
 *
 * These tests load the actual built extension in Chromium, inject mock data
 * into chrome.storage.local where needed, and verify UI behaviour.
 *
 * Prerequisites:
 *   1. Run `npm run build` first to populate build/chrome-mv3-dev/
 *   2. Run via `npm run test:e2e`
 *
 * Tests that require real Google Photos authentication are marked with
 * `test.skip` — run them manually by removing the skip.
 */
import { test, expect, chromium, type BrowserContext } from "@playwright/test"
import path from "path"

const extensionPath = path.resolve(__dirname, "../../build/chrome-mv3-dev")

// ============================================================
// Fixture: launch Chromium with the extension loaded
// ============================================================

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
    ],
  })

  // Wait for the service worker to register and grab the extension ID
  let sw = context.serviceWorkers()[0]
  if (!sw) {
    sw = await context.waitForEvent("serviceworker")
  }
  extensionId = new URL(sw.url()).hostname
})

test.afterAll(async () => {
  await context.close()
})

// Helper: open the app tab
async function openAppTab() {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/tabs/app.html`)
  return page
}

// Helper: inject mock scan results into extension storage via the service worker
async function injectScanResults(
  groups: object[],
  mediaItems: Record<string, object>,
  totalItems: number
) {
  // Use the background service worker to write to chrome.storage.local
  const sw = context.serviceWorkers()[0]
  await sw.evaluate(
    ({ groups, mediaItems, totalItems }) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            scanResults: {
              groups,
              mediaItems,
              totalItems,
              scanDate: Date.now(),
            },
          },
          resolve
        )
      })
    },
    { groups, mediaItems, totalItems }
  )
}

async function clearStorage() {
  const sw = context.serviceWorkers()[0]
  await sw.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.clear(resolve)
    })
  })
}

// ============================================================
// Test: saved results restore (no GP auth required)
// ============================================================

test("restores saved scan results from storage on load", async () => {
  const mockGroups = [
    {
      id: "g1",
      mediaKeys: ["key1", "key2"],
      originalMediaKey: "key1",
      similarity: 0.99,
    },
    {
      id: "g2",
      mediaKeys: ["key3", "key4"],
      originalMediaKey: "key3",
      similarity: 0.98,
    },
  ]
  const mockMediaItems = {
    key1: { mediaKey: "key1", dedupKey: "d1", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo1.jpg" },
    key2: { mediaKey: "key2", dedupKey: "d2", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo2.jpg" },
    key3: { mediaKey: "key3", dedupKey: "d3", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo3.jpg" },
    key4: { mediaKey: "key4", dedupKey: "d4", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo4.jpg" },
  }

  await injectScanResults(mockGroups, mockMediaItems, 4)

  const page = await openAppTab()

  // App should show results without scanning (restored from storage)
  await expect(page.getByText("2 Duplicate Groups Found")).toBeVisible({ timeout: 5000 })
  await expect(page.getByText("4 items scanned")).toBeVisible()
  // ActionBar stat — use exact text to avoid matching the heading too
  await expect(page.getByText("2 duplicate groups", { exact: true }).first()).toBeVisible()

  await page.close()
  await clearStorage()
})

// ============================================================
// Test: empty state (no duplicates found)
// ============================================================

test("shows 'no duplicates found' state when scan returns zero groups", async () => {
  // Inject a completed scan with totalItems but no groups
  await injectScanResults([], {}, 500)

  const page = await openAppTab()

  await expect(page.getByText("No duplicates found in your library.")).toBeVisible({ timeout: 5000 })

  await page.close()
  await clearStorage()
})

// ============================================================
// Test: connecting state (GP tab not open)
// ============================================================

test("shows disconnected state when Google Photos tab is not open and no saved results", async () => {
  // Clear storage so there are no saved results to fall back to.
  // With no results and no GP tab, app should show the disconnected/error state.
  await clearStorage()

  const page = await openAppTab()

  // Should show the error state (no GP tab + no saved results)
  await expect(
    page.getByText(/Cannot connect to Google Photos|open photos\.google\.com/i)
  ).toBeVisible({ timeout: 8000 })

  await page.close()
})

// ============================================================
// Tests requiring real Google Photos auth — skipped in CI
// ============================================================

test.skip("full scan flow: fetches items and shows duplicate groups", async () => {
  // Prerequisites: user must be logged into Google Photos in this browser profile
  // Run manually: remove test.skip and run npm run test:e2e
  const gpPage = await context.newPage()
  await gpPage.goto("https://photos.google.com")
  await gpPage.waitForLoadState("networkidle")

  const appPage = await openAppTab()

  // Wait for connected state
  await expect(appPage.getByRole("button", { name: /scan/i })).toBeVisible({
    timeout: 10_000,
  })

  await appPage.getByRole("button", { name: /scan/i }).click()

  // Should enter scanning state
  await expect(appPage.getByText(/fetching|computing/i)).toBeVisible({ timeout: 5000 })

  await gpPage.close()
  await appPage.close()
})

test.skip("trash flow: moves duplicate to trash and decrements group count", async () => {
  // Prerequisites: user must be logged in and have existing scan results with duplicates
  const page = await openAppTab()

  await expect(page.getByText(/Duplicate Groups Found/)).toBeVisible({ timeout: 5000 })

  const groupCountBefore = await page.getByText(/duplicate groups?$/).textContent()

  // Click "Move N Duplicates to Trash"
  await page.getByRole("button", { name: /Move .+ Duplicate/i }).click()

  // Handle the confirm dialog
  page.on("dialog", (dialog) => dialog.accept())

  // Wait for undo snackbar to appear
  await expect(page.getByText(/moved to trash/i)).toBeVisible({ timeout: 10_000 })

  // Group count should have decreased
  const groupCountAfter = await page.getByText(/duplicate groups?$/).textContent()
  expect(groupCountAfter).not.toBe(groupCountBefore)

  await page.close()
})
