import { describe, expect, it } from "vitest"

import { StoredReviewScope } from "../../lib/stored-review-scope"
import { DEFAULT_SETTINGS, type StoredState } from "../../lib/types"

function adapter(seed: Partial<StoredState> = {}) {
  const values: Record<string, unknown> = { ...seed }
  return {
    values,
    scope: new StoredReviewScope({
      async get() {
        return values as Partial<StoredState>
      },
      async set(next) {
        Object.assign(values, next)
      },
      async remove(keys) {
        for (const key of keys) delete values[key]
      }
    })
  }
}

const mediaItems = {
  keep: {
    mediaKey: "keep",
    dedupKey: "dedup-keep",
    thumb: "keep",
    timestamp: 1,
    creationTimestamp: 1
  },
  trash: {
    mediaKey: "trash",
    dedupKey: "dedup-trash",
    thumb: "trash",
    timestamp: 1,
    creationTimestamp: 2
  }
}
const groups = [
  {
    id: "group",
    mediaKeys: ["keep", "trash"],
    originalMediaKey: "keep",
    similarity: 1
  }
]

describe("StoredReviewScope", () => {
  it("restores and sanitizes review decisions through Duplicate Review Session", async () => {
    const subject = adapter({
      settings: { ...DEFAULT_SETTINGS, similarityThreshold: 0.98 },
      scanResults: {
        mediaItems,
        groups,
        scanDate: 1,
        totalItems: 2,
        accountEmail: "buyer@example.com",
        sourceProvider: "google"
      },
      selections: {
        selectedGroupIds: ["group", "stale"],
        reviewedGroupIds: ["group", "stale"],
        keptOverrides: { group: ["keep"], stale: ["missing"] }
      }
    })

    const restored = await subject.scope.restore({
      fallbackSettings: DEFAULT_SETTINGS,
      accountEmail: "buyer@example.com"
    })

    expect([...restored.selections!.selectedGroupIds]).toEqual(["group"])
    expect([...restored.selections!.reviewedGroupIds]).toEqual(["group"])
    expect(subject.values.selections).toEqual({
      selectedGroupIds: ["group"],
      reviewedGroupIds: ["group"],
      keptOverrides: { group: ["keep"] }
    })
  })

  it("removes review material from a different account", async () => {
    const subject = adapter({
      settings: DEFAULT_SETTINGS,
      scanResults: {
        mediaItems,
        groups,
        scanDate: 1,
        totalItems: 2,
        accountEmail: "old@example.com",
        sourceProvider: "google"
      },
      selections: {
        selectedGroupIds: ["group"],
        reviewedGroupIds: ["group"],
        keptOverrides: {}
      }
    })

    const restored = await subject.scope.restore({
      fallbackSettings: DEFAULT_SETTINGS,
      accountEmail: "new@example.com"
    })

    expect(restored.staleReviewRemoved).toBe(true)
    expect(restored.scanResults).toBeNull()
    expect(subject.values).not.toHaveProperty("scanResults")
    expect(subject.values).not.toHaveProperty("selections")
  })

  it("applies the side-panel Photo Provider to restored settings", async () => {
    const subject = adapter({
      settings: {
        ...DEFAULT_SETTINGS,
        sourceProvider: "google",
        albumScope: { mediaKey: "album", title: "Album" }
      }
    })

    const restored = await subject.scope.restore({
      fallbackSettings: DEFAULT_SETTINGS,
      hostProvider: "icloud"
    })

    expect(restored.settings.sourceProvider).toBe("icloud")
    expect(restored.settings.albumScope).toBeUndefined()
  })

  it("writes and removes stored artifacts through one interface", async () => {
    const subject = adapter()

    await subject.scope.write({
      settings: DEFAULT_SETTINGS,
      selections: {
        selectedGroupIds: [],
        reviewedGroupIds: [],
        keptOverrides: {}
      }
    })
    await subject.scope.write({ selections: null })

    expect(subject.values.settings).toEqual(DEFAULT_SETTINGS)
    expect(subject.values).not.toHaveProperty("selections")
  })

  it("prevents stale effects from recreating an invalidated review", async () => {
    const subject = adapter({
      scanResults: {
        mediaItems,
        groups,
        scanDate: 1,
        totalItems: 2,
        accountEmail: "old@example.com",
        sourceProvider: "google"
      }
    })

    await subject.scope.invalidateReview()
    await subject.scope.write({
      scanResults: {
        mediaItems,
        groups,
        scanDate: 2,
        totalItems: 2,
        accountEmail: "old@example.com",
        sourceProvider: "google"
      },
      selections: {
        selectedGroupIds: ["group"],
        reviewedGroupIds: ["group"],
        keptOverrides: {}
      }
    })

    expect(subject.values).not.toHaveProperty("scanResults")
    expect(subject.values).not.toHaveProperty("selections")

    subject.scope.startReview()
    await subject.scope.write({
      scanResults: {
        mediaItems,
        groups,
        scanDate: 3,
        totalItems: 2,
        accountEmail: "new@example.com",
        sourceProvider: "google"
      }
    })

    expect(subject.values.scanResults).toMatchObject({
      scanDate: 3,
      accountEmail: "new@example.com"
    })
  })
})
