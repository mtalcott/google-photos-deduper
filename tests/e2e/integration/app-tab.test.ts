/**
 * Integration E2E tests for the extension app tab.
 * No Google Photos auth required — uses injected mock data.
 *
 * Prerequisites: `npm run build`
 * Run: `npm run test:integration`
 */
import { test, expect, type BrowserContext } from "@playwright/test"
import {
  launchExtension,
  openAppTab,
  injectScanResults,
  clearStorage,
} from "../fixtures/extension"

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  ;({ context, extensionId } = await launchExtension())
})

test.afterAll(async () => {
  await context.close()
})

// ============================================================

test("restores saved scan results from storage on load", async () => {
  await injectScanResults(
    context,
    [
      { id: "g1", mediaKeys: ["key1", "key2"], originalMediaKey: "key1", similarity: 0.99 },
      { id: "g2", mediaKeys: ["key3", "key4"], originalMediaKey: "key3", similarity: 0.98 },
    ],
    {
      key1: { mediaKey: "key1", dedupKey: "d1", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo1.jpg" },
      key2: { mediaKey: "key2", dedupKey: "d2", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo2.jpg" },
      key3: { mediaKey: "key3", dedupKey: "d3", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo3.jpg" },
      key4: { mediaKey: "key4", dedupKey: "d4", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo4.jpg" },
    },
    4
  )

  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("2 Duplicate Groups Found")).toBeVisible({ timeout: 5000 })
  await expect(page.getByText("4 items scanned")).toBeVisible()
  await expect(page.getByText("2 duplicate groups", { exact: true }).first()).toBeVisible()

  await page.close()
  await clearStorage(context)
})

test("shows 'no duplicates found' when scan returns zero groups", async () => {
  await injectScanResults(context, [], {}, 500)

  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("No duplicates found in your library.")).toBeVisible({ timeout: 5000 })

  await page.close()
  await clearStorage(context)
})

test("shows disconnected state when GP tab is not open and no saved results", async () => {
  await clearStorage(context)

  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByText(/Cannot connect to Google Photos|open photos\.google\.com/i)
  ).toBeVisible({ timeout: 8000 })

  await page.close()
})
