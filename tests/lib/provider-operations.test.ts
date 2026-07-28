import { describe, expect, it } from "vitest"

import {
  getProviderOperations,
  providerBatchLimit,
  providerFromUrl,
  providerLabel
} from "../../lib/provider-operations"
import { DEFAULT_SETTINGS } from "../../lib/types"

describe("provider operations", () => {
  it.each([
    ["https://photos.google.com/u/0/", "google"],
    ["https://www.icloud.com/photos/", "icloud"],
    ["https://www.icloud.com.cn/photos/", "icloud"],
    ["https://www.amazon.ca/photos?sf=1", "amazon"]
  ] as const)("resolves %s to the %s adapter", (url, provider) => {
    expect(providerFromUrl(url)).toBe(provider)
  })

  it("keeps Amazon navigation on a supported regional origin", () => {
    expect(
      getProviderOperations("amazon").openUrl("https://www.amazon.ca")
    ).toBe("https://www.amazon.ca/photos?sf=1")
    expect(
      getProviderOperations("amazon").openUrl("https://malicious.example")
    ).toBe("https://www.amazon.com/photos?sf=1")
  })

  it("distinguishes a provider tab from its photos page", () => {
    const amazon = getProviderOperations("amazon")
    expect(amazon.matchesUrl("https://www.amazon.com/orders")).toBe(true)
    expect(amazon.matchesUrl("https://www.amazon.com/orders", true)).toBe(false)
  })

  it("owns provider-specific batch limits and capabilities", () => {
    expect(
      providerBatchLimit({
        ...DEFAULT_SETTINGS,
        sourceProvider: "amazon",
        amazonBatchLimit: 25.9
      })
    ).toBe(25)
    expect(getProviderOperations("google").supportsAlbumScope).toBe(true)
    expect(getProviderOperations("icloud").injectBridgeIntoAllFrames).toBe(true)
  })

  it("provides one canonical label", () => {
    expect(providerLabel(undefined)).toBe("Google Photos")
    expect(providerLabel("icloud")).toBe("iCloud Photos")
  })
})
