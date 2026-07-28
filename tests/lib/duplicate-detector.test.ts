import { afterEach, describe, expect, it, vi } from "vitest"

import {
  blockPairCountForItems,
  communityDetection,
  computeEmbeddings,
  findDedupKeyDuplicateGroups,
  findExactContentDuplicateGroups,
  findVideoMetadataDuplicateGroups,
  findVideoPosterDuplicateGroups,
  fullDetectDuplicates,
  groupByProviderSequence,
  groupByTimestamp,
  matMul,
  mergeDuplicateItemGroups,
  shouldCompareSmartTimestamps,
  smartDetectDuplicates,
  smartScanEmbeddingCandidates,
  topK,
  withinGroupDuplicates
} from "../../lib/duplicate-detection-engine"
import { selectDefaultKeep } from "../../lib/keep-strategy"
import type { GpdMediaItem } from "../../lib/types"

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================
// Helpers
// ============================================================

/** Create a unit vector with 1.0 at dimension `axis` and 0 elsewhere. */
function unitVector(dim: number, axis: number): Float32Array {
  const v = new Float32Array(dim)
  v[axis] = 1.0
  return v
}

/** L2-normalize a vector in place. */
function l2normalize(v: Float32Array): Float32Array {
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm)
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

/** Add small Gaussian-ish noise to a vector without changing its direction much. */
function addNoise(v: Float32Array, scale: number): Float32Array {
  const noisy = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) {
    noisy[i] = v[i] + (Math.random() - 0.5) * scale
  }
  return l2normalize(noisy)
}

// ============================================================
// topK
// ============================================================

describe("topK", () => {
  it("returns the k largest values and their indices in descending order", () => {
    const arr = new Float32Array([0.1, 0.9, 0.3, 0.7, 0.5])
    const { values, indices } = topK(arr, 3)
    expect(values[0]).toBeCloseTo(0.9)
    expect(values[1]).toBeCloseTo(0.7)
    expect(values[2]).toBeCloseTo(0.5)
    expect(indices).toEqual([1, 3, 4])
  })

  it("clamps k to array length", () => {
    const arr = new Float32Array([0.2, 0.8, 0.5])
    const { values, indices } = topK(arr, 10)
    expect(values.length).toBe(3)
    expect(indices.length).toBe(3)
  })

  it("handles k=1", () => {
    const arr = new Float32Array([0.3, 0.99, 0.1])
    const { values, indices } = topK(arr, 1)
    expect(values[0]).toBeCloseTo(0.99)
    expect(indices[0]).toBe(1)
  })

  it("handles a single-element array", () => {
    const arr = new Float32Array([0.42])
    const { values, indices } = topK(arr, 1)
    expect(values[0]).toBeCloseTo(0.42)
    expect(indices).toEqual([0])
  })
})

// ============================================================
// matMul
// ============================================================

describe("matMul", () => {
  it("computes dot products of L2-normalized identical vectors as 1.0", () => {
    const a = unitVector(4, 0)
    const b = unitVector(4, 0)
    const result = matMul([a], 0, 1, [b], 0, 1, 4)
    expect(result[0]).toBeCloseTo(1.0)
  })

  it("computes dot products of orthogonal unit vectors as 0.0", () => {
    const a = unitVector(4, 0)
    const b = unitVector(4, 1)
    const result = matMul([a], 0, 1, [b], 0, 1, 4)
    expect(result[0]).toBeCloseTo(0.0)
  })

  it("computes the full matrix correctly for a 2x2 case", () => {
    const v0 = unitVector(4, 0)
    const v1 = unitVector(4, 1)
    // [v0, v1] × [v0, v1]^T → [[1,0],[0,1]]
    const result = matMul([v0, v1], 0, 2, [v0, v1], 0, 2, 4)
    expect(result[0]).toBeCloseTo(1.0) // v0·v0
    expect(result[1]).toBeCloseTo(0.0) // v0·v1
    expect(result[2]).toBeCloseTo(0.0) // v1·v0
    expect(result[3]).toBeCloseTo(1.0) // v1·v1
  })

  it("respects startA/endA/startB/endB slice parameters", () => {
    const v0 = unitVector(4, 0)
    const v1 = unitVector(4, 1)
    const v2 = unitVector(4, 2)
    // Only rows [1:2] of A dot all 3 rows of B → [0, 1, 0]
    const result = matMul([v0, v1, v2], 1, 2, [v0, v1, v2], 0, 3, 4)
    expect(result[0]).toBeCloseTo(0.0) // v1·v0
    expect(result[1]).toBeCloseTo(1.0) // v1·v1
    expect(result[2]).toBeCloseTo(0.0) // v1·v2
  })
})

// ============================================================
// computeEmbeddings worker failure handling
// ============================================================

describe("computeEmbeddings", () => {
  it("drops cached embeddings whose dimension does not match the dominant cache dimension", async () => {
    const cache = {
      getCompatibleMany: vi
        .fn()
        .mockResolvedValue([
          new Float32Array([1, 0, 0]),
          new Float32Array([1, 0]),
          new Float32Array([0, 1, 0])
        ])
    }

    const { embeddings, validIndices } = await computeEmbeddings(
      [null, null, null],
      [
        makeItem("cached-a", 1000),
        makeItem("cached-corrupt", 2000),
        makeItem("cached-b", 3000)
      ],
      cache as never,
      new Set(["cached-a", "cached-corrupt", "cached-b"])
    )

    expect(cache.getCompatibleMany).toHaveBeenCalled()
    expect(embeddings.map((embedding) => embedding.length)).toEqual([3, 3])
    expect(validIndices).toEqual([0, 2])
  })

  it("fails the scan when an embedding worker crashes mid-batch", async () => {
    const originalChrome = globalThis.chrome
    const originalWorker = globalThis.Worker
    const originalFetch = globalThis.fetch
    const originalNavigator = globalThis.navigator

    const modelBuffer = new ArrayBuffer(8)
    vi.stubGlobal("chrome", {
      runtime: { getURL: (path: string) => `chrome-extension://test/${path}` }
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => modelBuffer
      })
    )
    vi.stubGlobal("navigator", { hardwareConcurrency: 1 })

    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      terminated = false
      static initPayloadBuffer: ArrayBuffer | null = null
      static initTransferBuffer: ArrayBuffer | null = null

      constructor(_url: string) {}

      postMessage(
        message: { type: string; data?: { modelBuffer?: ArrayBuffer } },
        transfer?: Transferable[]
      ) {
        if (message.type === "init") {
          FailingWorker.initPayloadBuffer = message.data?.modelBuffer ?? null
          FailingWorker.initTransferBuffer = transfer?.[0] as ArrayBuffer
          queueMicrotask(() =>
            this.onmessage?.({ data: { type: "ready" } } as MessageEvent)
          )
          return
        }
        if (message.type === "embed") {
          queueMicrotask(() =>
            this.onerror?.({ message: "worker crashed" } as ErrorEvent)
          )
        }
      }

      terminate() {
        this.terminated = true
      }
    }

    vi.stubGlobal("Worker", FailingWorker)

    await expect(
      computeEmbeddings(
        [new Blob(["image"])],
        [makeItem("worker-fail", 1000)],
        null,
        new Set()
      )
    ).rejects.toThrow("worker crashed")

    expect(FailingWorker.initPayloadBuffer).toBe(
      FailingWorker.initTransferBuffer
    )

    vi.stubGlobal("chrome", originalChrome)
    vi.stubGlobal("Worker", originalWorker)
    vi.stubGlobal("fetch", originalFetch)
    vi.stubGlobal("navigator", originalNavigator)
  })
})

// ============================================================
// communityDetection — with synthetic embeddings
// These tests mirror the correctness guarantees of the original
// Python DuplicateImageDetector tests (which used real images).
// ============================================================

describe("communityDetection", () => {
  const DIM = 64
  const THRESHOLD = 0.99

  it("groups near-identical images together", () => {
    // Two very similar vectors (simulate duplicate pair 1a/1b)
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const dupA = addNoise(new Float32Array(base), 0.001)
    const dupB = addNoise(new Float32Array(base), 0.001)

    // Cosine similarity of near-identical vectors should be ≥ 0.9999+
    const groups = communityDetection([dupA, dupB], THRESHOLD)
    expect(groups.length).toBe(1)
    expect(groups[0]).toContain(0)
    expect(groups[0]).toContain(1)
  })

  it("does not group clearly different images", () => {
    // Three orthogonal unit vectors — cosine similarity = 0.0
    const v0 = unitVector(DIM, 0)
    const v1 = unitVector(DIM, 1)
    const v2 = unitVector(DIM, 2)

    const groups = communityDetection([v0, v1, v2], THRESHOLD)
    expect(groups.length).toBe(0)
  })

  it("returns empty when given fewer than 2 items", () => {
    const v = unitVector(DIM, 0)
    expect(communityDetection([v], THRESHOLD)).toEqual([])
  })

  it("handles three-way duplicates", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const a = addNoise(new Float32Array(base), 0.001)
    const b = addNoise(new Float32Array(base), 0.001)
    const c = addNoise(new Float32Array(base), 0.001)

    const groups = communityDetection([a, b, c], THRESHOLD)
    expect(groups.length).toBe(1)
    expect(groups[0].length).toBe(3)
  })

  it("separates two independent duplicate pairs into two groups", () => {
    const base1 = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const base2 = unitVector(DIM, 0) // orthogonal to base1 (high-D vectors)

    const a1 = addNoise(new Float32Array(base1), 0.001)
    const a2 = addNoise(new Float32Array(base1), 0.001)
    const b1 = addNoise(new Float32Array(base2), 0.001)
    const b2 = addNoise(new Float32Array(base2), 0.001)

    const groups = communityDetection([a1, a2, b1, b2], THRESHOLD)
    expect(groups.length).toBe(2)
    // Each group has exactly 2 members
    for (const g of groups) expect(g.length).toBe(2)
  })

  it("groups are sorted largest-first", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const trio = [
      addNoise(new Float32Array(base), 0.001),
      addNoise(new Float32Array(base), 0.001),
      addNoise(new Float32Array(base), 0.001)
    ]
    const singletonBase = unitVector(DIM, 0)
    const pair = [
      addNoise(new Float32Array(singletonBase), 0.001),
      addNoise(new Float32Array(singletonBase), 0.001)
    ]

    const groups = communityDetection([...trio, ...pair], THRESHOLD)
    if (groups.length >= 2) {
      expect(groups[0].length).toBeGreaterThanOrEqual(groups[1].length)
    }
  })

  it("does not double-count: each item appears in at most one group", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const items = Array.from({ length: 5 }, () =>
      addNoise(new Float32Array(base), 0.001)
    )
    const groups = communityDetection(items, THRESHOLD)
    const allIndices = groups.flat()
    const uniqueIndices = new Set(allIndices)
    expect(allIndices.length).toBe(uniqueIndices.size)
  })
})

describe("blockPairCountForItems", () => {
  it("counts triangular block pairs for exhaustive full scans", () => {
    expect(blockPairCountForItems(0, 1000)).toBe(0)
    expect(blockPairCountForItems(1, 1000)).toBe(0)
    expect(blockPairCountForItems(2, 1000)).toBe(1)
    expect(blockPairCountForItems(1000, 1000)).toBe(1)
    expect(blockPairCountForItems(1001, 1000)).toBe(3)
    expect(blockPairCountForItems(11000, 1000)).toBe(66)
  })

  it("rejects invalid block sizes", () => {
    expect(() => blockPairCountForItems(2, 0)).toThrow(
      /Invalid full-scan block size/
    )
    expect(() => blockPairCountForItems(2, Number.NaN)).toThrow(
      /Invalid full-scan block size/
    )
  })
})

// ============================================================
// Helper: build a minimal GpdMediaItem for testing
// ============================================================

function makeItem(
  mediaKey: string,
  timestamp: number,
  creationTimestamp = 0,
  extra: Partial<GpdMediaItem> = {}
): GpdMediaItem {
  return {
    mediaKey,
    dedupKey: mediaKey,
    thumb: `https://example.com/${mediaKey}`,
    timestamp,
    creationTimestamp,
    ...extra
  }
}

// ============================================================
// fullDetectDuplicates — candidate filtering (PR #121)
//
// Videos used to be excluded from scanning (`item.thumb && !item.duration`).
// PR #121 changed the filter to `item.thumb` so two copies of the same clip —
// which share an identical poster frame — get caught. These tests assert the
// filter via the early-return path (< 2 candidates), which reports the count
// in `timing.candidates` without touching the embedding model or IndexedDB.
// ============================================================

describe("fullDetectDuplicates — candidate filtering", () => {
  it("includes a video (item with duration) as a candidate", async () => {
    const video = makeItem("vid", 1000, 0, { duration: 5000 })
    const { groups, timing } = await fullDetectDuplicates([video], 0.99)
    // Single candidate → early return, but it was counted (not filtered out).
    expect(timing.candidates).toBe(1)
    expect(timing.totalItems).toBe(1)
    expect(groups).toEqual([])
  })

  it("excludes items without a thumbnail", async () => {
    const noThumb = makeItem("noThumb", 1000, 0, { thumb: undefined })
    const { timing } = await fullDetectDuplicates([noThumb], 0.99)
    expect(timing.candidates).toBe(0)
    expect(timing.totalItems).toBe(1)
  })

  it("keeps the video but drops the thumbless item", async () => {
    const video = makeItem("video", 1000, 0, { duration: 3000 })
    const noThumb = makeItem("noThumb", 1000, 0, { thumb: undefined })
    const { timing } = await fullDetectDuplicates([video, noThumb], 0.99)
    // Only the video survives the filter → 1 candidate, still early-return.
    expect(timing.candidates).toBe(1)
    expect(timing.totalItems).toBe(2)
  })

  it("fails instead of reporting no duplicates when all candidate thumbnails fail", async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        body: { cancel: vi.fn() }
      })
    )

    await expect(
      fullDetectDuplicates([makeItem("a", 1000), makeItem("b", 2000)], 0.99)
    ).rejects.toThrow(/Only 0 of 2 candidate items could be processed/)

    vi.stubGlobal("fetch", originalFetch)
  })
})

describe("video metadata duplicate detection", () => {
  it("groups exact matches by dedupKey even when visual metadata differs", () => {
    const groups = findDedupKeyDuplicateGroups([
      makeItem("a", 1000, 100, {
        dedupKey: "same-dedup",
        duration: 12_345,
        resWidth: 1920,
        resHeight: 1080,
        fileName: "clip-a.mov"
      }),
      makeItem("b", 2000, 200, {
        dedupKey: "same-dedup",
        duration: 12_345,
        resWidth: 1280,
        resHeight: 720,
        fileName: "clip-b.mp4"
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual(["a", "b"])
  })

  it("groups exact matches by provider content hash without changing provider node ids", () => {
    const groups = findExactContentDuplicateGroups([
      makeItem("amazon-a", 1000, 100, {
        dedupKey: "node-a",
        exactContentHash: "amazon-md5-same",
        duration: 12_345,
        fileName: "clip-a.mp4"
      }),
      makeItem("amazon-b", 2000, 200, {
        dedupKey: "node-b",
        exactContentHash: "amazon-md5-same",
        duration: 12_345,
        fileName: "clip-b.mp4"
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual([
      "amazon-a",
      "amazon-b"
    ])
    expect(groups[0].map((item) => item.dedupKey)).toEqual(["node-a", "node-b"])
  })

  it("groups videos with matching duration, dimensions, and filename even when upload dates differ", () => {
    const groups = findVideoMetadataDuplicateGroups([
      makeItem("old-upload", 1000, 100, {
        duration: 12_345,
        resWidth: 1920,
        resHeight: 1080,
        fileName: "IMG_1001.MOV"
      }),
      makeItem("new-upload", 2000, 200, {
        duration: 12_345,
        resWidth: 1920,
        resHeight: 1080,
        fileName: "img_1001.mp4"
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual([
      "old-upload",
      "new-upload"
    ])
  })

  it("groups videos with matching duration and filename stem when dimensions differ", () => {
    const groups = findVideoMetadataDuplicateGroups([
      makeItem("phone-copy", 1000, 100, {
        duration: 12_345,
        resWidth: 1920,
        resHeight: 1080,
        fileName: "IMG_1001.MOV"
      }),
      makeItem("cloud-copy", 2000, 200, {
        duration: 12_345,
        resWidth: 1280,
        resHeight: 720,
        fileName: "img_1001.mp4"
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual([
      "phone-copy",
      "cloud-copy"
    ])
  })

  it("groups videos with matching duration, dimensions, and file size when filename is unavailable", () => {
    const groups = findVideoMetadataDuplicateGroups([
      makeItem("a", 1000, 100, {
        duration: 7000,
        resWidth: 1280,
        resHeight: 720,
        size: 3_500_000
      }),
      makeItem("b", 2000, 200, {
        duration: 7000,
        resWidth: 1280,
        resHeight: 720,
        size: 3_500_000
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual(["a", "b"])
  })

  it("groups videos with matching duration and file size when dimensions are unavailable", () => {
    const groups = findVideoMetadataDuplicateGroups([
      makeItem("a", 1000, 100, {
        duration: 7000,
        resWidth: undefined,
        resHeight: undefined,
        size: 3_500_000
      }),
      makeItem("b", 2000, 200, {
        duration: 7000,
        resWidth: undefined,
        resHeight: undefined,
        size: 3_500_000
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual(["a", "b"])
  })

  it("does not group videos on duration and dimensions alone", () => {
    const groups = findVideoMetadataDuplicateGroups([
      makeItem("a", 1000, 100, {
        duration: 7000,
        resWidth: 1280,
        resHeight: 720,
        fileName: "first.mov",
        size: 3_500_000
      }),
      makeItem("b", 2000, 200, {
        duration: 7000,
        resWidth: 1280,
        resHeight: 720,
        fileName: "second.mov",
        size: 3_600_000
      })
    ])

    expect(groups).toEqual([])
  })

  it("groups same-duration videos when poster embeddings are just below the photo threshold", () => {
    const a = makeItem("a", 1000, 100, { duration: 7000 })
    const b = makeItem("b", 2000, 200, { duration: 7200 })
    const groups = findVideoPosterDuplicateGroups(
      [a, b],
      [
        l2normalize(new Float32Array([1, 0, 0])),
        l2normalize(new Float32Array([0.93, 0.37, 0]))
      ],
      [0, 1],
      0.96
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual(["a", "b"])
  })

  it("lets loose video poster sensitivity catch lower-similarity clips", () => {
    const a = makeItem("a", 1000, 100, { duration: 7000 })
    const b = makeItem("b", 2000, 200, { duration: 7100 })
    const embeddings = [
      l2normalize(new Float32Array([1, 0, 0])),
      l2normalize(new Float32Array([0.84, 0.54, 0]))
    ]

    expect(
      findVideoPosterDuplicateGroups([a, b], embeddings, [0, 1], 0.9)
    ).toEqual([])
    expect(
      findVideoPosterDuplicateGroups([a, b], embeddings, [0, 1], 0.8)
    ).toHaveLength(1)
  })

  it("does not relax near-exact video poster sensitivity", () => {
    const a = makeItem("a", 1000, 100, { duration: 7000 })
    const b = makeItem("b", 2000, 200, { duration: 7100 })
    const embeddings = [
      l2normalize(new Float32Array([1, 0, 0])),
      l2normalize(new Float32Array([0.985, 0.172, 0]))
    ]

    expect(
      findVideoPosterDuplicateGroups([a, b], embeddings, [0, 1], 0.99)
    ).toEqual([])
  })

  it("does not group similar video posters when durations differ substantially", () => {
    const a = makeItem("a", 1000, 100, { duration: 7000 })
    const b = makeItem("b", 2000, 200, { duration: 12_000 })
    const groups = findVideoPosterDuplicateGroups(
      [a, b],
      [
        l2normalize(new Float32Array([1, 0, 0])),
        l2normalize(new Float32Array([0.93, 0.37, 0]))
      ],
      [0, 1],
      0.96
    )

    expect(groups).toEqual([])
  })

  it("keeps transitive video poster groups across duration-sorted windows", () => {
    const a = makeItem("a", 1000, 100, { duration: 7000 })
    const b = makeItem("b", 2000, 200, { duration: 7900 })
    const c = makeItem("c", 3000, 300, { duration: 8800 })
    const groups = findVideoPosterDuplicateGroups(
      [c, a, b],
      [
        l2normalize(new Float32Array([0.93, 0.37, 0])),
        l2normalize(new Float32Array([1, 0, 0])),
        l2normalize(new Float32Array([0.98, 0.2, 0]))
      ],
      [0, 1, 2],
      0.96
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual(["a", "b", "c"])
  })

  it("merges overlapping visual and video metadata groups", () => {
    const a = makeItem("a", 1000, 100)
    const b = makeItem("b", 2000, 200)
    const c = makeItem("c", 3000, 300)

    const groups = mergeDuplicateItemGroups([
      [a, b],
      [b, c]
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].map((item) => item.mediaKey)).toEqual(["a", "b", "c"])
  })

  it("lets smart mode catch strong video metadata matches outside the time window", async () => {
    const groups = await smartDetectDuplicates(
      [
        makeItem("old-upload", Date.parse("2021-01-01"), 100, {
          duration: 12_345,
          resWidth: 1920,
          resHeight: 1080,
          fileName: "IMG_1001.MOV"
        }),
        makeItem("new-upload", Date.parse("2024-01-01"), 200, {
          duration: 12_345,
          resWidth: 1920,
          resHeight: 1080,
          fileName: "img_1001.mp4"
        })
      ],
      0.95,
      1000
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].mediaKeys).toEqual(["old-upload", "new-upload"])
    expect(groups[0].duplicateKind).toBe("exact")
  })

  it("lets smart mode catch exact-content videos outside the time window", async () => {
    const groups = await smartDetectDuplicates(
      [
        makeItem("old-upload", Date.parse("2021-01-01"), 100, {
          dedupKey: "node-a",
          exactContentHash: "amazon-md5-same",
          duration: 12_345,
          fileName: "clip-a.mp4"
        }),
        makeItem("new-upload", Date.parse("2024-01-01"), 200, {
          dedupKey: "node-b",
          exactContentHash: "amazon-md5-same",
          duration: 12_345,
          fileName: "clip-b.mp4"
        })
      ],
      0.95,
      1000
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].mediaKeys).toEqual(["old-upload", "new-upload"])
    expect(groups[0].duplicateKind).toBe("exact")
  })

  it("keeps far-apart videos in the smart embedding subset for poster matching", () => {
    const nearbyPhotoA = makeItem("photo-a", 1000)
    const nearbyPhotoB = makeItem("photo-b", 1100)
    const oldVideo = makeItem("old-video", Date.parse("2021-01-01"), 100, {
      duration: 7000,
      dedupKey: "old-video-dedup"
    })
    const newVideo = makeItem("new-video", Date.parse("2024-01-01"), 200, {
      duration: 7100,
      dedupKey: "new-video-dedup"
    })
    const farPhoto = makeItem("far-photo", Date.parse("2024-01-01"))

    const subset = smartScanEmbeddingCandidates(
      [nearbyPhotoA, nearbyPhotoB, oldVideo, newVideo, farPhoto],
      [[nearbyPhotoA, nearbyPhotoB]]
    )

    expect(subset.map((item) => item.mediaKey)).toEqual([
      "photo-a",
      "photo-b",
      "old-video",
      "new-video"
    ])
  })
})

// ============================================================
// groupByTimestamp
// ============================================================

describe("groupByTimestamp", () => {
  it("groups two items with the same timestamp", () => {
    const a = makeItem("a", 1000)
    const b = makeItem("b", 1000)
    const result = groupByTimestamp([a, b])
    expect(result).toHaveLength(1)
    expect(result[0]).toContain(a)
    expect(result[0]).toContain(b)
  })

  it("does not group items with different timestamps", () => {
    const a = makeItem("a", 1000)
    const b = makeItem("b", 2000)
    const result = groupByTimestamp([a, b])
    expect(result).toHaveLength(0)
  })

  it("returns empty when all timestamps are unique", () => {
    const items = [makeItem("a", 1), makeItem("b", 2), makeItem("c", 3)]
    expect(groupByTimestamp(items)).toHaveLength(0)
  })

  it("handles three-way same-timestamp group", () => {
    const items = [
      makeItem("a", 5000),
      makeItem("b", 5000),
      makeItem("c", 5000)
    ]
    const result = groupByTimestamp(items)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(3)
  })

  it("separates two independent pairs into two buckets", () => {
    const items = [
      makeItem("a", 1000),
      makeItem("b", 1000),
      makeItem("c", 2000),
      makeItem("d", 2000)
    ]
    const result = groupByTimestamp(items)
    expect(result).toHaveLength(2)
    for (const bucket of result) expect(bucket).toHaveLength(2)
  })

  it("excludes singleton buckets (only groups of ≥2)", () => {
    const items = [
      makeItem("a", 1000),
      makeItem("b", 2000),
      makeItem("c", 2000)
    ]
    const result = groupByTimestamp(items)
    expect(result).toHaveLength(1)
    expect(result[0].map((i) => i.mediaKey)).toEqual(
      expect.arrayContaining(["b", "c"])
    )
  })

  it("windowMs=1000 groups nearby items", () => {
    const a = makeItem("a", 1100)
    const b = makeItem("b", 1800)
    const result = groupByTimestamp([a, b], 1000)
    expect(result).toHaveLength(1)
  })

  it("windowMs=1000 groups nearby items across fixed bucket boundaries", () => {
    const a = makeItem("a", 999)
    const b = makeItem("b", 1001)
    const result = groupByTimestamp([a, b], 1000)
    expect(result).toHaveLength(1)
  })

  it("windowMs=1000 keeps distant items separate", () => {
    const a = makeItem("a", 999)
    const b = makeItem("b", 2500)
    const result = groupByTimestamp([a, b], 1000)
    expect(result).toHaveLength(0)
  })

  it("windowMs=1000 can form a chain bucket for adjacent timestamps", () => {
    const result = groupByTimestamp(
      [makeItem("a", 0), makeItem("b", 900), makeItem("c", 1800)],
      1000
    )
    expect(result).toHaveLength(1)
    expect(result[0].map((item) => item.mediaKey)).toEqual(["a", "b", "c"])
  })
})

describe("groupByProviderSequence", () => {
  it("groups adjacent items from the same provider order", () => {
    const a = makeItem("a", 1000, 0, {
      provider: "icloud",
      sequenceIndex: 151
    })
    const b = makeItem("b", 5032, 0, {
      provider: "icloud",
      sequenceIndex: 152
    })

    const result = groupByProviderSequence([a, b])

    expect(result).toHaveLength(1)
    expect(result[0].map((item) => item.mediaKey)).toEqual(["a", "b"])
  })

  it("keeps different providers in separate sequence groups", () => {
    const a = makeItem("a", 1000, 0, {
      provider: "icloud",
      sequenceIndex: 1
    })
    const b = makeItem("b", 1000, 0, {
      provider: "google",
      sequenceIndex: 2
    })

    expect(groupByProviderSequence([a, b])).toEqual([])
  })

  it("ignores items without provider sequence metadata", () => {
    const a = makeItem("a", 1000)
    const b = makeItem("b", 2000)

    expect(groupByProviderSequence([a, b])).toEqual([])
  })

  it("does not group adjacent provider items when their timestamps are far apart", () => {
    const a = makeItem("a", 1000, 0, {
      provider: "icloud",
      sequenceIndex: 1
    })
    const b = makeItem("b", 3_601_000, 0, {
      provider: "icloud",
      sequenceIndex: 2
    })

    expect(groupByProviderSequence([a, b])).toEqual([])
  })
})

describe("shouldCompareSmartTimestamps", () => {
  it("allows boundary-crossing pairs within the smart window", () => {
    expect(shouldCompareSmartTimestamps(999, 1001, 1000)).toBe(true)
  })

  it("rejects distant endpoints from a proximity chain", () => {
    expect(shouldCompareSmartTimestamps(0, 1800, 1000)).toBe(false)
  })
})

// ============================================================
// withinGroupDuplicates
// ============================================================

describe("withinGroupDuplicates", () => {
  const DIM = 64
  const THRESHOLD = 0.99

  function makeEmbeddingMap(
    items: GpdMediaItem[],
    embeddings: Float32Array[]
  ): Map<string, Float32Array> {
    const map = new Map<string, Float32Array>()
    for (let i = 0; i < items.length; i++)
      map.set(items[i].mediaKey, embeddings[i])
    return map
  }

  it("groups two near-identical embeddings (above threshold)", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const a = makeItem("a", 1000)
    const b = makeItem("b", 1000)
    const embA = addNoise(new Float32Array(base), 0.001)
    const embB = addNoise(new Float32Array(base), 0.001)
    const map = makeEmbeddingMap([a, b], [embA, embB])
    const groups = withinGroupDuplicates([a, b], map, THRESHOLD, 0)
    expect(groups).toHaveLength(1)
    expect(groups[0].mediaKeys).toHaveLength(2)
  })

  it("does not group embeddings below threshold", () => {
    const a = makeItem("a", 1000)
    const b = makeItem("b", 1000)
    const embA = unitVector(DIM, 0)
    const embB = unitVector(DIM, 1)
    const map = makeEmbeddingMap([a, b], [embA, embB])
    const groups = withinGroupDuplicates([a, b], map, THRESHOLD, 0)
    expect(groups).toHaveLength(0)
  })

  it("changes visual grouping when the threshold is moved from strict to loose", () => {
    const a = makeItem("a", 1000)
    const b = makeItem("b", 1000)
    const embA = l2normalize(new Float32Array([1, 0, 0]))
    const embB = l2normalize(new Float32Array([0.86, 0.51, 0]))
    const map = makeEmbeddingMap([a, b], [embA, embB])

    expect(withinGroupDuplicates([a, b], map, 0.9, 0)).toHaveLength(0)
    expect(withinGroupDuplicates([a, b], map, 0.8, 0)).toHaveLength(1)
  })

  it("handles transitive grouping: A~B and B~C → single group {A,B,C}", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const items = [
      makeItem("a", 1000),
      makeItem("b", 1000),
      makeItem("c", 1000)
    ]
    const embs = items.map(() => addNoise(new Float32Array(base), 0.001))
    const map = makeEmbeddingMap(items, embs)
    const groups = withinGroupDuplicates(items, map, THRESHOLD, 0)
    expect(groups).toHaveLength(1)
    expect(groups[0].mediaKeys).toHaveLength(3)
  })

  it("two independent similar pairs → two separate groups", () => {
    const base1 = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const base2 = unitVector(DIM, 0)
    const items = [
      makeItem("a", 1000),
      makeItem("b", 1000),
      makeItem("c", 1000),
      makeItem("d", 1000)
    ]
    const embs = [
      addNoise(new Float32Array(base1), 0.001),
      addNoise(new Float32Array(base1), 0.001),
      addNoise(new Float32Array(base2), 0.001),
      addNoise(new Float32Array(base2), 0.001)
    ]
    const map = makeEmbeddingMap(items, embs)
    const groups = withinGroupDuplicates(items, map, THRESHOLD, 0)
    expect(groups).toHaveLength(2)
    for (const g of groups) expect(g.mediaKeys).toHaveLength(2)
  })

  it("skips items with no entry in embeddingMap (thumbnail/embed failed)", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const a = makeItem("a", 1000)
    const b = makeItem("b", 1000)
    const missing = makeItem("missing", 1000)
    const map = makeEmbeddingMap(
      [a, b],
      [
        addNoise(new Float32Array(base), 0.001),
        addNoise(new Float32Array(base), 0.001)
      ]
    )
    // missing has no entry in map
    const groups = withinGroupDuplicates([a, b, missing], map, THRESHOLD, 0)
    expect(groups).toHaveLength(1)
    expect(groups[0].mediaKeys).not.toContain("missing")
  })

  it("sets originalMediaKey to item with earliest creationTimestamp", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const older = makeItem("older", 1000, 100)
    const newer = makeItem("newer", 1000, 200)
    const embs = [
      addNoise(new Float32Array(base), 0.001),
      addNoise(new Float32Array(base), 0.001)
    ]
    const map = makeEmbeddingMap([older, newer], embs)
    const groups = withinGroupDuplicates([newer, older], map, THRESHOLD, 0)
    expect(groups[0].originalMediaKey).toBe("older")
  })

  it("each item appears in at most one group (no double-count)", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem(`item${i}`, 1000)
    )
    const embs = items.map(() => addNoise(new Float32Array(base), 0.001))
    const map = makeEmbeddingMap(items, embs)
    const groups = withinGroupDuplicates(items, map, THRESHOLD, 0)
    const allKeys = groups.flatMap((g) => g.mediaKeys)
    expect(allKeys.length).toBe(new Set(allKeys).size)
  })

  it("groups are returned largest-first", () => {
    const base1 = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const base2 = unitVector(DIM, 0)
    const trio = Array.from({ length: 3 }, (_, i) => makeItem(`trio${i}`, 1000))
    const pair = Array.from({ length: 2 }, (_, i) => makeItem(`pair${i}`, 1000))
    const embs = [
      ...trio.map(() => addNoise(new Float32Array(base1), 0.001)),
      ...pair.map(() => addNoise(new Float32Array(base2), 0.001))
    ]
    const map = makeEmbeddingMap([...trio, ...pair], embs)
    const groups = withinGroupDuplicates([...trio, ...pair], map, THRESHOLD, 0)
    if (groups.length >= 2) {
      expect(groups[0].mediaKeys.length).toBeGreaterThanOrEqual(
        groups[1].mediaKeys.length
      )
    }
  })
})

// ============================================================
// selectDefaultKeep
// ============================================================

describe("selectDefaultKeep", () => {
  function item(key: string, opts: Partial<GpdMediaItem> = {}): GpdMediaItem {
    return {
      mediaKey: key,
      dedupKey: key,
      thumb: `https://example.com/${key}`,
      timestamp: 0,
      creationTimestamp: opts.creationTimestamp ?? 0,
      resWidth: opts.resWidth,
      resHeight: opts.resHeight,
      isOriginalQuality: opts.isOriginalQuality,
      ...opts
    }
  }

  it("prefers original quality over storage saver regardless of resolution", () => {
    const saver = item("saver", {
      isOriginalQuality: false,
      resWidth: 4000,
      resHeight: 3000
    })
    const original = item("original", {
      isOriginalQuality: true,
      resWidth: 100,
      resHeight: 100
    })
    expect(selectDefaultKeep([saver, original])).toBe("original")
  })

  it("prefers original quality over null quality", () => {
    const unknown = item("unknown", {
      isOriginalQuality: null,
      resWidth: 4000,
      resHeight: 3000
    })
    const original = item("original", {
      isOriginalQuality: true,
      resWidth: 100,
      resHeight: 100
    })
    expect(selectDefaultKeep([unknown, original])).toBe("original")
  })

  it("prefers null quality over storage saver", () => {
    const saver = item("saver", {
      isOriginalQuality: false,
      resWidth: 4000,
      resHeight: 3000
    })
    const unknown = item("unknown", {
      isOriginalQuality: null,
      resWidth: 100,
      resHeight: 100
    })
    expect(selectDefaultKeep([saver, unknown])).toBe("unknown")
  })

  it("prefers higher resolution when quality is tied (both original)", () => {
    const small = item("small", {
      isOriginalQuality: true,
      resWidth: 800,
      resHeight: 600
    })
    const large = item("large", {
      isOriginalQuality: true,
      resWidth: 3000,
      resHeight: 2000
    })
    expect(selectDefaultKeep([small, large])).toBe("large")
  })

  it("prefers higher resolution when quality is tied (both null)", () => {
    const small = item("small", {
      resWidth: 800,
      resHeight: 600,
      creationTimestamp: 1
    })
    const large = item("large", {
      resWidth: 3000,
      resHeight: 2000,
      creationTimestamp: 2
    })
    expect(selectDefaultKeep([small, large])).toBe("large")
  })

  it("prefers oldest taken date over higher resolution when quality is tied", () => {
    const newerLarge = item("newerLarge", {
      isOriginalQuality: true,
      timestamp: Date.parse("2024-01-01T00:00:00.000Z"),
      resWidth: 4000,
      resHeight: 3000
    })
    const olderSmall = item("olderSmall", {
      isOriginalQuality: true,
      timestamp: Date.parse("2021-01-01T00:00:00.000Z"),
      resWidth: 1000,
      resHeight: 1000
    })
    expect(selectDefaultKeep([newerLarge, olderSmall])).toBe("olderSmall")
  })

  it("prefers an item with a taken date over a missing taken date when quality ties", () => {
    const missingTaken = item("missingTaken", {
      isOriginalQuality: true,
      timestamp: undefined,
      resWidth: 4000,
      resHeight: 3000
    })
    const withTaken = item("withTaken", {
      isOriginalQuality: true,
      timestamp: Date.parse("2024-01-01T00:00:00.000Z"),
      resWidth: 1000,
      resHeight: 1000
    })
    expect(selectDefaultKeep([missingTaken, withTaken])).toBe("withTaken")
  })

  it("falls back to resolution when all tied-quality items are missing taken dates", () => {
    const small = item("small", {
      isOriginalQuality: true,
      timestamp: undefined,
      resWidth: 1000,
      resHeight: 1000
    })
    const large = item("large", {
      isOriginalQuality: true,
      timestamp: undefined,
      resWidth: 4000,
      resHeight: 3000
    })
    expect(selectDefaultKeep([small, large])).toBe("large")
  })

  it("prefers a newer taken item when it is better quality", () => {
    const olderSaver = item("olderSaver", {
      isOriginalQuality: false,
      timestamp: Date.parse("2021-01-01T00:00:00.000Z"),
      resWidth: 4000,
      resHeight: 3000
    })
    const newerOriginal = item("newerOriginal", {
      isOriginalQuality: true,
      timestamp: Date.parse("2024-01-01T00:00:00.000Z"),
      resWidth: 1000,
      resHeight: 1000
    })
    expect(selectDefaultKeep([olderSaver, newerOriginal])).toBe("newerOriginal")
  })

  it("prefers oldest upload date as tiebreaker when quality, taken date, and resolution are equal", () => {
    const newer = item("newer", {
      isOriginalQuality: true,
      resWidth: 1920,
      resHeight: 1080,
      creationTimestamp: 200
    })
    const older = item("older", {
      isOriginalQuality: true,
      resWidth: 1920,
      resHeight: 1080,
      creationTimestamp: 100
    })
    expect(selectDefaultKeep([newer, older])).toBe("older")
  })

  it("prefers richer metadata for an exact two-item pair", () => {
    const highQualitySparse = item("sparse", {
      isOriginalQuality: true,
      resWidth: 4000,
      resHeight: 3000
    })
    const metadataRich = item("metadata", {
      isOriginalQuality: false,
      resWidth: 1000,
      resHeight: 1000,
      fileName: "metadata-rich.jpg",
      size: 123456,
      takesUpSpace: true,
      spaceTaken: 123456,
      productUrl: "https://photos.google.com/photo/metadata"
    })
    metadataRich.dedupKey = highQualitySparse.dedupKey
    expect(selectDefaultKeep([highQualitySparse, metadataRich])).toBe(
      "metadata"
    )
  })

  it("handles undefined resolution fields (treats as 0 pixels)", () => {
    const withRes = item("withRes", { resWidth: 1920, resHeight: 1080 })
    const noRes = item("noRes", {})
    expect(selectDefaultKeep([noRes, withRes])).toBe("withRes")
  })

  it("returns the single item in a one-item array", () => {
    const only = item("only", {
      isOriginalQuality: true,
      resWidth: 1920,
      resHeight: 1080
    })
    expect(selectDefaultKeep([only])).toBe("only")
  })

  it("handles all items with equal criteria — returns first in stable order", () => {
    const a = item("a", {
      isOriginalQuality: true,
      resWidth: 1920,
      resHeight: 1080,
      creationTimestamp: 0
    })
    const b = item("b", {
      isOriginalQuality: true,
      resWidth: 1920,
      resHeight: 1080,
      creationTimestamp: 0
    })
    const result = selectDefaultKeep([a, b])
    expect(["a", "b"]).toContain(result)
  })
})
