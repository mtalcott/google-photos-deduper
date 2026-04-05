import { describe, it, expect } from "vitest"
import { communityDetection, matMul, topK } from "../../lib/duplicate-detector"

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
