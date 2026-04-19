import { describe, it, expect } from "vitest"
import { communityDetection, matMul, topK, groupByTimestamp, withinGroupDuplicates, selectDefaultKeep } from "../../lib/duplicate-detector"
import type { GpdMediaItem } from "../../lib/types"

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
      addNoise(new Float32Array(base), 0.001),
    ]
    const singletonBase = unitVector(DIM, 0)
    const pair = [
      addNoise(new Float32Array(singletonBase), 0.001),
      addNoise(new Float32Array(singletonBase), 0.001),
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

// ============================================================
// Helper: build a minimal GpdMediaItem for testing
// ============================================================

function makeItem(
  mediaKey: string,
  timestamp: number,
  creationTimestamp = 0,
): GpdMediaItem {
  return {
    mediaKey,
    dedupKey: mediaKey,
    thumb: `https://example.com/${mediaKey}`,
    timestamp,
    creationTimestamp,
  }
}

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
    const items = [makeItem("a", 5000), makeItem("b", 5000), makeItem("c", 5000)]
    const result = groupByTimestamp(items)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(3)
  })

  it("separates two independent pairs into two buckets", () => {
    const items = [
      makeItem("a", 1000),
      makeItem("b", 1000),
      makeItem("c", 2000),
      makeItem("d", 2000),
    ]
    const result = groupByTimestamp(items)
    expect(result).toHaveLength(2)
    for (const bucket of result) expect(bucket).toHaveLength(2)
  })

  it("excludes singleton buckets (only groups of ≥2)", () => {
    const items = [makeItem("a", 1000), makeItem("b", 2000), makeItem("c", 2000)]
    const result = groupByTimestamp(items)
    expect(result).toHaveLength(1)
    expect(result[0].map((i) => i.mediaKey)).toEqual(expect.arrayContaining(["b", "c"]))
  })

  it("windowMs=1000 groups items within the same second", () => {
    const a = makeItem("a", 1100)
    const b = makeItem("b", 1800)
    // Both floor to 1000 with windowMs=1000
    const result = groupByTimestamp([a, b], 1000)
    expect(result).toHaveLength(1)
  })

  it("windowMs=1000 keeps items in different seconds separate", () => {
    const a = makeItem("a", 999)
    const b = makeItem("b", 1001)
    // a floors to 0, b floors to 1000
    const result = groupByTimestamp([a, b], 1000)
    expect(result).toHaveLength(0)
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
    embeddings: Float32Array[],
  ): Map<string, Float32Array> {
    const map = new Map<string, Float32Array>()
    for (let i = 0; i < items.length; i++) map.set(items[i].mediaKey, embeddings[i])
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

  it("handles transitive grouping: A~B and B~C → single group {A,B,C}", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const items = [makeItem("a", 1000), makeItem("b", 1000), makeItem("c", 1000)]
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
      makeItem("d", 1000),
    ]
    const embs = [
      addNoise(new Float32Array(base1), 0.001),
      addNoise(new Float32Array(base1), 0.001),
      addNoise(new Float32Array(base2), 0.001),
      addNoise(new Float32Array(base2), 0.001),
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
    const map = makeEmbeddingMap([a, b], [
      addNoise(new Float32Array(base), 0.001),
      addNoise(new Float32Array(base), 0.001),
    ])
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
      addNoise(new Float32Array(base), 0.001),
    ]
    const map = makeEmbeddingMap([older, newer], embs)
    const groups = withinGroupDuplicates([newer, older], map, THRESHOLD, 0)
    expect(groups[0].originalMediaKey).toBe("older")
  })

  it("each item appears in at most one group (no double-count)", () => {
    const base = l2normalize(new Float32Array(DIM).map(() => Math.random()))
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`item${i}`, 1000))
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
      ...pair.map(() => addNoise(new Float32Array(base2), 0.001)),
    ]
    const map = makeEmbeddingMap([...trio, ...pair], embs)
    const groups = withinGroupDuplicates([...trio, ...pair], map, THRESHOLD, 0)
    if (groups.length >= 2) {
      expect(groups[0].mediaKeys.length).toBeGreaterThanOrEqual(groups[1].mediaKeys.length)
    }
  })
})

// ============================================================
// selectDefaultKeep
// ============================================================

describe("selectDefaultKeep", () => {
  function item(
    key: string,
    opts: {
      isOriginalQuality?: boolean | null
      resWidth?: number
      resHeight?: number
      creationTimestamp?: number
    } = {},
  ): GpdMediaItem {
    return {
      mediaKey: key,
      dedupKey: key,
      thumb: `https://example.com/${key}`,
      timestamp: 0,
      creationTimestamp: opts.creationTimestamp ?? 0,
      resWidth: opts.resWidth,
      resHeight: opts.resHeight,
      isOriginalQuality: opts.isOriginalQuality,
    }
  }

  it("prefers original quality over storage saver regardless of resolution", () => {
    const saver = item("saver", { isOriginalQuality: false, resWidth: 4000, resHeight: 3000 })
    const original = item("original", { isOriginalQuality: true, resWidth: 100, resHeight: 100 })
    expect(selectDefaultKeep([saver, original])).toBe("original")
  })

  it("prefers original quality over null quality", () => {
    const unknown = item("unknown", { isOriginalQuality: null, resWidth: 4000, resHeight: 3000 })
    const original = item("original", { isOriginalQuality: true, resWidth: 100, resHeight: 100 })
    expect(selectDefaultKeep([unknown, original])).toBe("original")
  })

  it("prefers null quality over storage saver", () => {
    const saver = item("saver", { isOriginalQuality: false, resWidth: 4000, resHeight: 3000 })
    const unknown = item("unknown", { isOriginalQuality: null, resWidth: 100, resHeight: 100 })
    expect(selectDefaultKeep([saver, unknown])).toBe("unknown")
  })

  it("prefers higher resolution when quality is tied (both original)", () => {
    const small = item("small", { isOriginalQuality: true, resWidth: 800, resHeight: 600 })
    const large = item("large", { isOriginalQuality: true, resWidth: 3000, resHeight: 2000 })
    expect(selectDefaultKeep([small, large])).toBe("large")
  })

  it("prefers higher resolution when quality is tied (both null)", () => {
    const small = item("small", { resWidth: 800, resHeight: 600, creationTimestamp: 1 })
    const large = item("large", { resWidth: 3000, resHeight: 2000, creationTimestamp: 2 })
    expect(selectDefaultKeep([small, large])).toBe("large")
  })

  it("prefers oldest upload date as tiebreaker when quality and resolution are equal", () => {
    const newer = item("newer", { isOriginalQuality: true, resWidth: 1920, resHeight: 1080, creationTimestamp: 200 })
    const older = item("older", { isOriginalQuality: true, resWidth: 1920, resHeight: 1080, creationTimestamp: 100 })
    expect(selectDefaultKeep([newer, older])).toBe("older")
  })

  it("handles undefined resolution fields (treats as 0 pixels)", () => {
    const withRes = item("withRes", { resWidth: 1920, resHeight: 1080 })
    const noRes = item("noRes", {})
    expect(selectDefaultKeep([noRes, withRes])).toBe("withRes")
  })

  it("returns the single item in a one-item array", () => {
    const only = item("only", { isOriginalQuality: true, resWidth: 1920, resHeight: 1080 })
    expect(selectDefaultKeep([only])).toBe("only")
  })

  it("handles all items with equal criteria — returns first in stable order", () => {
    const a = item("a", { isOriginalQuality: true, resWidth: 1920, resHeight: 1080, creationTimestamp: 0 })
    const b = item("b", { isOriginalQuality: true, resWidth: 1920, resHeight: 1080, creationTimestamp: 0 })
    const result = selectDefaultKeep([a, b])
    expect(["a", "b"]).toContain(result)
  })
})
