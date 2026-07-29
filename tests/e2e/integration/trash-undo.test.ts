/**
 * Trash & Undo integration tests.
 *
 * Covers the app-tab UI layer for the full trash/restore workflow using a real
 * Playwright-launched extension and the GPTK stub page. No Google auth required.
 *
 * The GPTK command layer (chunking, progress) is already unit-tested in
 * tests/commands/google-photos-commands.test.ts — these tests focus on the
 * UI integration: button → confirm dialog → progress display → snackbar → undo.
 *
 * Run via: npm run test:integration
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test"

import {
  clearStorage,
  injectEntitlement,
  injectScanResults,
  launchExtension,
  makeGroups,
  openAppTab,
  openGptkStubPage
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
// Test data helpers
// ============================================================

/**
 * Standard small dataset: 3 groups x 2 items each -> 3 dedupKeys to trash.
 * Small enough to fit in a single 25-item trash batch.
 */
function smallPayload() {
  return makeGroups(3, 2)
}

async function confirmTrashDialog(page: Page, count: number): Promise<void> {
  const confirmButton = page
    .getByRole("button", { name: /^Move to Trash$/i })
    .last()
  await expect(confirmButton).toBeDisabled()
  await page.getByLabel(`Type ${count} to confirm`).fill(String(count))
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()
}

async function includeAllAndOpenTrashDialog(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^Include all(?: sets)?$/i })
    .click()
  await page
    .getByRole("button", { name: /Review & move \d+ to Trash/i })
    .click()
}

// ============================================================
// Trash: baseline (< 25 items, single batch)
// ============================================================

test("trashes selected groups and removes them from the UI", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  // App should load results from storage (no GP auth needed for results view)
  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  // Click the count-aware cleanup action below the duplicate review.
  await includeAllAndOpenTrashDialog(page)

  // Confirm dialog appears
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Move to Trash" })
  ).toBeVisible()

  // Confirm by typing the exact item count
  await confirmTrashDialog(page, 3)

  // Undo snackbar should appear (trash complete)
  await expect(page.getByText(/moved to trash/i)).toBeVisible({
    timeout: 10_000
  })

  // Review list should no longer show duplicate sets
  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).not.toBeVisible()

  const sw = context.serviceWorkers()[0]
  const reports = await sw.evaluate(
    () =>
      new Promise<any[]>((resolve) => {
        chrome.storage.local.get("trashResultReports", (result) => {
          resolve((result.trashResultReports as any[]) || [])
        })
      })
  )
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({
    status: "complete",
    attemptedCount: 3,
    movedCount: 3,
    movedDedupKeys: [
      "dedup-group0-item1",
      "dedup-group1-item1",
      "dedup-group2-item1"
    ]
  })

  await stub.close()
  await page.close()
})

test("free Trash cap is cumulative across the cleanup session", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = makeGroups(2, 2)
  groups[0].mediaKeys = Array.from({ length: 11 }, (_, i) => `cap-group0-item${i}`)
  for (let i = 0; i < 11; i++) {
    const key = `cap-group0-item${i}`
    mediaItems[key] = {
      mediaKey: key,
      dedupKey: `dedup-${key}`,
      thumb: "",
      productUrl: `https://photos.google.com/photo/${key}`,
      timestamp: 1_600_000_000_000 + i,
      creationTimestamp: 1_700_000_000_000 + i,
      resWidth: 1920,
      resHeight: 1080,
      fileName: `photo-${key}.jpg`,
      isOwned: true
    }
  }
  groups[0].originalMediaKey = "cap-group0-item0"

  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "2 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await page.getByRole("button", { name: "Skip all" }).click()
  await page.locator('input[type="checkbox"]').first().click()
  await page
    .getByRole("button", { name: /Review & move \d+ to Trash/i })
    .click()
  await confirmTrashDialog(page, 10)
  await expect(page.getByText(/moved to trash/i)).toBeVisible({
    timeout: 10_000
  })

  await page
    .getByRole("button", { name: /^Include all(?: sets)?$/i })
    .click()
  await page
    .getByRole("button", { name: /Review & move \d+ to Trash/i })
    .click()

  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(
    page.getByText(/You have 0 remaining and selected 1/i)
  ).toBeVisible()
  await expect(page.getByLabel("Type 1 to confirm")).not.toBeVisible()

  await stub.close()
  await page.close()
})

// ============================================================
// Trash: multi-batch (> 25 items)
// ============================================================

test("shows trashing state for multi-batch trash (> 25 items)", async () => {
  await clearStorage(context)
  await injectEntitlement(context, "lifetime")

  // 3 groups x 101 items -> 300 dedupKeys to trash across multiple 25-item batches
  const { groups, mediaItems } = makeGroups(3, 101)
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await includeAllAndOpenTrashDialog(page)
  await expect(page.getByRole("dialog")).toBeVisible()
  await confirmTrashDialog(page, 300)

  // After all batches complete: undo snackbar appears
  await expect(page.getByText(/moved to trash/i)).toBeVisible({
    timeout: 15_000
  })

  // Groups should be gone
  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).not.toBeVisible()

  await stub.close()
  await page.close()
})

// ============================================================
// Undo: baseline restore
// ============================================================

test("undo restores all groups to the UI", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  // Trash all groups
  await includeAllAndOpenTrashDialog(page)
  await confirmTrashDialog(page, 3)
  await expect(page.getByText(/moved to trash/i)).toBeVisible({
    timeout: 10_000
  })

  // Click Undo in the snackbar
  await page.getByRole("button", { name: /undo/i }).click()

  // All 3 groups should be restored
  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 10_000
  })

  // Undo snackbar should be dismissed
  await expect(page.getByText(/moved to trash/i)).not.toBeVisible()

  await stub.close()
  await page.close()
})

// ============================================================
// Undo: multi-batch restore
// ============================================================

test("undo after multi-batch trash restores all groups", async () => {
  await clearStorage(context)
  await injectEntitlement(context, "lifetime")

  const { groups, mediaItems } = makeGroups(3, 101) // 303 dedupKeys
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await includeAllAndOpenTrashDialog(page)
  await confirmTrashDialog(page, 300)
  await expect(page.getByText(/moved to trash/i)).toBeVisible({
    timeout: 15_000
  })

  await page.getByRole("button", { name: /undo/i }).click()

  // Pre-trash state fully restored
  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 10_000
  })

  await stub.close()
  await page.close()
})

test("shows a retryable warning when restore undo fails", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context, {
    restoreItems: { success: false, error: "HTTP 504 restore failed" }
  })
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await includeAllAndOpenTrashDialog(page)
  await confirmTrashDialog(page, 3)
  await expect(page.getByText(/moved to trash/i)).toBeVisible({
    timeout: 10_000
  })

  await page.getByRole("button", { name: /^Undo$/i }).click()

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 10_000
  })
  await expect(
    page.getByText(/Restore failed: HTTP 504 restore failed/i)
  ).toBeVisible({
    timeout: 10_000
  })
  await expect(
    page.getByRole("button", { name: /Undo moved items/i })
  ).toBeVisible()

  await stub.close()
  await page.close()
})

// ============================================================
// Error: trash API failure
// ============================================================

test("shows error state when trashItems fails", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  // Configure stub to return failure for trashItems
  const stub = await openGptkStubPage(context, {
    trashItems: { success: false, error: "HTTP 504" }
  })
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await includeAllAndOpenTrashDialog(page)
  await confirmTrashDialog(page, 3)

  // TRASH_ERROR dispatches { status: "disconnected", error: "HTTP 504" }.
  // The disconnected state shows the error string in an Alert and a "Retry Connection" button.
  await expect(
    page.getByRole("button", { name: /Retry Connection/i })
  ).toBeVisible({ timeout: 10_000 })
  // The raw error from the stub is surfaced in the Alert
  await expect(page.getByText("HTTP 504")).toBeVisible()

  await stub.close()
  await page.close()
})

test("keeps failed items visible and reports partial trash results", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context, {
    trashItems: {
      success: false,
      error: "Google Photos reported 1 of 3 items moved",
      data: {
        partial: true,
        trashedCount: 1,
        trashedKeys: ["group0-item1"],
        trashedDedupKeys: ["dedup-group0-item1"],
        retryAttempts: 0
      }
    }
  })
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await includeAllAndOpenTrashDialog(page)
  await confirmTrashDialog(page, 3)

  await expect(page.getByText(/Moved 1 item before trash failed/i)).toBeVisible(
    {
      timeout: 10_000
    }
  )
  await expect(page.getByText("photo-group1-item1.jpg")).toBeVisible({
    timeout: 10_000
  })
  await expect(page.getByText("photo-group2-item1.jpg")).toBeVisible()
  await expect(page.getByText("photo-group0-item1.jpg")).not.toBeVisible()

  const sw = context.serviceWorkers()[0]
  const reports = await sw.evaluate(
    () =>
      new Promise<any[]>((resolve) => {
        chrome.storage.local.get("trashResultReports", (result) => {
          resolve((result.trashResultReports as any[]) || [])
        })
      })
  )
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({
    status: "partial",
    attemptedCount: 3,
    movedCount: 1,
    failedCount: 2,
    movedMediaKeys: ["group0-item1"],
    failedMediaKeys: ["group1-item1", "group2-item1"],
    error: "Google Photos reported 1 of 3 items moved"
  })

  await stub.close()
  await page.close()
})

// ============================================================
// Cancel: dismiss confirm dialog without trashing
// ============================================================

test("cancel dialog does not trigger trash", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(
    context,
    groups,
    mediaItems,
    Object.keys(mediaItems).length
  )

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible({
    timeout: 8_000
  })

  await includeAllAndOpenTrashDialog(page)
  await expect(page.getByRole("dialog")).toBeVisible()

  // Click Cancel in the dialog
  await page.getByRole("button", { name: /^Cancel$/i }).click()

  // Dialog should close; groups remain intact
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "3 Duplicate Sets to Review",
      exact: true
    })
  ).toBeVisible()
  await expect(page.getByText(/moved to trash/i)).not.toBeVisible()

  await stub.close()
  await page.close()
})
