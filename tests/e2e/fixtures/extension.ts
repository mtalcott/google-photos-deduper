/**
 * Shared helpers for all E2E tests.
 * Handles extension launch, storage injection, and GP auth cookie injection.
 */
import fs from "fs"
import path from "path"
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from "@playwright/test"

import type { PlanId } from "../../../lib/entitlement"
import type { ScanCheckpoint } from "../../../lib/scan-checkpoint"
import type { DuplicateGroup, GpdMediaItem } from "../../../lib/types"

export const extensionPath = path.resolve(
  __dirname,
  "../../../build/chrome-mv3-dev"
)

const extensionIds = new WeakMap<BrowserContext, string>()

function rememberExtensionId(context: BrowserContext, extensionId: string): void {
  extensionIds.set(context, extensionId)
}

async function openExtensionStoragePage(context: BrowserContext): Promise<Page> {
  const extensionId = extensionIds.get(context)
  if (!extensionId) {
    throw new Error("Extension ID is unavailable for the test context.")
  }

  const page = await context.newPage()
  // A static extension resource gives this page chrome.storage access without
  // booting the app, whose startup effects would race test storage setup.
  await page.goto(`chrome-extension://${extensionId}/manifest.json`)
  return page
}

// ============================================================
// Connect to an already-running Chrome (full E2E only)
// ============================================================

/**
 * Connect to an existing Chrome instance via CDP instead of launching a new one.
 * Used for full E2E tests: avoids Google session invalidation that occurs when
 * cookies are transferred to a new browser (Google binds sessions to device fingerprint).
 *
 * Prerequisites:
 *   Chrome must be running with --remote-debugging-port=9222 AND the extension
 *   loaded (build/chrome-mv3-dev/). The user must be logged into Google Photos.
 *
 *   macOS launch:
 *     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
 *       --remote-debugging-port=9222
 *       --user-data-dir="$HOME/chrome-debug"
 *       --disable-extensions-except=/path/to/build/chrome-mv3-dev
 *       --load-extension=/path/to/build/chrome-mv3-dev
 *
 * After tests, browser.close() only disconnects Playwright — Chrome stays open.
 */
export async function connectToChrome(
  cdpUrl = process.env.CDP_URL || "http://localhost:9222"
): Promise<{
  browser: Browser
  context: BrowserContext
  extensionId: string
}> {
  const userDataDir = process.env.GPD_E2E_USER_DATA_DIR
  if (userDataDir) {
    const context = await chromium.launchPersistentContext(
      path.resolve(userDataDir),
      {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          "--enable-unsafe-extension-debugging",
          "--no-sandbox"
        ]
      }
    )
    let sw = context.serviceWorkers()[0]
    if (!sw) sw = await context.waitForEvent("serviceworker")
    const extensionId = new URL(sw.url()).hostname
    rememberExtensionId(context, extensionId)
    const browser = {
      close: () => context.close()
    } as Browser
    return { browser, context, extensionId }
  }

  let browser: Browser
  try {
    browser = await chromium.connectOverCDP(cdpUrl)
  } catch {
    const macCommand =
      `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n` +
      `    --remote-debugging-port=9222 \\\n` +
      `    --user-data-dir="$HOME/chrome-debug" \\\n` +
      `    --disable-extensions-except="${extensionPath}" \\\n` +
      `    --load-extension="${extensionPath}"`
    const wslCommand =
      `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \\\n` +
      `    --remote-debugging-port=9222 \\\n` +
      `    --user-data-dir="C:\\\\Users\\\\<you>\\\\Chrome Profiles\\\\chrome-debug" \\\n` +
      `    --disable-extensions-except=/path/to/build/chrome-mv3-dev \\\n` +
      `    --load-extension=/path/to/build/chrome-mv3-dev`
    throw new Error(
      `Could not connect to Chrome at ${cdpUrl}.\n` +
        `Start Chrome with remote debugging and load ${extensionPath}.\n\n` +
        `Alternatively, let Playwright launch an existing profile:\n` +
        `  GPD_E2E_USER_DATA_DIR=.chrome-live-validation npm run test:e2e\n\n` +
        `macOS:\n` +
        `  ${macCommand}\n\n` +
        `Windows WSL:\n` +
        `  ${wslCommand}`
    )
  }

  const context = browser.contexts()[0]
  if (!context) throw new Error("No browser context found in connected Chrome.")

  // Discover extension ID from service workers.
  // Try SW first (fastest and most reliable), then fall back to open extension pages.
  let extensionId = ""

  const sws = context.serviceWorkers()
  const gpdSw = sws.find((sw) => sw.url().includes("background"))
  if (gpdSw) {
    extensionId = new URL(gpdSw.url()).hostname
  }

  // Fallback: scan already-open extension pages (app tab may be open from prior run)
  if (!extensionId) {
    for (const page of context.pages()) {
      const url = page.url()
      // Must be a chrome-extension:// URL with a proper 32-char extension ID
      if (
        url.startsWith("chrome-extension://") &&
        new URL(url).hostname.length === 32
      ) {
        extensionId = new URL(url).hostname
        break
      }
    }
  }

  if (!extensionId) {
    throw new Error(
      "Could not find the extension ID.\n" +
        "Make sure the extension is loaded in Chrome (build/chrome-mv3-dev/)."
    )
  }

  rememberExtensionId(context, extensionId)
  return { browser, context, extensionId }
}

// ============================================================
// Extension launch
// ============================================================

export async function launchExtension(): Promise<{
  context: BrowserContext
  extensionId: string
}> {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox"
    ]
  })

  let sw = context.serviceWorkers()[0]
  if (!sw) sw = await context.waitForEvent("serviceworker")
  const extensionId = new URL(sw.url()).hostname
  rememberExtensionId(context, extensionId)

  return { context, extensionId }
}

export function openAppTab(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  return context.newPage().then((page) => {
    return page
      .goto(`chrome-extension://${extensionId}/tabs/app.html`)
      .then(() => page)
  })
}

// ============================================================
// Storage helpers (via an extension page, not the ephemeral MV3 worker)
// ============================================================

async function withExtensionStorage<T>(
  context: BrowserContext,
  operation: (page: Page) => Promise<T>
): Promise<T> {
  const page = await openExtensionStoragePage(context)
  try {
    return await operation(page)
  } finally {
    await page.close()
  }
}

export async function injectScanResults(
  context: BrowserContext,
  groups: object[],
  mediaItems: Record<string, object>,
  totalItems: number,
  accountEmail: string | null = "test@example.com"
): Promise<void> {
  await withExtensionStorage(context, (page) =>
    page.evaluate(
      ({ groups, mediaItems, totalItems, accountEmail }) =>
        new Promise<void>((resolve) => {
          chrome.storage.local.set(
            {
              scanResults: {
                groups,
                mediaItems,
                totalItems,
                scanDate: Date.now(),
                ...(accountEmail ? { accountEmail } : {})
              }
            },
            resolve
          )
        }),
      { groups, mediaItems, totalItems, accountEmail }
    )
  )
}

export async function injectSelections(
  context: BrowserContext,
  selectedGroupIds: string[],
  keptOverrides: Record<string, string[]> = {}
): Promise<void> {
  await withExtensionStorage(context, (page) =>
    page.evaluate(
      ({ selectedGroupIds, keptOverrides }) =>
        new Promise<void>((resolve) => {
          chrome.storage.local.set(
            { selections: { selectedGroupIds, keptOverrides } },
            resolve
          )
        }),
      { selectedGroupIds, keptOverrides }
    )
  )
}

export async function injectScanCheckpoint(
  context: BrowserContext,
  scanCheckpoint: ScanCheckpoint
): Promise<void> {
  await withExtensionStorage(context, (page) =>
    page.evaluate(
      (scanCheckpoint) =>
        new Promise<void>((resolve) => {
          chrome.storage.local.set({ scanCheckpoint }, resolve)
        }),
      scanCheckpoint
    )
  )
}

export async function injectEntitlement(
  context: BrowserContext,
  planId: Exclude<PlanId, "free">
): Promise<void> {
  await withExtensionStorage(context, (page) =>
    page.evaluate(
      (planId) =>
        new Promise<void>((resolve) => {
          chrome.storage.local.set(
            {
              photoSweepDevEntitlement: {
                planId,
                active: true,
                source: "local_dev"
              }
            },
            resolve
          )
        }),
      planId
    )
  )
}

export async function clearStorage(context: BrowserContext): Promise<void> {
  await withExtensionStorage(context, (page) =>
    page.evaluate(
      () => new Promise<void>((resolve) => chrome.storage.local.clear(resolve))
    )
  )
}

// ============================================================
// GPTK stub helpers (integration tests)
// ============================================================

const gptkStubHtml = fs.readFileSync(
  path.resolve(__dirname, "gptk-stub.html"),
  "utf-8"
)

/**
 * Per-command response overrides for the GPTK stub.
 * Set `success: false` to force a command to fail.
 */
export interface GptkOverrides {
  trashItems?: { success: false; error: string; data?: unknown }
  restoreItems?: { success: false; error: string; data?: unknown }
  [command: string]:
    | { success: false; error: string; data?: unknown }
    | { data: unknown }
    | undefined
}

/**
 * Intercept https://photos.google.com/* and serve the GPTK stub page.
 * The extension's bridge content script is injected automatically because the
 * intercepted URL matches the content script's "matches" pattern.
 *
 * Call this before opening the stub page. Returns the opened stub Page so tests
 * can close it, inspect state, or inject overrides via page.evaluate().
 *
 * @param overrides  Per-command response overrides (e.g. force trashItems to fail)
 */
export async function openGptkStubPage(
  context: BrowserContext,
  overrides: GptkOverrides = {}
): Promise<Page> {
  // Intercept ALL requests to photos.google.com so the content script host loads
  await context.route("https://photos.google.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: gptkStubHtml
    })
  })

  const page = await context.newPage()
  await page.goto("https://photos.google.com/")

  // Inject overrides so the stub responds as configured
  if (Object.keys(overrides).length > 0) {
    await page.evaluate((ov) => {
      ;(
        window as unknown as { __gptkOverrides: GptkOverrides }
      ).__gptkOverrides = ov
    }, overrides)
  }

  return page
}

/**
 * Wait for a given text or pattern to become visible on the app tab.
 * Reloads the page once if not visible within `timeout / 2` ms, then waits again.
 * This handles the case where the app tab loads before the stub page is ready.
 */
export async function waitForAppState(
  page: Page,
  matcher: string | RegExp,
  timeout = 10_000
): Promise<void> {
  await page.waitForSelector(
    typeof matcher === "string"
      ? `text=${matcher}`
      : `:text-matches(${matcher.source}, ${matcher.flags || "i"})`,
    { timeout }
  )
}

/**
 * Build N duplicate groups where each group has `itemsPerGroup` items.
 * Returns both the groups array and a matching mediaItems record.
 *
 * Total dedupKeys = N * (itemsPerGroup - 1) after one keep item per group
 * — useful for constructing payloads that span multiple 25-item trash batches.
 */
export function makeGroups(
  groupCount: number,
  itemsPerGroup: number
): { groups: DuplicateGroup[]; mediaItems: Record<string, GpdMediaItem> } {
  const groups: DuplicateGroup[] = []
  const mediaItems: Record<string, GpdMediaItem> = {}

  for (let g = 0; g < groupCount; g++) {
    const mediaKeys: string[] = []
    for (let i = 0; i < itemsPerGroup; i++) {
      const key = `group${g}-item${i}`
      mediaKeys.push(key)
      mediaItems[key] = {
        mediaKey: key,
        dedupKey: `dedup-${key}`,
        thumb: "",
        productUrl: `https://photos.google.com/photo/${key}`,
        timestamp: 1_600_000_000_000 + g * 1000 + i,
        creationTimestamp: 1_700_000_000_000 + g * 1000 + i,
        resWidth: 1920,
        resHeight: 1080,
        fileName: `photo-${key}.jpg`,
        isOwned: true
      }
    }
    groups.push({
      id: `group-${g}`,
      mediaKeys,
      originalMediaKey: mediaKeys[0],
      similarity: 0.95
    })
  }

  return { groups, mediaItems }
}
