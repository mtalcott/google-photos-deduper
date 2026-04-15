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
  injectSelections,
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

// ============================================================
// Selection persistence
// ============================================================

const BASE_MEDIA_ITEMS = {
  key1: { mediaKey: "key1", dedupKey: "d1", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo1.jpg" },
  key2: { mediaKey: "key2", dedupKey: "d2", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo2.jpg" },
  key3: { mediaKey: "key3", dedupKey: "d3", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo3.jpg" },
  key4: { mediaKey: "key4", dedupKey: "d4", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo4.jpg" },
  key5: { mediaKey: "key5", dedupKey: "d5", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo5.jpg" },
  key6: { mediaKey: "key6", dedupKey: "d6", thumb: "", timestamp: 0, creationTimestamp: 0, resWidth: 100, resHeight: 100, duration: null, isOwned: true, fileName: "photo6.jpg" },
}

test("persists group selections through page reload", async () => {
  // 3 groups; only g1 and g3 are selected (g2 is deselected)
  await injectScanResults(
    context,
    [
      { id: "g1", mediaKeys: ["key1", "key2"], originalMediaKey: "key1", similarity: 0.99 },
      { id: "g2", mediaKeys: ["key3", "key4"], originalMediaKey: "key3", similarity: 0.98 },
      { id: "g3", mediaKeys: ["key5", "key6"], originalMediaKey: "key5", similarity: 0.97 },
    ],
    BASE_MEDIA_ITEMS,
    6
  )
  await injectSelections(context, ["g1", "g3"], {})

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 5000 })

  const checkboxes = page.locator('input[type="checkbox"]')
  await expect(checkboxes.nth(0)).toBeChecked()          // g1 selected
  await expect(checkboxes.nth(1)).not.toBeChecked()      // g2 deselected
  await expect(checkboxes.nth(2)).toBeChecked()          // g3 selected

  await page.reload()
  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 5000 })
  await expect(checkboxes.nth(0)).toBeChecked()
  await expect(checkboxes.nth(1)).not.toBeChecked()
  await expect(checkboxes.nth(2)).toBeChecked()

  await page.close()
  await clearStorage(context)
})

test("persists kept overrides through page reload", async () => {
  // g1 has 2 items; default keep is key1 but we override to keep key2 instead
  await injectScanResults(
    context,
    [
      { id: "g1", mediaKeys: ["key1", "key2"], originalMediaKey: "key1", similarity: 0.99 },
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2
  )
  await injectSelections(context, ["g1"], { g1: ["key2"] })

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("1 Duplicate Group Found")).toBeVisible({ timeout: 5000 })

  // key2 (second card) should have the Keep chip; key1 (first card) should not
  const cards = page.locator('.MuiCard-root')
  await expect(cards.nth(0)).not.toContainText("Keep")  // key1 — not kept
  await expect(cards.nth(1)).toContainText("Keep")      // key2 — kept

  await page.reload()
  await expect(page.getByText("1 Duplicate Group Found")).toBeVisible({ timeout: 5000 })
  await expect(cards.nth(0)).not.toContainText("Keep")
  await expect(cards.nth(1)).toContainText("Keep")

  await page.close()
  await clearStorage(context)
})
