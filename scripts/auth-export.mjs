/**
 * Google Photos auth cookie export via Chrome DevTools Protocol.
 *
 * Connects to an already-running Chrome instance (with remote debugging)
 * and exports Google auth cookies — no login required.
 *
 * Usage:
 *   1. Make sure Chrome is running with remote debugging:
 *        "C:\Program Files\Google\Chrome\Application\chrome.exe"
 *          --remote-debugging-port=9222
 *          --user-data-dir="C:\Users\<you>\Chrome Profiles\chrome-debug"
 *      (This is the same Chrome instance used by the chrome-devtools MCP.)
 *   2. Open https://photos.google.com in that Chrome and log in.
 *   3. npm run auth:export
 *
 * To set up CI (GitHub Actions):
 *   Linux:  base64 -w0 .gp-auth.json
 *   Mac:    base64 < .gp-auth.json
 *   → Paste output as the GP_AUTH_COOKIES repository secret.
 *
 * Cookies expire every 2–4 weeks. Re-run this script and update the secret
 * when full E2E tests start failing with auth errors.
 */
import { chromium } from "@playwright/test"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.resolve(__dirname, "../.gp-auth.json")
const CDP_URL = process.env.CDP_URL || "http://localhost:9222"

console.log(`\n  Connecting to Chrome at ${CDP_URL}...`)

let browser
try {
  browser = await chromium.connectOverCDP(CDP_URL)
} catch {
  console.error(`\n  Could not connect to Chrome at ${CDP_URL}.`)
  console.error(`  Make sure Chrome is running with --remote-debugging-port=9222.\n`)
  console.error(`  WSL launch command:`)
  console.error(`    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \\`)
  console.error(`      --remote-debugging-port=9222 \\`)
  console.error(`      --user-data-dir="C:\\\\Users\\\\mackt\\\\Chrome Profiles\\\\chrome-debug"\n`)
  process.exit(1)
}

// Find all contexts and collect Google cookies
const contexts = browser.contexts()
if (contexts.length === 0) {
  console.error("  No browser contexts found.\n")
  process.exit(1)
}

// Collect Google auth cookies from all contexts
const allCookies = (
  await Promise.all(
    contexts.map((ctx) =>
      ctx.cookies([
        "https://photos.google.com",
        "https://accounts.google.com",
        "https://www.google.com",
      ])
    )
  )
).flat()

// Deduplicate by name+domain
const seen = new Set()
const gpCookies = allCookies.filter((c) => {
  const key = `${c.name}::${c.domain}`
  if (seen.has(key)) return false
  seen.add(key)
  return c.domain.endsWith("google.com") || c.domain.endsWith("googleapis.com")
})

await browser.close()

if (gpCookies.length === 0) {
  console.error("\n  No Google cookies found.")
  console.error("  Make sure you're logged into https://photos.google.com in that Chrome.\n")
  process.exit(1)
}

fs.writeFileSync(authFile, JSON.stringify(gpCookies, null, 2))

console.log(`\n  Saved ${gpCookies.length} cookies to .gp-auth.json`)
console.log(`\n  To add to GitHub Secrets (GP_AUTH_COOKIES):`)
console.log(`    Linux:  base64 -w0 .gp-auth.json`)
console.log(`    Mac:    base64 < .gp-auth.json`)
console.log(`\n  Paste the output as the secret value. Expires in 2–4 weeks.\n`)
