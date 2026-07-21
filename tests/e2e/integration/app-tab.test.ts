/**
 * Integration E2E tests for the extension app tab.
 * No Google Photos auth required — uses injected mock data.
 *
 * Prerequisites: `npm run build`
 * Run: `npm run test:integration`
 */
import { expect, test, type BrowserContext } from "@playwright/test"

import {
  clearStorage,
  injectScanCheckpoint,
  injectScanResults,
  injectSelections,
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

test("restores saved scan results from storage on load", async () => {
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      },
      {
        id: "g2",
        mediaKeys: ["key3", "key4"],
        originalMediaKey: "key3",
        similarity: 0.98
      }
    ],
    {
      key1: {
        mediaKey: "key1",
        dedupKey: "d1",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        duration: null,
        isOwned: true,
        fileName: "photo1.jpg"
      },
      key2: {
        mediaKey: "key2",
        dedupKey: "d2",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        duration: null,
        isOwned: true,
        fileName: "photo2.jpg"
      },
      key3: {
        mediaKey: "key3",
        dedupKey: "d3",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        duration: null,
        isOwned: true,
        fileName: "photo3.jpg"
      },
      key4: {
        mediaKey: "key4",
        dedupKey: "d4",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        duration: null,
        isOwned: true,
        fileName: "photo4.jpg"
      }
    },
    4
  )

  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("2 Duplicate Sets Ready")).toBeVisible({
    timeout: 5000
  })
  await expect(page.getByText("4 photos and videos checked")).toBeVisible()
  await expect(
    page.getByText("2 duplicate sets to review", { exact: true }).first()
  ).toBeVisible()
  await expect(
    page.getByText("How was your PhotoSweep scan?")
  ).not.toBeVisible()

  await page.close()
  await clearStorage(context)
})

test("filters review groups by exact and similar classification", async () => {
  await injectScanResults(
    context,
    [
      {
        id: "exact-group",
        mediaKeys: ["exact1", "exact2"],
        originalMediaKey: "exact1",
        similarity: 0.99,
        duplicateKind: "exact",
        matchReasons: ["same dedupKey"]
      },
      {
        id: "similar-group",
        mediaKeys: ["similar1", "similar2"],
        originalMediaKey: "similar1",
        similarity: 0.95,
        duplicateKind: "similar",
        matchReasons: []
      }
    ],
    {
      exact1: {
        mediaKey: "exact1",
        dedupKey: "same",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        fileName: "exact1.jpg"
      },
      exact2: {
        mediaKey: "exact2",
        dedupKey: "same",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        fileName: "exact2.jpg"
      },
      similar1: {
        mediaKey: "similar1",
        dedupKey: "s1",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        fileName: "similar1.jpg"
      },
      similar2: {
        mediaKey: "similar2",
        dedupKey: "s2",
        thumb: "",
        timestamp: 0,
        creationTimestamp: 0,
        resWidth: 100,
        resHeight: 100,
        fileName: "similar2.jpg"
      }
    },
    4
  )

  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("Exact duplicate")).toBeVisible({ timeout: 5000 })
  await expect(page.getByText("Similar", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: /Identical \(1\)/i }).click()
  await expect(page.getByText("Exact duplicate")).toBeVisible()
  await expect(page.getByText("Similar", { exact: true })).not.toBeVisible()
  await expect(page.getByText("2 sets total")).toBeVisible()

  await page.getByRole("button", { name: /Similar \(1\)/i }).click()
  await expect(page.getByText("Similar", { exact: true })).toBeVisible()
  await expect(page.getByText("Exact duplicate")).not.toBeVisible()

  await page.close()
  await clearStorage(context)
})

test("clears saved results and selections when a different Google account is detected", async () => {
  await clearStorage(context)
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2,
    "alice@example.com"
  )
  await injectSelections(context, ["g1"], { g1: ["key2"] })

  const stub = await openGptkStubPage(context, {
    healthCheck: {
      data: {
        hasGptk: true,
        hasWizData: true,
        accountEmail: "bob@example.com"
      }
    }
  })
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("Find duplicates from your photo library")).toBeVisible({
    timeout: 8_000
  })
  await expect(page.getByText("1 Duplicate Set Ready")).not.toBeVisible()

  const sw = context.serviceWorkers()[0]
  await expect
    .poll(() =>
      sw.evaluate(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            chrome.storage.local.get(["scanResults", "selections"], resolve)
          })
      )
    )
    .toEqual({})

  await page.close()
  await stub.close()
  await clearStorage(context)
})

test("clears legacy saved results when the current Google account is known", async () => {
  await clearStorage(context)
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2,
    null
  )
  await injectSelections(context, ["g1"], { g1: ["key2"] })

  const stub = await openGptkStubPage(context, {
    healthCheck: {
      data: {
        hasGptk: true,
        hasWizData: true,
        accountEmail: "known@example.com"
      }
    }
  })
  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("Find duplicates from your photo library")).toBeVisible({
    timeout: 8_000
  })
  await expect(page.getByText("1 Duplicate Set Ready")).not.toBeVisible()

  const sw = context.serviceWorkers()[0]
  await expect
    .poll(() =>
      sw.evaluate(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            chrome.storage.local.get(["scanResults", "selections"], resolve)
          })
      )
    )
    .toEqual({})

  await page.close()
  await stub.close()
  await clearStorage(context)
})

test("shows 'no duplicates found' when scan returns zero groups", async () => {
  await injectScanResults(context, [], {}, 500)

  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByText("No duplicates found in your library.")
  ).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/use Full scan/i)).toBeVisible()

  await page.close()
  await clearStorage(context)
})

test("migrates untouched old smart defaults to full scan", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context)
  const sw = context.serviceWorkers()[0]
  await sw.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            settings: {
              scanMode: "smart",
              similarityThreshold: 0.99,
              smartWindowSec: 1
            }
          },
          resolve
        )
      })
  )

  const page = await openAppTab(context, extensionId)
  await page.getByRole("button", { name: /More options/i }).click()

  await expect(page.getByRole("button", { name: /^Smart$/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByText(/Sensitivity:/i)).toContainText("0.95")

  await page.close()
  await gpPage.close()
  await clearStorage(context)
})

test("preserves intentional strict similarity settings", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context)
  const sw = context.serviceWorkers()[0]
  await sw.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            settings: {
              scanMode: "full",
              similarityThreshold: 0.99,
              smartWindowSec: 1
            }
          },
          resolve
        )
      })
  )

  const page = await openAppTab(context, extensionId)
  await page.getByRole("button", { name: /More options/i }).click()

  await expect(page.getByRole("button", { name: /^Smart$/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByText(/Sensitivity:/i)).toContainText("0.99")

  await page.close()
  await gpPage.close()
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

test("offers resume when a previous scan checkpoint was interrupted", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context)
  await injectScanCheckpoint(context, {
    id: "req-interrupted",
    status: "active",
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    accountEmail: "test@example.com",
    settings: {
      scanMode: "smart",
      similarityThreshold: 0.99,
      smartWindowSec: 1,
      dateRange: { from: "2024-01-01", to: "2024-12-31" }
    },
    phase: "computing_embeddings",
    itemsProcessed: 50,
    totalEstimate: 100,
    message: "computing_embeddings: 50/100"
  })

  const page = await openAppTab(context, extensionId)

  await expect(
    page.getByRole("button", { name: /Continue previous scan/i })
  ).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/Previous smart scan/i)).toContainText(
    "2024-01-01 to 2024-12-31"
  )

  await page.close()
  await gpPage.close()
  await clearStorage(context)
})

test("clears resumable checkpoint when a different Google account is detected", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context, {
    healthCheck: {
      data: {
        hasGptk: true,
        hasWizData: true,
        accountEmail: "bob@example.com"
      }
    }
  })
  await injectScanCheckpoint(context, {
    id: "req-wrong-account",
    status: "interrupted",
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    accountEmail: "alice@example.com",
    settings: {
      scanMode: "smart",
      similarityThreshold: 0.99,
      smartWindowSec: 1
    },
    phase: "computing_embeddings",
    itemsProcessed: 50,
    totalEstimate: 100,
    message: "computing_embeddings: 50/100"
  })

  const page = await openAppTab(context, extensionId)

  await expect(page.getByText("Find duplicates from your photo library")).toBeVisible({
    timeout: 8_000
  })
  await expect(
    page.getByRole("button", { name: /Continue previous scan/i })
  ).not.toBeVisible()

  const sw = context.serviceWorkers()[0]
  const stored = await sw.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("scanCheckpoint", resolve)
      })
  )
  expect(stored.scanCheckpoint).toBeUndefined()

  await page.close()
  await gpPage.close()
  await clearStorage(context)
})

test("resumes duplicate detection from a checkpointed media list without refetching", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context)
  const { mediaItems } = makeGroups(1, 2)
  await injectScanCheckpoint(context, {
    id: "req-media-checkpoint",
    status: "interrupted",
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    accountEmail: "test@example.com",
    settings: {
      scanMode: "smart",
      similarityThreshold: 0.99,
      smartWindowSec: 1
    },
    phase: "computing_embeddings",
    itemsProcessed: 1,
    totalEstimate: 2,
    message: "computing_embeddings: 1/2",
    mediaItems: Object.values(mediaItems)
  })

  const page = await openAppTab(context, extensionId)

  await expect(page.getByText(/Fetched media list \(2 items\)/i)).toBeVisible({
    timeout: 5000
  })
  await page.getByRole("button", { name: /Continue previous scan/i }).click()
  await expect(page.getByText(/No duplicates found/i)).toBeVisible({
    timeout: 10_000
  })
  await expect(page.getByText("How was your PhotoSweep scan?")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Leave an honest review" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Send feedback" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Maybe later" }).click()

  const ratingPrompt = await context.serviceWorkers()[0].evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("ratingPrompt", resolve)
      })
  )
  expect(ratingPrompt.ratingPrompt).toEqual({
    successfulScans: 1,
    nextPromptAt: 4,
    completed: false
  })

  const commands = await gpPage.evaluate(
    () =>
      (
        window as unknown as {
          __gptkCommandLog?: Array<{ command: string }>
        }
      ).__gptkCommandLog || []
  )
  expect(commands.map((entry) => entry.command)).not.toContain(
    "getAllMediaItems"
  )

  await page.close()
  await gpPage.close()
  await clearStorage(context)
})

test("loads albums and allows choosing an album scan scope", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context)
  const page = await openAppTab(context, extensionId)

  await page.getByRole("button", { name: /More options/i }).click()
  await expect(page.getByText(/2 albums available/i)).toBeVisible({
    timeout: 5000
  })
  await page.getByRole("combobox", { name: /Library area/i }).click()
  await page.getByRole("option", { name: /Tiny test album/i }).click()

  await expect(
    page.getByRole("button", { name: /Check this album/i })
  ).toBeVisible()
  await expect(page.getByText(/Only checking Tiny test album/i)).toBeVisible()

  await page.close()
  await gpPage.close()
  await clearStorage(context)
})

// ============================================================
// Selection persistence
// ============================================================

const BASE_MEDIA_ITEMS = {
  key1: {
    mediaKey: "key1",
    dedupKey: "d1",
    thumb: "",
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: "photo1.jpg"
  },
  key2: {
    mediaKey: "key2",
    dedupKey: "d2",
    thumb: "",
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: "photo2.jpg"
  },
  key3: {
    mediaKey: "key3",
    dedupKey: "d3",
    thumb: "",
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: "photo3.jpg"
  },
  key4: {
    mediaKey: "key4",
    dedupKey: "d4",
    thumb: "",
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: "photo4.jpg"
  },
  key5: {
    mediaKey: "key5",
    dedupKey: "d5",
    thumb: "",
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: "photo5.jpg"
  },
  key6: {
    mediaKey: "key6",
    dedupKey: "d6",
    thumb: "",
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: "photo6.jpg"
  }
}

test("persists group selections through page reload", async () => {
  // 3 groups; only g1 and g3 are selected (g2 is deselected)
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      },
      {
        id: "g2",
        mediaKeys: ["key3", "key4"],
        originalMediaKey: "key3",
        similarity: 0.98
      },
      {
        id: "g3",
        mediaKeys: ["key5", "key6"],
        originalMediaKey: "key5",
        similarity: 0.97
      }
    ],
    BASE_MEDIA_ITEMS,
    6
  )
  await injectSelections(context, ["g1", "g3"], {})

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("3 Duplicate Sets Ready")).toBeVisible({
    timeout: 5000
  })

  const checkboxes = page.locator('input[type="checkbox"]')
  await expect(checkboxes.nth(0)).toBeChecked() // g1 selected
  await expect(checkboxes.nth(1)).not.toBeChecked() // g2 deselected
  await expect(checkboxes.nth(2)).toBeChecked() // g3 selected

  await page.reload()
  await expect(page.getByText("3 Duplicate Sets Ready")).toBeVisible({
    timeout: 5000
  })
  await expect(checkboxes.nth(0)).toBeChecked()
  await expect(checkboxes.nth(1)).not.toBeChecked()
  await expect(checkboxes.nth(2)).toBeChecked()

  await page.close()
  await clearStorage(context)
})

test("re-scan clears saved results, selections, and resumable checkpoint", async () => {
  await clearStorage(context)
  const gpPage = await openGptkStubPage(context)
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2
  )
  await injectSelections(context, ["g1"], { g1: ["key2"] })
  await injectScanCheckpoint(context, {
    id: "req-stale",
    status: "interrupted",
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    accountEmail: "test@example.com",
    settings: {
      scanMode: "smart",
      similarityThreshold: 0.99,
      smartWindowSec: 1
    },
    phase: "computing_embeddings",
    itemsProcessed: 50,
    totalEstimate: 100,
    message: "computing_embeddings: 50/100"
  })

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5_000
  })

  await page.getByRole("button", { name: /Scan again/i }).click()
  await expect(page.getByText("Find duplicates from your photo library")).toBeVisible({
    timeout: 8_000
  })

  const sw = context.serviceWorkers()[0]
  const stored = await sw.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(
          ["scanResults", "selections", "scanCheckpoint"],
          resolve
        )
      })
  )
  expect(stored.scanResults).toBeUndefined()
  expect(stored.selections).toBeUndefined()
  expect(stored.scanCheckpoint).toBeUndefined()

  await page.reload()
  await expect(page.getByText("Find duplicates from your photo library")).toBeVisible({
    timeout: 8_000
  })
  await expect(page.getByText("1 Duplicate Set Ready")).not.toBeVisible()

  await page.close()
  await gpPage.close()
  await clearStorage(context)
})

test("persists kept overrides through page reload", async () => {
  // g1 has 2 items; default keep is key1 but we override to keep key2 instead
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2
  )
  await injectSelections(context, ["g1"], { g1: ["key2"] })

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5000
  })

  // key2 (second card) should have the Keep chip; key1 (first card) should not
  const cards = page.locator(".MuiCard-root")
  await expect(cards.nth(0)).not.toContainText("Keep") // key1 — not kept
  await expect(cards.nth(1)).toContainText("Keep") // key2 — kept

  await page.reload()
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5000
  })
  await expect(cards.nth(0)).not.toContainText("Keep")
  await expect(cards.nth(1)).toContainText("Keep")

  await page.close()
  await clearStorage(context)
})

test("persists trash-all copy choices through page reload", async () => {
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2
  )

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5000
  })

  await page.getByRole("button", { name: /Trash all copies/i }).click()
  await expect(
    page.getByRole("button", { name: /Move 2 to Trash/i })
  ).toBeVisible()
  await expect(page.locator(".MuiCard-root").nth(0)).toContainText("Will trash")
  await expect(page.locator(".MuiCard-root").nth(1)).toContainText("Will trash")

  const sw = context.serviceWorkers()[0]
  await expect
    .poll(async () => {
      const stored = await sw.evaluate(
        () =>
          new Promise<{
            selections?: { keptOverrides?: Record<string, string[]> }
          }>((resolve) => {
            chrome.storage.local.get("selections", resolve)
          })
      )
      return stored.selections?.keptOverrides?.g1
    })
    .toEqual([])

  await page.reload()
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5000
  })
  await expect(
    page.getByRole("button", { name: /Move 2 to Trash/i })
  ).toBeVisible()
  await expect(page.locator(".MuiCard-root").nth(0)).toContainText("Will trash")
  await expect(page.locator(".MuiCard-root").nth(1)).toContainText("Will trash")

  await page.close()
  await clearStorage(context)
})

test("ignores stale kept override keys from saved selections", async () => {
  await clearStorage(context)
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2
  )
  await injectSelections(context, ["g1"], { g1: ["missing-key"] })

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5000
  })
  await expect(
    page.getByRole("button", { name: /Move 1 to Trash/i })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Move 2 to Trash/i })
  ).not.toBeVisible()

  const sw = context.serviceWorkers()[0]
  await expect
    .poll(async () => {
      const stored = await sw.evaluate(
        () =>
          new Promise<{
            selections?: { keptOverrides?: Record<string, string[]> }
          }>((resolve) => {
            chrome.storage.local.get("selections", resolve)
          })
      )
      return stored.selections?.keptOverrides?.g1 ?? []
    })
    .toEqual([])

  await page.close()
  await clearStorage(context)
})

test("ignores malformed saved selections without crashing on load", async () => {
  await clearStorage(context)
  await injectScanResults(
    context,
    [
      {
        id: "g1",
        mediaKeys: ["key1", "key2"],
        originalMediaKey: "key1",
        similarity: 0.99
      }
    ],
    { key1: BASE_MEDIA_ITEMS.key1, key2: BASE_MEDIA_ITEMS.key2 },
    2
  )

  const sw = context.serviceWorkers()[0]
  await sw.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            selections: {
              selectedGroupIds: "g1",
              keptOverrides: {
                g1: "key2",
                bad: [null, 42]
              }
            }
          },
          resolve
        )
      })
  )

  const page = await openAppTab(context, extensionId)
  await expect(page.getByText("1 Duplicate Set Ready")).toBeVisible({
    timeout: 5000
  })
  await expect(
    page.getByRole("button", { name: /Move 1 to Trash/i })
  ).not.toBeVisible()

  await page.close()
  await clearStorage(context)
})
