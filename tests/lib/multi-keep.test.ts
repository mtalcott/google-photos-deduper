import { describe, expect, it } from "vitest"

import {
  DuplicateReviewSession,
  type DuplicateReviewSelections
} from "../../lib/duplicate-review-session"
import type { DuplicateGroup, GpdMediaItem } from "../../lib/types"

function makeGroup(id: string, ...mediaKeys: string[]): DuplicateGroup {
  return { id, mediaKeys, originalMediaKey: mediaKeys[0], similarity: 0.99 }
}

function makeMediaItems(...mediaKeys: string[]): Record<string, GpdMediaItem> {
  return Object.fromEntries(
    mediaKeys.map((mediaKey) => [
      mediaKey,
      {
        mediaKey,
        dedupKey: `dedup-${mediaKey}`,
        thumb: `thumb-${mediaKey}`,
        timestamp: 1,
        creationTimestamp: 1
      }
    ])
  )
}

const g1 = makeGroup("g1", "img1", "img2", "img3")
const g2 = makeGroup("g2", "img4", "img5")
const mediaItems = makeMediaItems("img1", "img2", "img3", "img4", "img5")

function session(selections?: DuplicateReviewSelections) {
  return new DuplicateReviewSession({
    groups: [g1, g2],
    mediaItems,
    selections
  })
}

describe("DuplicateReviewSession", () => {
  it("uses the default keep choice and accepts it as an explicit decision", () => {
    const review = session()

    expect(review.keptFor(g1)).toEqual(new Set(["img1"]))
    const accepted = review.update({
      type: "toggle_kept",
      groupId: "g1",
      mediaKey: "img1"
    })
    expect(accepted.selectedGroupIds).toEqual(new Set(["g1"]))
    expect(accepted.reviewedGroupIds).toEqual(new Set(["g1"]))
    expect(accepted.keptOverrides.g1).toEqual(new Set(["img1"]))
  })

  it("adds and removes additional kept items without changing other groups", () => {
    const first = session()
    const afterAdd = first.update({
      type: "toggle_kept",
      groupId: "g1",
      mediaKey: "img2"
    })
    const second = session(afterAdd)
    const afterRemove = second.update({
      type: "toggle_kept",
      groupId: "g1",
      mediaKey: "img2"
    })

    expect(afterAdd.keptOverrides.g1).toEqual(new Set(["img1", "img2"]))
    expect(afterRemove.keptOverrides.g1).toEqual(new Set(["img1"]))
    expect(second.keptFor(g2)).toEqual(new Set(["img4"]))
  })

  it("counts trash candidates through the session interface", () => {
    const review = session({
      selectedGroupIds: new Set(["g1", "g2"]),
      reviewedGroupIds: new Set(["g1", "g2"]),
      keptOverrides: { g1: new Set(["img1", "img2"]) }
    })

    expect(review.duplicateCount()).toBe(2)
    expect(review.trashPlan()).toMatchObject({
      mediaKeysToTrash: ["img3", "img5"],
      dedupKeys: ["dedup-img3", "dedup-img5"],
      provider: "google"
    })
  })

  it("allows explicitly trashing every copy in a group", () => {
    const selections = session().update({
      type: "trash_all_copies",
      groupId: "g1"
    })
    const review = session(selections)

    expect(review.keptFor(g1)).toEqual(new Set())
    expect(review.duplicateCount()).toBe(3)
  })

  it("sanitizes restored selections against the current groups", () => {
    const review = session({
      selectedGroupIds: new Set(["g1", "missing"]),
      reviewedGroupIds: new Set(["g1", "g2", "missing"]),
      keptOverrides: {
        g1: new Set(["img2", "missing"]),
        missing: new Set(["other"])
      }
    })

    expect(review.serialize()).toEqual({
      selectedGroupIds: ["g1"],
      reviewedGroupIds: ["g1", "g2"],
      keptOverrides: { g1: ["img2"] }
    })
  })

  it("builds review and delete reports from the same keep/trash truth", () => {
    const review = session({
      selectedGroupIds: new Set(["g1"]),
      reviewedGroupIds: new Set(["g1"]),
      keptOverrides: { g1: new Set(["img1", "img2"]) }
    })
    const plan = review.trashPlan()
    const reviewReport = review.reviewReport()
    const deleteReport = review.deleteReport({
      plan,
      trashBatchSize: 25
    })

    expect(reviewReport.totalItemsSelectedForTrash).toBe(1)
    expect(deleteReport.totalItemsSelectedForTrash).toBe(1)
    expect(
      deleteReport.items.find((item) => item.action === "trash")?.mediaKey
    ).toBe("img3")
  })

  it("starts neutral and records explicit include and skip decisions", () => {
    const initial = session()
    expect(initial.selectedGroupIds).toEqual(new Set())
    expect(initial.reviewedGroupIds).toEqual(new Set())

    const included = session(
      initial.update({ type: "select_groups", groupIds: ["g1"] })
    )
    expect(included.selectedGroupIds).toEqual(new Set(["g1"]))
    expect(included.reviewedGroupIds).toEqual(new Set(["g1"]))

    const skipped = session(
      included.update({ type: "deselect_groups", groupIds: ["g2"] })
    )
    expect(skipped.selectedGroupIds).toEqual(new Set(["g1"]))
    expect(skipped.reviewedGroupIds).toEqual(new Set(["g1", "g2"]))
  })
})
