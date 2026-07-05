import { describe, expect, it } from "vitest"

import packageJson from "../package.json"

describe("extension manifest", () => {
  it("uses an injected license API origin for release packages", () => {
    expect(packageJson.manifest.host_permissions).toContain(
      "$PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_HOST_PERMISSION"
    )
  })

  it("keeps extension pages on bundled scripts only", () => {
    expect(packageJson.manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    )
    expect(
      packageJson.manifest.content_security_policy.extension_pages
    ).not.toMatch(/https?:|blob:|data:/)
  })

  it("does not expose remote executable JavaScript as web-accessible resources", () => {
    const resources = packageJson.manifest.web_accessible_resources.flatMap(
      (entry) => entry.resources
    )

    expect(resources).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^https?:/)])
    )
    expect(resources).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\/\/.*\.js(?:\?|$)/)])
    )
  })
})
