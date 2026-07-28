import { describe, expect, it } from "vitest"

import type { DeleteReport } from "../../lib/delete-report"
import { DuplicateReviewSession } from "../../lib/duplicate-review-session"
import {
  TrashLifecycle,
  type TrashAuditAdapter,
  type TrashUndoData
} from "../../lib/trash-lifecycle"
import type { TrashResultReport } from "../../lib/trash-result-report"
import type { DuplicateGroup, GpdMediaItem } from "../../lib/types"

function fixture() {
  const mediaItems: Record<string, GpdMediaItem> = {
    keep: {
      mediaKey: "keep",
      dedupKey: "dedup-keep",
      thumb: "keep",
      timestamp: 1,
      creationTimestamp: 1,
      provider: "google"
    },
    trash: {
      mediaKey: "trash",
      dedupKey: "dedup-trash",
      thumb: "trash",
      timestamp: 1,
      creationTimestamp: 2,
      provider: "google"
    }
  }
  const groups: DuplicateGroup[] = [
    {
      id: "group",
      mediaKeys: ["keep", "trash"],
      originalMediaKey: "keep",
      similarity: 1
    }
  ]
  const reviewSession = new DuplicateReviewSession({
    groups,
    mediaItems,
    selections: {
      selectedGroupIds: new Set(["group"]),
      reviewedGroupIds: new Set(["group"]),
      keptOverrides: { group: new Set(["keep"]) }
    }
  })
  return { groups, mediaItems, reviewSession }
}

function inMemoryAudit() {
  const deleteReports: DeleteReport[] = []
  const resultReports: TrashResultReport[] = []
  const adapter: TrashAuditAdapter = {
    async savePreTrashReport(report) {
      deleteReports.push(report)
    },
    async saveTrashResultReport(report) {
      resultReports.push(report)
    }
  }
  return { adapter, deleteReports, resultReports }
}

async function begin(lifecycle: TrashLifecycle) {
  const { groups, mediaItems, reviewSession } = fixture()
  const plan = reviewSession.trashPlan(groups)
  const command = await lifecycle.begin({
    plan,
    reviewSession,
    groups,
    snapshot: { mediaItems, groups, totalItems: 2 },
    batchPolicy: {
      batchSize: 25,
      batchPauseMs: 1000,
      retryCount: 2,
      retryBackoffMs: 1000
    }
  })
  return { command, plan }
}

describe("TrashLifecycle", () => {
  it("persists the pre-trash audit before exposing the provider command", async () => {
    const audit = inMemoryAudit()
    const lifecycle = new TrashLifecycle(audit.adapter)

    const { command } = await begin(lifecycle)

    expect(audit.deleteReports).toHaveLength(1)
    expect(command).toMatchObject({
      provider: "google",
      totalToTrash: 1,
      args: {
        dedupKeys: ["dedup-trash"],
        mediaKeysToTrash: ["trash"],
        batchSize: 25
      }
    })
  })

  it("reconciles a complete outcome with an undo snapshot", async () => {
    const audit = inMemoryAudit()
    const lifecycle = new TrashLifecycle(audit.adapter)
    await begin(lifecycle)

    const outcome = await lifecycle.reconcile({
      success: true,
      data: {
        trashedKeys: ["trash"],
        trashedDedupKeys: ["dedup-trash"]
      }
    })

    expect(outcome.kind).toBe("complete")
    expect(outcome.movedCount).toBe(1)
    expect(outcome.undo?.provider).toBe("google")
    expect(outcome.undo?.snapshot.totalItems).toBe(2)
    expect(audit.resultReports[0]).toMatchObject({
      status: "complete",
      attemptedMediaKeys: ["trash"],
      movedMediaKeys: ["trash"]
    })
  })

  it("keeps partial failure auditable and restorable", async () => {
    const audit = inMemoryAudit()
    const lifecycle = new TrashLifecycle(audit.adapter)
    await begin(lifecycle)

    const outcome = await lifecycle.reconcile({
      success: false,
      error: "provider stopped",
      data: {
        partial: true,
        trashedKeys: ["trash"],
        trashedDedupKeys: ["dedup-trash"],
        retryAttempts: 2
      }
    })

    expect(outcome).toMatchObject({
      kind: "partial",
      movedMediaKeys: ["trash"],
      movedCount: 1
    })
    if (outcome.kind !== "partial") throw new Error("expected partial outcome")
    expect(outcome.message).toContain("provider stopped")
    expect(audit.resultReports[0]).toMatchObject({
      status: "partial",
      retryAttempts: 2,
      error: "provider stopped"
    })
  })

  it("fails without creating undo when nothing moved", async () => {
    const audit = inMemoryAudit()
    const lifecycle = new TrashLifecycle(audit.adapter)
    await begin(lifecycle)

    const outcome = await lifecycle.reconcile({
      success: false,
      error: "nothing moved"
    })

    expect(outcome).toEqual({
      kind: "failed",
      movedMediaKeys: [],
      movedDedupKeys: [],
      movedCount: 0,
      error: "nothing moved",
      undo: null
    })
  })

  it("returns failed restore data only for the current request", () => {
    const audit = inMemoryAudit()
    const lifecycle = new TrashLifecycle(audit.adapter)
    const undo = {
      provider: "google",
      dedupKeys: ["dedup-trash"],
      count: 1,
      snapshot: {
        mediaItems: {},
        groups: [],
        totalItems: 2
      }
    } satisfies TrashUndoData

    const command = lifecycle.beginRestore(undo, "restore-current")

    expect(command.args.dedupKeys).toEqual(["dedup-trash"])
    expect(
      lifecycle.reconcileRestore({
        requestId: "restore-stale",
        success: false
      })
    ).toBeUndefined()
    expect(
      lifecycle.reconcileRestore({
        requestId: "restore-current",
        success: false
      })
    ).toBe(undo)
  })
})
