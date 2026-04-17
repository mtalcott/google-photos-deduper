import type { DuplicateGroup, GpdMediaItem } from "../../lib/types"

export function makeLargeResults({
  groupCount = 10_000,
  bigGroupItems = 100,
}: {
  groupCount?: number
  bigGroupItems?: number
} = {}): { groups: DuplicateGroup[]; mediaItems: Record<string, GpdMediaItem> } {
  const mediaItems: Record<string, GpdMediaItem> = {}
  const groups: DuplicateGroup[] = []

  // Group 0: big group with bigGroupItems items
  const bigMediaKeys: string[] = []
  for (let i = 0; i < bigGroupItems; i++) {
    const key = `m-0-${i}`
    bigMediaKeys.push(key)
    mediaItems[key] = makeItem(key)
  }
  groups.push({
    id: "g-0",
    mediaKeys: bigMediaKeys,
    originalMediaKey: bigMediaKeys[0],
    similarity: 0.99,
  })

  // Groups 1..groupCount-1: each with 2 items
  for (let g = 1; g < groupCount; g++) {
    const k0 = `m-${g}-0`
    const k1 = `m-${g}-1`
    mediaItems[k0] = makeItem(k0)
    mediaItems[k1] = makeItem(k1)
    groups.push({
      id: `g-${g}`,
      mediaKeys: [k0, k1],
      originalMediaKey: k0,
      similarity: 0.95,
    })
  }

  return { groups, mediaItems }
}

function makeItem(mediaKey: string): GpdMediaItem {
  return {
    mediaKey,
    dedupKey: `dk-${mediaKey}`,
    thumb: "https://example.com/thumb",
    productUrl: `https://photos.google.com/photo/${mediaKey}`,
    timestamp: 1695513600000,
    creationTimestamp: 1695513600000,
    resWidth: 1920,
    resHeight: 1080,
    fileName: `${mediaKey}.jpg`,
    isOwned: true,
  }
}
