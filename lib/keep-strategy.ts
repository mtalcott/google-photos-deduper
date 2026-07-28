import type { DuplicateGroup, GpdMediaItem } from "./types"
import { classifyDuplicateItems } from "./duplicate-classifier"

export type KeepStrategy =
  | "best_quality"
  | "largest_resolution"
  | "newest_taken"
  | "oldest_taken"
  | "newest_upload"
  | "non_storage_counting"

export const KEEP_STRATEGY_LABELS: Record<KeepStrategy, string> = {
  best_quality: "Best quality",
  largest_resolution: "Largest resolution",
  newest_taken: "Newest taken date",
  oldest_taken: "Oldest taken date",
  newest_upload: "Newest upload date",
  non_storage_counting: "Non-storage-counting"
}

function qualityScore(item: GpdMediaItem): number {
  return item.isOriginalQuality === true
    ? 2
    : item.isOriginalQuality === false
      ? 0
      : 1
}

function pixels(item: GpdMediaItem): number {
  return (item.resWidth ?? 0) * (item.resHeight ?? 0)
}

function timeValue(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback
}

function compareOldestTime(
  a: number | undefined,
  b: number | undefined
): number {
  const hasA = Number.isFinite(a)
  const hasB = Number.isFinite(b)
  if (!hasA && !hasB) return 0
  if (!hasA) return 1
  if (!hasB) return -1
  return a! - b!
}

function storageScore(item: GpdMediaItem): number {
  return item.takesUpSpace === false ? 2 : item.takesUpSpace === true ? 0 : 1
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
}

export function metadataScore(item: GpdMediaItem): number {
  return [
    item.timestamp,
    item.creationTimestamp,
    item.fileName,
    item.size,
    item.resWidth,
    item.resHeight,
    item.takesUpSpace,
    item.spaceTaken,
    item.isOwned,
    item.isOriginalQuality,
    item.duration,
    item.productUrl
  ].filter(hasValue).length
}

export function chooseExactPairMetadataKeepItem(
  items: GpdMediaItem[]
): GpdMediaItem | null {
  if (items.length !== 2) return null
  if (classifyDuplicateItems(items).duplicateKind !== "exact") return null
  const scoreDiff = metadataScore(items[1]) - metadataScore(items[0])
  if (scoreDiff === 0) return null
  return scoreDiff > 0 ? items[1] : items[0]
}

function compareFallback(a: GpdMediaItem, b: GpdMediaItem): number {
  const qualityDiff = qualityScore(b) - qualityScore(a)
  if (qualityDiff !== 0) return qualityDiff
  const takenDiff = compareOldestTime(a.timestamp, b.timestamp)
  if (takenDiff !== 0) return takenDiff
  const pixelDiff = pixels(b) - pixels(a)
  if (pixelDiff !== 0) return pixelDiff
  return (
    compareOldestTime(a.creationTimestamp, b.creationTimestamp)
  )
}

export function chooseKeepItem(
  items: GpdMediaItem[],
  strategy: KeepStrategy
): GpdMediaItem | null {
  if (items.length === 0) return null
  const exactPairMetadataKeep = chooseExactPairMetadataKeepItem(items)
  if (exactPairMetadataKeep) return exactPairMetadataKeep

  const sorted = [...items].sort((a, b) => {
    switch (strategy) {
      case "best_quality":
        return compareFallback(a, b)
      case "largest_resolution": {
        const pixelDiff = pixels(b) - pixels(a)
        return pixelDiff !== 0 ? pixelDiff : compareFallback(a, b)
      }
      case "newest_taken": {
        const dateDiff =
          timeValue(b.timestamp, Number.NEGATIVE_INFINITY) -
          timeValue(a.timestamp, Number.NEGATIVE_INFINITY)
        return dateDiff !== 0 ? dateDiff : compareFallback(a, b)
      }
      case "oldest_taken": {
        const dateDiff = compareOldestTime(a.timestamp, b.timestamp)
        return dateDiff !== 0 ? dateDiff : compareFallback(a, b)
      }
      case "newest_upload": {
        const dateDiff =
          timeValue(b.creationTimestamp, Number.NEGATIVE_INFINITY) -
          timeValue(a.creationTimestamp, Number.NEGATIVE_INFINITY)
        return dateDiff !== 0 ? dateDiff : compareFallback(a, b)
      }
      case "non_storage_counting": {
        const storageDiff = storageScore(b) - storageScore(a)
        return storageDiff !== 0 ? storageDiff : compareFallback(a, b)
      }
      default:
        return compareFallback(a, b)
    }
  })

  return sorted[0]
}

export function selectDefaultKeep(items: GpdMediaItem[]): string {
  const selected = chooseKeepItem(items, "best_quality")
  if (!selected) throw new Error("Cannot select a keep item from an empty group")
  return selected.mediaKey
}

export function chooseKeepKeyForGroup(
  group: DuplicateGroup,
  mediaItems: Record<string, GpdMediaItem>,
  strategy: KeepStrategy
): string | null {
  const items = group.mediaKeys
    .map((key) => mediaItems[key])
    .filter((item): item is GpdMediaItem => !!item)
  return chooseKeepItem(items, strategy)?.mediaKey ?? null
}
