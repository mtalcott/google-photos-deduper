import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  chromeWebStoreReviewUrl,
  completeRatingPrompt,
  deferRatingPrompt,
  RATING_PROMPT_STORAGE_KEY,
  recordSuccessfulScan
} from "../../lib/rating-prompt"

let store: Record<string, unknown> = {}

const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items)
  })
}

vi.stubGlobal("chrome", { storage: { local: mockStorage } })

beforeEach(() => {
  store = {}
  vi.clearAllMocks()
})

describe("rating prompt state", () => {
  it("becomes eligible after the first newly completed scan", async () => {
    await expect(recordSuccessfulScan()).resolves.toBe(true)
    expect(store[RATING_PROMPT_STORAGE_KEY]).toEqual({
      successfulScans: 1,
      nextPromptAt: 1,
      completed: false
    })
  })

  it("waits three additional successful scans after Maybe later", async () => {
    await recordSuccessfulScan()
    await deferRatingPrompt()

    await expect(recordSuccessfulScan()).resolves.toBe(false)
    await expect(recordSuccessfulScan()).resolves.toBe(false)
    await expect(recordSuccessfulScan()).resolves.toBe(true)
  })

  it("never prompts again after review or permanent dismissal", async () => {
    await recordSuccessfulScan()
    await completeRatingPrompt()

    await expect(recordSuccessfulScan()).resolves.toBe(false)
  })

  it("builds the official direct review-page URL", () => {
    expect(chromeWebStoreReviewUrl("abcdefghijklmnop")).toBe(
      "https://chrome.google.com/webstore/detail/abcdefghijklmnop/reviews"
    )
  })
})
