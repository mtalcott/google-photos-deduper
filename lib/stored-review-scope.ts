import {
  DuplicateReviewSession,
  type DuplicateReviewSelections,
  type StoredDuplicateReviewSelections
} from "./duplicate-review-session"
import { SCAN_CHECKPOINT_KEY, type ScanCheckpoint } from "./scan-checkpoint"
import { areScanResultsValid } from "./scan-results"
import {
  DEFAULT_SETTINGS,
  type PhotoProvider,
  type ScanSettings,
  type StoredState
} from "./types"

export interface StoredReviewScopeAdapter {
  get(keys: string[]): Promise<Partial<StoredState>>
  set(values: Record<string, unknown>): Promise<void>
  remove(keys: string[]): Promise<void>
}

export interface StoredReviewScopePatch {
  settings?: ScanSettings
  checkpoint?: ScanCheckpoint | null
  scanResults?: StoredState["scanResults"] | null
  selections?: StoredDuplicateReviewSelections | null
}

export interface RestoredReviewScope {
  settings: ScanSettings
  checkpoint: ScanCheckpoint | null
  scanResults: StoredState["scanResults"] | null
  selections: DuplicateReviewSelections | null
  staleReviewRemoved: boolean
}

function hasDateRange(settings: ScanSettings): boolean {
  return Boolean(settings.dateRange?.from || settings.dateRange?.to)
}

function hasAlbumScope(settings: ScanSettings): boolean {
  return Boolean(settings.albumScope?.mediaKey)
}

function normalizeStoredSettings(settings: ScanSettings): ScanSettings {
  const isOldUntouchedDefault =
    settings.scanMode === "smart" &&
    settings.similarityThreshold === 0.99 &&
    (settings.smartWindowSec ?? 1) === 1 &&
    !hasDateRange(settings) &&
    !hasAlbumScope(settings)
  if (isOldUntouchedDefault) return DEFAULT_SETTINGS
  return {
    ...settings,
    sourceProvider: settings.sourceProvider ?? "google",
    exactOnly: settings.exactOnly ?? false,
    protectFavorites: settings.protectFavorites ?? true
  }
}

function deserializeSelections(
  value: unknown
): DuplicateReviewSelections | null {
  if (!value || typeof value !== "object") return null
  const raw = value as {
    selectedGroupIds?: unknown
    reviewedGroupIds?: unknown
    keptOverrides?: unknown
  }
  const selectedGroupIds = Array.isArray(raw.selectedGroupIds)
    ? raw.selectedGroupIds.filter((id): id is string => typeof id === "string")
    : []
  const keptOverrides: Record<string, Set<string>> = {}
  if (raw.keptOverrides && typeof raw.keptOverrides === "object") {
    for (const [groupId, mediaKeys] of Object.entries(
      raw.keptOverrides as Record<string, unknown>
    )) {
      if (!Array.isArray(mediaKeys)) continue
      keptOverrides[groupId] = new Set(
        mediaKeys.filter((key): key is string => typeof key === "string")
      )
    }
  }
  const reviewedGroupIds = Array.isArray(raw.reviewedGroupIds)
    ? raw.reviewedGroupIds.filter((id): id is string => typeof id === "string")
    : [...new Set([...selectedGroupIds, ...Object.keys(keptOverrides)])]
  return {
    selectedGroupIds: new Set(selectedGroupIds),
    reviewedGroupIds: new Set(reviewedGroupIds),
    keptOverrides
  }
}

export class StoredReviewScope {
  private reviewWritesSuppressed = false

  constructor(private readonly adapter: StoredReviewScopeAdapter) {}

  async restore(params: {
    fallbackSettings: ScanSettings
    hostProvider?: PhotoProvider | null
    accountEmail?: string
  }): Promise<RestoredReviewScope> {
    const stored = await this.adapter.get([
      "settings",
      "scanResults",
      "selections",
      SCAN_CHECKPOINT_KEY
    ])
    const restoredSettings = stored.settings
      ? normalizeStoredSettings(stored.settings)
      : params.fallbackSettings
    const settings = params.hostProvider
      ? {
          ...restoredSettings,
          sourceProvider: params.hostProvider,
          albumScope:
            params.hostProvider === "google"
              ? restoredSettings.albumScope
              : undefined
        }
      : restoredSettings
    const scanResultsValid =
      !stored.scanResults ||
      params.accountEmail === undefined ||
      areScanResultsValid(stored.scanResults, {
        accountEmail: params.accountEmail,
        sourceProvider: settings.sourceProvider ?? "google"
      })

    if (!scanResultsValid) {
      await this.invalidateReview()
      return {
        settings,
        checkpoint: stored.scanCheckpoint ?? null,
        scanResults: null,
        selections: null,
        staleReviewRemoved: true
      }
    }

    const deserialized = deserializeSelections(stored.selections)
    let selections = deserialized
    if (deserialized && stored.scanResults?.groups) {
      const session = new DuplicateReviewSession({
        groups: stored.scanResults.groups,
        mediaItems: stored.scanResults.mediaItems ?? {},
        selections: deserialized
      })
      selections = session.selections
      await this.write({ selections: session.serialize() })
    }

    return {
      settings,
      checkpoint: stored.scanCheckpoint ?? null,
      scanResults: stored.scanResults ?? null,
      selections,
      staleReviewRemoved: false
    }
  }

  async write(patch: StoredReviewScopePatch): Promise<void> {
    const values: Record<string, unknown> = {}
    const remove: string[] = []

    const assign = (key: string, value: unknown): void => {
      if (value === undefined) return
      if (value === null) remove.push(key)
      else values[key] = value
    }
    assign("settings", patch.settings)
    assign(SCAN_CHECKPOINT_KEY, patch.checkpoint)
    if (
      !this.reviewWritesSuppressed ||
      patch.scanResults === null
    ) {
      assign("scanResults", patch.scanResults)
    }
    if (
      !this.reviewWritesSuppressed ||
      patch.selections === null
    ) {
      assign("selections", patch.selections)
    }

    if (Object.keys(values).length > 0) await this.adapter.set(values)
    if (remove.length > 0) await this.adapter.remove(remove)
  }

  async invalidateReview(): Promise<void> {
    this.reviewWritesSuppressed = true
    await this.write({ scanResults: null, selections: null })
  }

  startReview(): void {
    this.reviewWritesSuppressed = false
  }
}
