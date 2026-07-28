import type { DeleteReport } from "./delete-report"
import type {
  DuplicateReviewSession,
  DuplicateTrashPlan
} from "./duplicate-review-session"
import {
  buildTrashResultReport,
  type TrashResultReport
} from "./trash-result-report"
import type { DuplicateGroup, GpdMediaItem, PhotoProvider } from "./types"

export type IcloudAssetRef = NonNullable<GpdMediaItem["icloudAsset"]>

export interface TrashSnapshot {
  mediaItems: Record<string, GpdMediaItem>
  groups: DuplicateGroup[]
  totalItems: number
}

export interface TrashUndoData {
  provider: PhotoProvider
  dedupKeys: string[]
  count: number
  snapshot: TrashSnapshot
  icloudAssetRefs?: IcloudAssetRef[]
}

export interface TrashAuditAdapter {
  savePreTrashReport(report: DeleteReport): Promise<void>
  saveTrashResultReport(report: TrashResultReport): Promise<void>
}

export interface TrashBatchPolicy {
  batchSize: number
  batchPauseMs: number
  retryCount: number
  retryBackoffMs: number
}

export interface TrashCommand {
  provider: PhotoProvider
  totalToTrash: number
  args: {
    dedupKeys: string[]
    mediaKeysToTrash: string[]
    batchSize: number
    batchPauseMs: number
    retryCount: number
    retryBackoffMs: number
    icloudAssetRefs?: IcloudAssetRef[]
  }
}

export interface TrashProviderResultData {
  trashedKeys?: string[]
  trashedDedupKeys?: string[]
  requestedCount?: number
  icloudAssetRefs?: IcloudAssetRef[]
  dryRun?: boolean
  message?: string
  partial?: boolean
  retryAttempts?: number
}

export type TrashOutcome =
  | {
      kind: "dry_run"
      movedMediaKeys: []
      movedDedupKeys: []
      movedCount: 0
      message: string
      undo: null
    }
  | {
      kind: "complete" | "partial"
      movedMediaKeys: string[]
      movedDedupKeys: string[]
      movedCount: number
      message?: string
      undo: TrashUndoData | null
    }
  | {
      kind: "failed"
      movedMediaKeys: []
      movedDedupKeys: []
      movedCount: 0
      error: string
      undo: null
    }

interface PendingTrash {
  plan: DuplicateTrashPlan
  snapshot: TrashSnapshot
}

interface PendingRestore {
  requestId: string
  undo: TrashUndoData
}

export class TrashLifecycle {
  private pending: PendingTrash | null = null
  private pendingRestore: PendingRestore | null = null

  constructor(private readonly audit: TrashAuditAdapter) {}

  async begin(params: {
    plan: DuplicateTrashPlan
    reviewSession: DuplicateReviewSession
    groups: DuplicateGroup[]
    snapshot: TrashSnapshot
    batchPolicy: TrashBatchPolicy
  }): Promise<TrashCommand> {
    const report = params.reviewSession.deleteReport({
      groups: params.groups,
      plan: params.plan,
      trashBatchSize: params.batchPolicy.batchSize
    })
    await this.audit.savePreTrashReport(report)

    this.pending = {
      plan: params.plan,
      snapshot: params.snapshot
    }

    return {
      provider: params.plan.provider,
      totalToTrash: params.plan.dedupKeys.length,
      args: {
        dedupKeys: params.plan.dedupKeys,
        mediaKeysToTrash: params.plan.mediaKeysToTrash,
        batchSize: params.batchPolicy.batchSize,
        batchPauseMs: params.batchPolicy.batchPauseMs,
        retryCount: params.batchPolicy.retryCount,
        retryBackoffMs: params.batchPolicy.retryBackoffMs,
        ...(params.plan.icloudAssetRefs
          ? { icloudAssetRefs: params.plan.icloudAssetRefs }
          : {})
      }
    }
  }

  async reconcile(params: {
    success: boolean
    data?: TrashProviderResultData
    error?: string
  }): Promise<TrashOutcome> {
    const pending = this.pending
    const attemptedMediaKeys =
      pending?.plan.mediaKeysToTrash ?? params.data?.trashedKeys ?? []
    const attemptedDedupKeys =
      pending?.plan.dedupKeys ?? params.data?.trashedDedupKeys ?? []
    const movedMediaKeys = params.success
      ? params.data?.trashedKeys ?? attemptedMediaKeys
      : params.data?.trashedKeys ?? []
    const movedDedupKeys = params.success
      ? params.data?.trashedDedupKeys ?? attemptedDedupKeys
      : params.data?.trashedDedupKeys ?? []
    const error = params.error || "Trash failed"

    await this.audit.saveTrashResultReport(
      buildTrashResultReport({
        attemptedMediaKeys,
        attemptedDedupKeys,
        movedMediaKeys,
        movedDedupKeys,
        retryAttempts: params.data?.retryAttempts,
        ...(!params.success ? { error } : {})
      })
    )

    this.pending = null

    if (params.success && params.data?.dryRun) {
      const requestedCount =
        params.data.requestedCount ?? attemptedMediaKeys.length
      return {
        kind: "dry_run",
        movedMediaKeys: [],
        movedDedupKeys: [],
        movedCount: 0,
        message:
          params.data.message ??
          `iCloud delete dry-run completed for ${requestedCount.toLocaleString()} item${requestedCount === 1 ? "" : "s"}. Nothing was deleted.`,
        undo: null
      }
    }

    const movedCount = movedMediaKeys.length || movedDedupKeys.length
    if (movedCount > 0) {
      const undo =
        pending && attemptedDedupKeys.length > 0
          ? {
              provider: pending.plan.provider,
              dedupKeys: movedDedupKeys,
              count: movedCount,
              snapshot: pending.snapshot,
              ...(params.data?.icloudAssetRefs
                ? { icloudAssetRefs: params.data.icloudAssetRefs }
                : {})
            }
          : null
      return {
        kind: params.success ? "complete" : "partial",
        movedMediaKeys,
        movedDedupKeys,
        movedCount,
        ...(!params.success
          ? {
              message: `Moved ${movedMediaKeys.length.toLocaleString()} item${movedMediaKeys.length === 1 ? "" : "s"} before trash failed: ${error}`
            }
          : {}),
        undo
      }
    }

    return {
      kind: "failed",
      movedMediaKeys: [],
      movedDedupKeys: [],
      movedCount: 0,
      error,
      undo: null
    }
  }

  beginRestore(
    undo: TrashUndoData,
    requestId: string
  ): {
    provider: PhotoProvider
    args: {
      dedupKeys: string[]
      icloudAssetRefs?: IcloudAssetRef[]
    }
  } {
    this.pendingRestore = { undo, requestId }
    return {
      provider: undo.provider,
      args: {
        dedupKeys: undo.dedupKeys,
        ...(undo.icloudAssetRefs
          ? { icloudAssetRefs: undo.icloudAssetRefs }
          : {})
      }
    }
  }

  reconcileRestore(params: {
    requestId: string
    success: boolean
  }): TrashUndoData | null | undefined {
    if (params.requestId !== this.pendingRestore?.requestId) return undefined
    const undo = this.pendingRestore.undo
    this.pendingRestore = null
    return params.success ? null : undo
  }

  reset(): void {
    this.pending = null
    this.pendingRestore = null
  }
}
