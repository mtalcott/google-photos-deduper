/**
 * Cross-tab messaging integration tests.
 *
 * Exercises the complete three-context messaging loop using a real Playwright-
 * launched extension and a GPTK stub page that intercepts https://photos.google.com/:
 *
 *   App Tab → chrome.runtime.sendMessage
 *     → Service Worker → chrome.tabs.sendMessage
 *       → Bridge content script → window.postMessage
 *         → GPTK stub (replies via window.postMessage)
 *       → Bridge content script → chrome.runtime.sendMessage
 *     → Service Worker → chrome.tabs.sendMessage
 *   → App Tab (receives result)
 *
 * No Google Photos auth required. Run via: npm run test:integration
 *
 * Prerequisites: `npm run dev` (dev build) or `npm run build` (prod build)
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test"
import {
  launchExtension,
  openAppTab,
  openGptkStubPage,
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
// Helpers
// ============================================================

/** Send a chrome.runtime message from the app tab and return the response. */
async function sendAppMessage(
  appPage: Page,
  message: Record<string, unknown>
): Promise<unknown> {
  return appPage.evaluate((msg) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, resolve)
    })
  }, message)
}

// ============================================================
// healthCheck flow
// ============================================================

test.describe("healthCheck", () => {
  test("app tab receives healthCheck.result success when GP stub responds", async () => {
    await clearStorage(context)

    // Open stub first so the service worker finds it when healthCheck fires
    const stub = await openGptkStubPage(context)
    const page = await openAppTab(context, extensionId)

    // The app tab fires healthCheck on mount — wait for connected state
    await expect(
      page.getByRole("button", { name: /Scan Library/i })
    ).toBeVisible({ timeout: 10_000 })

    await stub.close()
    await page.close()
  })

  test("app tab shows disconnected when GP tab is not open", async () => {
    await clearStorage(context)

    // Open app tab without any GP stub — healthCheck should fail
    const page = await openAppTab(context, extensionId)

    await expect(
      page.getByText(/Cannot connect to Google Photos/i)
    ).toBeVisible({ timeout: 10_000 })

    await page.close()
  })

  test("app tab reflects the accountEmail returned by the stub", async () => {
    await clearStorage(context)

    const stub = await openGptkStubPage(context, {
      healthCheck: {
        data: {
          hasGptk: true,
          hasWizData: true,
          accountEmail: "custom@example.com",
        },
      } as never,
    })
    const page = await openAppTab(context, extensionId)

    // Connected state means the healthCheck round-trip succeeded
    await expect(
      page.getByRole("button", { name: /Scan Library/i })
    ).toBeVisible({ timeout: 10_000 })

    await stub.close()
    await page.close()
  })
})

// ============================================================
// GP tab close notification
// ============================================================

test.describe("tab lifecycle", () => {
  test("app tab receives GP_TAB_CLOSED when GP stub tab is closed", async () => {
    await clearStorage(context)

    const stub = await openGptkStubPage(context)
    const page = await openAppTab(context, extensionId)

    // Wait for connected state
    await expect(
      page.getByRole("button", { name: /Scan Library/i })
    ).toBeVisible({ timeout: 10_000 })

    // Close the GP stub tab
    await stub.close()

    // App should now show disconnected (GP_TAB_CLOSED event)
    await expect(
      page.getByText(/Google Photos tab was closed|Cannot connect/i)
    ).toBeVisible({ timeout: 10_000 })

    await page.close()
  })
})

// ============================================================
// gptkCommand routing — direct round-trip
// ============================================================

test.describe("gptkCommand routing", () => {
  test("app tab receives gptkResult after command is relayed through GP stub", async () => {
    await clearStorage(context)

    const stub = await openGptkStubPage(context)
    const page = await openAppTab(context, extensionId)

    // Wait for connected state (proves the tab mapping is established)
    await expect(
      page.getByRole("button", { name: /Scan Library/i })
    ).toBeVisible({ timeout: 10_000 })

    // Send a gptkCommand from the app tab and capture the result via a listener
    const result = await page.evaluate(() => {
      return new Promise<{
        success: boolean
        command: string
        data: unknown
      }>((resolve) => {
        const APP_ID = "GPD"
        const requestId = `test-${Date.now()}`

        const listener = (msg: Record<string, unknown>) => {
          if (
            msg?.app === APP_ID &&
            msg?.action === "gptkResult" &&
            msg?.requestId === requestId
          ) {
            chrome.runtime.onMessage.removeListener(listener)
            resolve({
              success: msg.success as boolean,
              command: msg.command as string,
              data: msg.data,
            })
          }
        }
        chrome.runtime.onMessage.addListener(listener)

        chrome.runtime.sendMessage({
          app: APP_ID,
          action: "gptkCommand",
          command: "healthCheck",
          requestId,
        })
      })
    })

    expect(result.success).toBe(true)
    expect(result.command).toBe("healthCheck")
    expect((result.data as Record<string, unknown>)?.hasGptk).toBe(true)

    await stub.close()
    await page.close()
  })

  test("app tab receives gptkResult failure when GP tab is not found", async () => {
    await clearStorage(context)

    // No stub open — service worker cannot route the command
    const page = await openAppTab(context, extensionId)

    // Wait for disconnected state
    await expect(
      page.getByText(/Cannot connect to Google Photos/i)
    ).toBeVisible({ timeout: 8_000 })

    const result = await page.evaluate(() => {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        const APP_ID = "GPD"
        const requestId = `test-nophoto-${Date.now()}`

        const listener = (msg: Record<string, unknown>) => {
          if (
            msg?.app === APP_ID &&
            msg?.action === "gptkResult" &&
            msg?.requestId === requestId
          ) {
            chrome.runtime.onMessage.removeListener(listener)
            resolve({ success: msg.success as boolean, error: msg.error as string })
          }
        }
        chrome.runtime.onMessage.addListener(listener)

        chrome.runtime.sendMessage({
          app: APP_ID,
          action: "gptkCommand",
          command: "healthCheck",
          requestId,
        })
      })
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()

    await page.close()
  })
})

// ============================================================
// Progress streaming
// ============================================================

test.describe("progress streaming", () => {
  test("app tab receives intermediate gptkProgress messages during long command", async () => {
    await clearStorage(context)

    const stub = await openGptkStubPage(context)
    const page = await openAppTab(context, extensionId)

    await expect(
      page.getByRole("button", { name: /Scan Library/i })
    ).toBeVisible({ timeout: 10_000 })

    // Trigger a trashItems command with 600 items (2 batches of 250 + 100)
    // The stub emits progress after each batch, so we expect at least one progress event.
    const progressEvents = await page.evaluate(() => {
      return new Promise<number[]>((resolve) => {
        const APP_ID = "GPD"
        const requestId = `test-progress-${Date.now()}`
        const events: number[] = []

        const listener = (msg: Record<string, unknown>) => {
          if (msg?.app !== APP_ID || msg?.requestId !== requestId) return
          if (msg.action === "gptkProgress") {
            events.push(msg.itemsProcessed as number)
          }
          if (msg.action === "gptkResult") {
            chrome.runtime.onMessage.removeListener(listener)
            resolve(events)
          }
        }
        chrome.runtime.onMessage.addListener(listener)

        const dedupKeys = Array.from({ length: 600 }, (_, i) => `key-${i}`)
        chrome.runtime.sendMessage({
          app: APP_ID,
          action: "gptkCommand",
          command: "trashItems",
          requestId,
          args: { dedupKeys },
        })
      })
    })

    // Expect at least 2 progress events (batch 250, batch 500, plus 600)
    expect(progressEvents.length).toBeGreaterThanOrEqual(2)
    // Progress values should be non-decreasing
    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i]).toBeGreaterThanOrEqual(progressEvents[i - 1])
    }
    // Final progress should equal total
    expect(progressEvents.at(-1)).toBe(600)

    await stub.close()
    await page.close()
  })
})
