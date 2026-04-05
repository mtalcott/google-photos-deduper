/**
 * Shared helpers for all E2E tests.
 * Handles extension launch, storage injection, and GP auth cookie injection.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test"
import path from "path"
import fs from "fs"

export const extensionPath = path.resolve(__dirname, "../../../build/chrome-mv3-dev")

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
  const sw = context.serviceWorkers()[0]
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
