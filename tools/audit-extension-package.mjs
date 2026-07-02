#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const buildDir = process.env.PHOTOSWEEP_EXTENSION_BUILD_DIR ?? "build/chrome-mv3-prod"
const expectedApiBase = process.env.PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_BASE_URL
const expectedHostPermission = process.env.PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_HOST_PERMISSION
const expectedPublicKey = process.env.PLASMO_PUBLIC_PHOTOSWEEP_ENTITLEMENT_PUBLIC_KEY

function fail(message) {
  console.error(`audit failed: ${message}`)
  process.exitCode = 1
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

if (!expectedApiBase) fail("PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_BASE_URL is required")
if (!expectedHostPermission) fail("PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_HOST_PERMISSION is required")
if (!expectedPublicKey) fail("PLASMO_PUBLIC_PHOTOSWEEP_ENTITLEMENT_PUBLIC_KEY is required")
if (process.env.PLASMO_PUBLIC_PHOTOSWEEP_ALLOW_DEV_ENTITLEMENT !== "0") {
  fail("PLASMO_PUBLIC_PHOTOSWEEP_ALLOW_DEV_ENTITLEMENT must be 0 for release packages")
}

const manifestPath = path.join(buildDir, "manifest.json")
if (!fs.existsSync(manifestPath)) fail(`missing ${manifestPath}`)
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {}

if (manifest.manifest_version !== 3) fail("manifest_version must be 3")
if (manifest.side_panel?.default_path !== "tabs/scanner-panel.html") {
  fail("side_panel.default_path must be tabs/scanner-panel.html")
}

const hostPermissions = manifest.host_permissions ?? []
if (!Array.isArray(hostPermissions)) fail("manifest.host_permissions must be an array")
if (!hostPermissions.includes(expectedHostPermission)) {
  fail(`missing expected backend host permission: ${expectedHostPermission}`)
}
for (const host of hostPermissions) {
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    fail(`localhost host permission is not allowed in release package: ${host}`)
  }
  if (host.includes("$PLASMO_PUBLIC_")) {
    fail(`unresolved manifest environment variable: ${host}`)
  }
}

const files = fs.existsSync(buildDir) ? walk(buildDir) : []
const jsFiles = files.filter((file) => file.endsWith(".js"))
const jsText = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n")

if (expectedApiBase && !jsText.includes(expectedApiBase)) {
  fail(`built JavaScript does not contain expected API base URL: ${expectedApiBase}`)
}
if (jsText.includes("http://127.0.0.1") || jsText.includes("http://localhost")) {
  fail("built JavaScript contains localhost API URL")
}
if (jsText.includes("PLASMO_PUBLIC_PHOTOSWEEP")) {
  fail("built JavaScript contains unresolved PLASMO_PUBLIC env variable")
}
if (jsText.includes("photoSweepDevEntitlement") && process.env.PHOTOSWEEP_AUDIT_STRICT_DEV_KEY_ABSENCE === "1") {
  fail("built JavaScript contains photoSweepDevEntitlement while strict absence is required")
}

if (process.exitCode) process.exit(process.exitCode)
console.log(JSON.stringify({
  ok: true,
  buildDir,
  manifestVersion: manifest.manifest_version,
  sidePanel: manifest.side_panel?.default_path,
  backendHostPermission: expectedHostPermission,
  hostPermissionCount: hostPermissions.length,
  jsFileCount: jsFiles.length
}, null, 2))
