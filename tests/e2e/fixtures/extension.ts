/**
 * Shared helpers for all E2E tests.
 * Handles extension launch, storage injection, and GP auth cookie injection.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test"
import path from "path"
import fs from "fs"

export const extensionPath = path.resolve(__dirname, "../../../build/chrome-mv3-dev")

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
 *   WSL launch:
 *     "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
 *       --remote-debugging-port=9222
 *       --user-data-dir="C:\Users\mackt\Chrome Profiles\chrome-debug"
 *
 * After tests, browser.close() only disconnects Playwright — Chrome stays open.
 */
export async function connectToChrome(
  cdpUrl = process.env.CDP_URL || "http://localhost:9222"
): Promise<{ browser: import("@playwright/test").Browser; context: BrowserContext; extensionId: string }> {
  let browser: import("@playwright/test").Browser
  try {
    browser = await chromium.connectOverCDP(cdpUrl)
  } catch {
    throw new Error(
      `Could not connect to Chrome at ${cdpUrl}.\n` +
      `Start Chrome with remote debugging:\n` +
      `  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \\\n` +
      `    --remote-debugging-port=9222 \\\n` +
      `    --user-data-dir="C:\\\\Users\\\\mackt\\\\Chrome Profiles\\\\chrome-debug"`
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
      if (url.startsWith("chrome-extension://") && new URL(url).hostname.length === 32) {
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
      "--no-sandbox",
    ],
  })

  let sw = context.serviceWorkers()[0]
  if (!sw) sw = await context.waitForEvent("serviceworker")
  const extensionId = new URL(sw.url()).hostname

  return { context, extensionId }
}

export function openAppTab(context: BrowserContext, extensionId: string): Promise<Page> {
  return context.newPage().then((page) => {
    return page
      .goto(`chrome-extension://${extensionId}/tabs/app.html`)
      .then(() => page)
  })
}

// ============================================================
// Storage helpers (via service worker)
// ============================================================

export async function injectScanResults(
  context: BrowserContext,
  groups: object[],
  mediaItems: Record<string, object>,
  totalItems: number
): Promise<void> {
  const sw = context.serviceWorkers()[0]
  await sw.evaluate(
    ({ groups, mediaItems, totalItems }) =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set(
          { scanResults: { groups, mediaItems, totalItems, scanDate: Date.now() } },
          resolve
        )
      }),
    { groups, mediaItems, totalItems }
  )
}

export async function clearStorage(context: BrowserContext): Promise<void> {
  let sw = context.serviceWorkers()[0]
  if (!sw) {
    try {
      sw = await context.waitForEvent("serviceworker", { timeout: 5_000 })
    } catch {
      // No service worker available (e.g. CDP context without extension SW registered yet)
      // Skip storage clear — tests must handle stale state themselves
      return
    }
  }
  await sw.evaluate(() => new Promise<void>((resolve) => chrome.storage.local.clear(resolve)))
}

// ============================================================
// Google Photos auth (full E2E only)
// ============================================================

/**
 * Inject Google Photos auth cookies into the browser context.
 * Reads from GP_AUTH_COOKIES env var (base64 JSON, for CI) or
 * .gp-auth.json file (for local dev).
 *
 * To generate .gp-auth.json: npm run auth:export
 * To set up CI: base64 -w0 .gp-auth.json → paste as GP_AUTH_COOKIES secret
 */
export async function injectGpAuth(context: BrowserContext): Promise<void> {
  const cookies = loadGpCookies()
  await context.addCookies(cookies)
}

function loadGpCookies() {
  if (process.env.GP_AUTH_COOKIES) {
    return JSON.parse(Buffer.from(process.env.GP_AUTH_COOKIES, "base64").toString("utf-8"))
  }
  const authFile = path.resolve(__dirname, "../../../.gp-auth.json")
  if (fs.existsSync(authFile)) {
    return JSON.parse(fs.readFileSync(authFile, "utf-8"))
  }
  throw new Error(
    "No GP auth cookies found.\n" +
    "  Local dev: run `npm run auth:export` to generate .gp-auth.json\n" +
    "  CI: set the GP_AUTH_COOKIES secret (see scripts/auth-export.mjs)"
  )
}
