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
import { test, expect, type BrowserContext } from "@playwright/test"
import {
  launchExtension,
  openAppTab,
  openGptkStubPage,
  injectScanResults,
  clearStorage,
  makeGroups,
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
 * Standard small dataset: 3 groups × 2 items each → 3 dedupKeys to trash.
 * Small enough to fit in a single 250-item batch.
 */
function smallPayload() {
  return makeGroups(3, 2)
}

// ============================================================
// Trash: baseline (< 250 items, single batch)
// ============================================================

test("trashes selected groups and removes them from the UI", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(context, groups, mediaItems, Object.keys(mediaItems).length)

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  // App should load results from storage (no GP auth needed for results view)
  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 8_000 })

  // Click "Move N Duplicates to Trash" in the ActionBar
  await page.getByRole("button", { name: /Move \d+ Duplicates? to Trash/i }).click()

  // Confirm dialog appears
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Move to Trash" })).toBeVisible()

  // Confirm
  await page.getByRole("button", { name: /Move to Trash/i }).last().click()

  // Undo snackbar should appear (trash complete)
  await expect(
    page.getByText(/moved to trash/i)
  ).toBeVisible({ timeout: 10_000 })

  // Groups list should no longer show duplicate groups
  await expect(page.getByText("3 Duplicate Groups Found")).not.toBeVisible()

  await stub.close()
  await page.close()
})

// ============================================================
// Trash: multi-batch (> 250 items)
// ============================================================

test("shows trashing state for multi-batch trash (> 250 items)", async () => {
  await clearStorage(context)

  // 3 groups × 101 items → 303 dedupKeys → 2 batches (250 + 53)
  const { groups, mediaItems } = makeGroups(3, 101)
  await injectScanResults(context, groups, mediaItems, Object.keys(mediaItems).length)

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 8_000 })

  await page.getByRole("button", { name: /Move \d+ Duplicates? to Trash/i }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("button", { name: /Move to Trash/i }).last().click()

  // After all batches complete: undo snackbar appears
  await expect(
    page.getByText(/moved to trash/i)
  ).toBeVisible({ timeout: 15_000 })

  // Groups should be gone
  await expect(page.getByText("3 Duplicate Groups Found")).not.toBeVisible()

  await stub.close()
  await page.close()
})

// ============================================================
// Undo: baseline restore
// ============================================================

test("undo restores all groups to the UI", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(context, groups, mediaItems, Object.keys(mediaItems).length)

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 8_000 })

  // Trash all groups
  await page.getByRole("button", { name: /Move \d+ Duplicates? to Trash/i }).click()
  await page.getByRole("button", { name: /Move to Trash/i }).last().click()
  await expect(page.getByText(/moved to trash/i)).toBeVisible({ timeout: 10_000 })

  // Click Undo in the snackbar
  await page.getByRole("button", { name: /undo/i }).click()

  // All 3 groups should be restored
  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 10_000 })

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

  const { groups, mediaItems } = makeGroups(3, 101) // 303 dedupKeys
  await injectScanResults(context, groups, mediaItems, Object.keys(mediaItems).length)

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 8_000 })

  await page.getByRole("button", { name: /Move \d+ Duplicates? to Trash/i }).click()
  await page.getByRole("button", { name: /Move to Trash/i }).last().click()
  await expect(page.getByText(/moved to trash/i)).toBeVisible({ timeout: 15_000 })

  await page.getByRole("button", { name: /undo/i }).click()

  // Pre-trash state fully restored
  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 10_000 })

  await stub.close()
  await page.close()
})

// ============================================================
// Error: trash API failure
// ============================================================

test("shows error state when trashItems fails", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(context, groups, mediaItems, Object.keys(mediaItems).length)

  // Configure stub to return failure for trashItems
  const stub = await openGptkStubPage(context, {
    trashItems: { success: false, error: "HTTP 504" },
  })
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 8_000 })

  await page.getByRole("button", { name: /Move \d+ Duplicates? to Trash/i }).click()
  await page.getByRole("button", { name: /Move to Trash/i }).last().click()

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

// ============================================================
// Cancel: dismiss confirm dialog without trashing
// ============================================================

test("cancel dialog does not trigger trash", async () => {
  await clearStorage(context)
  const { groups, mediaItems } = smallPayload()
  await injectScanResults(context, groups, mediaItems, Object.keys(mediaItems).length)

  const stub = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible({ timeout: 8_000 })

  await page.getByRole("button", { name: /Move \d+ Duplicates? to Trash/i }).click()
  await expect(page.getByRole("dialog")).toBeVisible()

  // Click Cancel in the dialog
  await page.getByRole("button", { name: /^Cancel$/i }).click()

  // Dialog should close; groups remain intact
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(page.getByText("3 Duplicate Groups Found")).toBeVisible()
  await expect(page.getByText(/moved to trash/i)).not.toBeVisible()

  await stub.close()
  await page.close()
})
