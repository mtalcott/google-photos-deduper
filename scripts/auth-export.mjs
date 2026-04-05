/**
 * One-time Google Photos auth cookie export.
 *
 * Opens a Chrome window, lets you log in manually to Google Photos,
 * then saves the auth cookies to .gp-auth.json (gitignored).
 *
 * Usage:
 *   npm run auth:export
 *
 * To set up CI (GitHub Actions):
 *   Linux:  base64 -w0 .gp-auth.json
 *   Mac:    base64 < .gp-auth.json
 *   → Paste the output as the GP_AUTH_COOKIES repository secret.
 *
 * Cookies expire every 2–4 weeks. Re-run this script when tests start
 * failing with auth errors, then update the GitHub secret.
 */
import { chromium } from "@playwright/test"
import fs from "fs"
import path from "path"
import readline from "readline"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.resolve(__dirname, "../.gp-auth.json")

const context = await chromium.launchPersistentContext("", {
  headless: false,
  args: ["--no-sandbox"],
})

const page = await context.newPage()
await page.goto("https://photos.google.com")

console.log("\n  Google Photos opened in browser.")
console.log("  Log in with your test Google account, wait for the photo grid to load,")
console.log("  then come back here and press Enter.\n")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
await new Promise((resolve) => rl.question("  Press Enter when logged in > ", resolve))
rl.close()

// Export Google auth cookies (filter to google.com domain only — keeps the secret small)
const allCookies = await context.cookies()
const gpCookies = allCookies.filter(
  (c) => c.domain.endsWith("google.com") || c.domain.endsWith("googleapis.com")
)

if (gpCookies.length === 0) {
  console.error("\n  No Google cookies found — are you sure you're logged in?\n")
  process.exit(1)
}

fs.writeFileSync(authFile, JSON.stringify(gpCookies, null, 2))

console.log(`\n  Saved ${gpCookies.length} cookies to .gp-auth.json`)
console.log(`\n  To add to GitHub Secrets (GP_AUTH_COOKIES):`)
console.log(`    Linux:  base64 -w0 .gp-auth.json`)
console.log(`    Mac:    base64 < .gp-auth.json`)
console.log(`\n  Paste the output as the secret value. It expires in 2–4 weeks.\n`)

await context.close()
