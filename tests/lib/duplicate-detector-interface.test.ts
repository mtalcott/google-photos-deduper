import { beforeEach, describe, expect, it, vi } from "vitest"

import { DuplicateDetectionEngine } from "../../lib/duplicate-detector"
import type { DuplicateGroup, GpdMediaItem } from "../../lib/types"

const { fullDetectDuplicates, smartDetectDuplicates } = vi.hoisted(() => ({
  fullDetectDuplicates: vi.fn(),
  smartDetectDuplicates: vi.fn()
}))

vi.mock("../../lib/duplicate-detection-engine", () => ({
  FULL_SCAN_BLOCK_SIZE: 1000,
  fullDetectDuplicates,
  smartDetectDuplicates
}))

const mediaItems: GpdMediaItem[] = [
  {
    mediaKey: "one",
    dedupKey: "dedup-one",
    thumb: "thumb-one",
    timestamp: 1,
    creationTimestamp: 1
  }
]
const groups: DuplicateGroup[] = [
  {
    id: "group",
    mediaKeys: ["one"],
    originalMediaKey: "one",
    similarity: 1
  }
]

describe("DuplicateDetectionEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fullDetectDuplicates.mockResolvedValue({ groups, timing: {} })
    smartDetectDuplicates.mockResolvedValue(groups)
  })

  it("routes smart detection through one production interface", async () => {
    const engine = new DuplicateDetectionEngine()

    await expect(
      engine.detect({
        mode: "smart",
        mediaItems,
        threshold: 0.95,
        smartWindowMs: 2000
      })
    ).resolves.toBe(groups)

    expect(smartDetectDuplicates).toHaveBeenCalledWith(
      mediaItems,
      0.95,
      2000,
      undefined,
      undefined,
      undefined,
      undefined
    )
    expect(fullDetectDuplicates).not.toHaveBeenCalled()
  })

  it("returns full detection groups without leaking timing internals", async () => {
    const engine = new DuplicateDetectionEngine()

    await expect(
      engine.detect({
        mode: "full",
        mediaItems,
        threshold: 0.99
      })
    ).resolves.toBe(groups)

    expect(fullDetectDuplicates).toHaveBeenCalledOnce()
    expect(smartDetectDuplicates).not.toHaveBeenCalled()
  })
})
