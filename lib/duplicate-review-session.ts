import { buildDeleteReport, type DeleteReport } from "./delete-report"
import {
  chooseKeepKeyForGroup,
  selectDefaultKeep,
  type KeepStrategy
} from "./keep-strategy"
import { buildReviewReport, type ReviewReport } from "./review-report"
import type { DuplicateGroup, GpdMediaItem, PhotoProvider } from "./types"

export interface DuplicateReviewSelections {
  selectedGroupIds: Set<string>
  reviewedGroupIds: Set<string>
  keptOverrides: Record<string, Set<string>>
}

export interface StoredDuplicateReviewSelections {
  selectedGroupIds: string[]
  reviewedGroupIds: string[]
  keptOverrides: Record<string, string[]>
}

export interface DuplicateTrashPlan {
  dedupKeys: string[]
  mediaKeysToTrash: string[]
  provider: PhotoProvider
  icloudAssetRefs?: NonNullable<GpdMediaItem["icloudAsset"]>[]
}

export type DuplicateReviewAction =
  | { type: "select_groups"; groupIds: Iterable<string> }
  | { type: "deselect_groups"; groupIds: Iterable<string> }
  | { type: "toggle_kept"; groupId: string; mediaKey: string }
  | { type: "trash_all_copies"; groupId: string }
  | {
      type: "apply_keep_strategy"
      groupIds: Iterable<string>
      strategy: KeepStrategy
    }
  | { type: "replace"; selections: DuplicateReviewSelections }
  | { type: "clear" }

interface DuplicateReviewSessionParams {
  groups: DuplicateGroup[]
  mediaItems: Record<string, GpdMediaItem>
  selections?: DuplicateReviewSelections
}

function cloneSelections(
  selections: DuplicateReviewSelections
): DuplicateReviewSelections {
  return {
    selectedGroupIds: new Set(selections.selectedGroupIds),
    reviewedGroupIds: new Set(selections.reviewedGroupIds),
    keptOverrides: Object.fromEntries(
      Object.entries(selections.keptOverrides).map(([groupId, keys]) => [
        groupId,
        new Set(keys)
      ])
    )
  }
}

function defaultSelections(): DuplicateReviewSelections {
  return {
    selectedGroupIds: new Set(),
    reviewedGroupIds: new Set(),
    keptOverrides: {}
  }
}

export class DuplicateReviewSession {
  readonly selections: DuplicateReviewSelections
  readonly selectedGroupIds: Set<string>
  readonly reviewedGroupIds: Set<string>
  readonly keptByGroupId: Map<string, Set<string>>

  private readonly groups: DuplicateGroup[]
  private readonly mediaItems: Record<string, GpdMediaItem>
  private readonly groupsById: Map<string, DuplicateGroup>

  constructor(params: DuplicateReviewSessionParams) {
    this.groups = params.groups
    this.mediaItems = params.mediaItems
    this.groupsById = new Map(params.groups.map((group) => [group.id, group]))
    this.selections = this.sanitize(params.selections ?? defaultSelections())
    this.selectedGroupIds = this.selections.selectedGroupIds
    this.reviewedGroupIds = this.selections.reviewedGroupIds
    this.keptByGroupId = new Map(
      this.groups.map((group) => [group.id, this.resolveKept(group)])
    )
  }

  update(action: DuplicateReviewAction): DuplicateReviewSelections {
    const current = cloneSelections(this.selections)

    switch (action.type) {
      case "select_groups":
        for (const groupId of action.groupIds) {
          if (this.groupsById.has(groupId)) {
            current.selectedGroupIds.add(groupId)
            current.reviewedGroupIds.add(groupId)
          }
        }
        break
      case "deselect_groups":
        for (const groupId of action.groupIds) {
          current.selectedGroupIds.delete(groupId)
          if (this.groupsById.has(groupId))
            current.reviewedGroupIds.add(groupId)
        }
        break
      case "toggle_kept": {
        const group = this.groupsById.get(action.groupId)
        if (!group || !group.mediaKeys.includes(action.mediaKey)) break
        const kept = new Set(this.resolveKept(group))
        if (kept.has(action.mediaKey) && kept.size === 1) {
          current.selectedGroupIds.add(group.id)
          current.reviewedGroupIds.add(group.id)
          current.keptOverrides[group.id] = kept
          break
        }
        if (kept.has(action.mediaKey)) kept.delete(action.mediaKey)
        else kept.add(action.mediaKey)
        current.selectedGroupIds.add(group.id)
        current.reviewedGroupIds.add(group.id)
        current.keptOverrides[group.id] = kept
        break
      }
      case "trash_all_copies":
        if (this.groupsById.has(action.groupId)) {
          current.selectedGroupIds.add(action.groupId)
          current.reviewedGroupIds.add(action.groupId)
          current.keptOverrides[action.groupId] = new Set()
        }
        break
      case "apply_keep_strategy":
        for (const groupId of action.groupIds) {
          const group = this.groupsById.get(groupId)
          if (!group) continue
          const keepKey = chooseKeepKeyForGroup(
            group,
            this.mediaItems,
            action.strategy
          )
          if (keepKey) current.keptOverrides[groupId] = new Set([keepKey])
        }
        break
      case "replace":
        return this.sanitize(action.selections)
      case "clear":
        return defaultSelections()
    }

    return current
  }

  keptFor(group: DuplicateGroup): Set<string> {
    return this.keptByGroupId.get(group.id) ?? this.resolveKept(group)
  }

  duplicateCount(groups: DuplicateGroup[] = this.groups): number {
    return groups.reduce((count, group) => {
      if (!this.selectedGroupIds.has(group.id)) return count
      const kept = this.keptFor(group)
      return count + group.mediaKeys.filter((key) => !kept.has(key)).length
    }, 0)
  }

  reviewReport(groups: DuplicateGroup[] = this.groups): ReviewReport {
    return buildReviewReport({
      groups,
      mediaItems: this.mediaItems,
      selectedGroupIds: this.selectedGroupIds,
      getKept: (group) => this.keptFor(group)
    })
  }

  trashPlan(groups: DuplicateGroup[] = this.groups): DuplicateTrashPlan {
    const dedupKeys: string[] = []
    const mediaKeysToTrash: string[] = []

    for (const group of groups) {
      if (!this.selectedGroupIds.has(group.id)) continue
      const kept = this.keptFor(group)
      for (const mediaKey of group.mediaKeys) {
        if (kept.has(mediaKey)) continue
        const item = this.mediaItems[mediaKey]
        if (!item?.dedupKey) continue
        dedupKeys.push(item.dedupKey)
        mediaKeysToTrash.push(mediaKey)
      }
    }

    const provider =
      mediaKeysToTrash
        .map((key) => this.mediaItems[key]?.provider)
        .find((value): value is PhotoProvider => Boolean(value)) ?? "google"
    const icloudAssetRefs =
      provider === "icloud"
        ? mediaKeysToTrash
            .map((key) => this.mediaItems[key]?.icloudAsset)
            .filter(
              (asset): asset is NonNullable<GpdMediaItem["icloudAsset"]> =>
                Boolean(asset)
            )
        : undefined

    return {
      dedupKeys,
      mediaKeysToTrash,
      provider,
      ...(icloudAssetRefs ? { icloudAssetRefs } : {})
    }
  }

  deleteReport(params: {
    plan: DuplicateTrashPlan
    trashBatchSize: number
    groups?: DuplicateGroup[]
  }): DeleteReport {
    return buildDeleteReport({
      groups: params.groups ?? this.groups,
      mediaItems: this.mediaItems,
      selectedGroupIds: this.selectedGroupIds,
      getKept: (group) => this.keptFor(group),
      mediaKeysToTrash: params.plan.mediaKeysToTrash,
      trashBatchSize: params.trashBatchSize
    })
  }

  serialize(): StoredDuplicateReviewSelections {
    return {
      selectedGroupIds: [...this.selectedGroupIds],
      reviewedGroupIds: [...this.reviewedGroupIds],
      keptOverrides: Object.fromEntries(
        Object.entries(this.selections.keptOverrides).map(([groupId, keys]) => [
          groupId,
          [...keys]
        ])
      )
    }
  }

  private sanitize(
    selections: DuplicateReviewSelections
  ): DuplicateReviewSelections {
    const selectedGroupIds = new Set(
      [...selections.selectedGroupIds].filter((groupId) =>
        this.groupsById.has(groupId)
      )
    )
    const reviewedGroupIds = new Set(
      [...selections.reviewedGroupIds].filter((groupId) =>
        this.groupsById.has(groupId)
      )
    )
    const keptOverrides: Record<string, Set<string>> = {}

    for (const [groupId, keys] of Object.entries(selections.keptOverrides)) {
      const group = this.groupsById.get(groupId)
      if (!group) continue
      const validMediaKeys = new Set(group.mediaKeys)
      const filtered = [...keys].filter((key) => validMediaKeys.has(key))
      if (keys.size === 0 || filtered.length > 0) {
        keptOverrides[groupId] = new Set(filtered)
      }
    }

    return { selectedGroupIds, reviewedGroupIds, keptOverrides }
  }

  private resolveKept(group: DuplicateGroup): Set<string> {
    const override = this.selections.keptOverrides[group.id]
    if (override) return override
    const items = group.mediaKeys
      .map((key) => this.mediaItems[key])
      .filter((item): item is GpdMediaItem => Boolean(item))
    const defaultKey =
      items.length > 0 ? selectDefaultKeep(items) : group.originalMediaKey
    return new Set([defaultKey])
  }
}
