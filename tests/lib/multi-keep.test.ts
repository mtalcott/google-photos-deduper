/**
 * Unit tests for the multi-keep state logic.
 *
 * The keep-toggle logic lives as an inline setState updater in app.tsx.
 * We extract and test it here as a pure function to verify all the edge cases.
 */
import { describe, it, expect } from "vitest"
import type { DuplicateGroup } from "../../lib/types"

// ============================================================
// Pure logic extracted from handleToggleKept in app.tsx
// ============================================================

type KeptOverrides = Record<string, Set<string>>

function getKept(group: DuplicateGroup, keptOverrides: KeptOverrides): Set<string> {
  return keptOverrides[group.id] ?? new Set([group.originalMediaKey])
}

function applyToggleKept(
  prev: KeptOverrides,
  group: DuplicateGroup,
  mediaKey: string
): KeptOverrides {
  const current = prev[group.id] ?? new Set([group.originalMediaKey])
  if (current.has(mediaKey) && current.size === 1) return prev
  const next = new Set(current)
  if (next.has(mediaKey)) {
    next.delete(mediaKey)
  } else {
    next.add(mediaKey)
  }
  return { ...prev, [group.id]: next }
}

// ============================================================
// Fixtures
// ============================================================

function makeGroup(id: string, ...mediaKeys: string[]): DuplicateGroup {
  return { id, mediaKeys, originalMediaKey: mediaKeys[0], similarity: 0.99 }
}

const g1 = makeGroup("g1", "img1", "img2", "img3")

// ============================================================
// getKept
// ============================================================

describe("getKept", () => {
  it("returns a Set with the originalMediaKey when no override exists", () => {
    const result = getKept(g1, {})
    expect(result).toEqual(new Set(["img1"]))
  })

  it("returns the override set when one exists", () => {
    const overrides: KeptOverrides = { g1: new Set(["img2", "img3"]) }
    const result = getKept(g1, overrides)
    expect(result).toEqual(new Set(["img2", "img3"]))
  })

  it("does not affect other groups", () => {
    const g2 = makeGroup("g2", "img4", "img5")
    const overrides: KeptOverrides = { g1: new Set(["img2"]) }
    const result = getKept(g2, overrides)
    expect(result).toEqual(new Set(["img4"]))
  })
})

// ============================================================
// applyToggleKept — adding items
// ============================================================

describe("applyToggleKept — adding", () => {
  it("adds a non-kept item to the kept set", () => {
    const prev: KeptOverrides = {}
    const next = applyToggleKept(prev, g1, "img2")
    expect(next["g1"]).toEqual(new Set(["img1", "img2"]))
  })

  it("can keep all items in a group", () => {
    let overrides: KeptOverrides = {}
    overrides = applyToggleKept(overrides, g1, "img2")
    overrides = applyToggleKept(overrides, g1, "img3")
    expect(overrides["g1"]).toEqual(new Set(["img1", "img2", "img3"]))
  })

  it("does not add duplicate entries", () => {
    const overrides: KeptOverrides = { g1: new Set(["img1", "img2"]) }
    const next = applyToggleKept(overrides, g1, "img2")
    // img2 was already kept → toggle removes it
    expect(next["g1"]).toEqual(new Set(["img1"]))
  })
})

// ============================================================
// applyToggleKept — removing items
// ============================================================

describe("applyToggleKept — removing", () => {
  it("removes a kept item when toggled off", () => {
    const prev: KeptOverrides = { g1: new Set(["img1", "img2"]) }
    const next = applyToggleKept(prev, g1, "img2")
    expect(next["g1"]).toEqual(new Set(["img1"]))
  })

  it("does NOT remove the last kept item (guard)", () => {
    const prev: KeptOverrides = { g1: new Set(["img1"]) }
    const next = applyToggleKept(prev, g1, "img1")
    // Should return prev unchanged
    expect(next).toBe(prev)
    expect(next["g1"]).toEqual(new Set(["img1"]))
  })

  it("does NOT remove the default kept item when it is the only one", () => {
    // No override → default is {img1}; trying to remove img1 should be a no-op
    const prev: KeptOverrides = {}
    const next = applyToggleKept(prev, g1, "img1")
    expect(next).toBe(prev)
  })
})

// ============================================================
// applyToggleKept — isolation between groups
// ============================================================

describe("applyToggleKept — group isolation", () => {
  it("only mutates the target group's override", () => {
    const g2 = makeGroup("g2", "img4", "img5")
    const prev: KeptOverrides = { g2: new Set(["img4"]) }
    const next = applyToggleKept(prev, g1, "img2")
    // g1 gains an override
    expect(next["g1"]).toEqual(new Set(["img1", "img2"]))
    // g2 is unchanged
    expect(next["g2"]).toEqual(new Set(["img4"]))
  })
})

// ============================================================
// duplicateCount logic
// ============================================================

describe("duplicateCount", () => {
  function computeDuplicateCount(
    groups: DuplicateGroup[],
    selectedGroupIds: Set<string>,
    keptOverrides: KeptOverrides
  ): number {
    return groups.reduce((sum, group) => {
      if (!selectedGroupIds.has(group.id)) return sum
      const keptSet = getKept(group, keptOverrides)
      return sum + group.mediaKeys.filter((k) => !keptSet.has(k)).length
    }, 0)
  }

  it("counts non-kept items in selected groups", () => {
    const groups = [makeGroup("g1", "img1", "img2", "img3")]
    const count = computeDuplicateCount(groups, new Set(["g1"]), {})
    // img1 is kept by default; img2, img3 are trash
    expect(count).toBe(2)
  })

  it("returns 0 for deselected groups", () => {
    const groups = [makeGroup("g1", "img1", "img2")]
    const count = computeDuplicateCount(groups, new Set(), {})
    expect(count).toBe(0)
  })

  it("accounts for multi-keep overrides", () => {
    const groups = [makeGroup("g1", "img1", "img2", "img3")]
    const overrides: KeptOverrides = { g1: new Set(["img1", "img2"]) }
    const count = computeDuplicateCount(groups, new Set(["g1"]), overrides)
    // img1 + img2 kept, img3 trash
    expect(count).toBe(1)
  })

  it("counts 0 when all items are kept", () => {
    const groups = [makeGroup("g1", "img1", "img2")]
    const overrides: KeptOverrides = { g1: new Set(["img1", "img2"]) }
    const count = computeDuplicateCount(groups, new Set(["g1"]), overrides)
    expect(count).toBe(0)
  })

  it("aggregates across multiple groups", () => {
    const g2 = makeGroup("g2", "img3", "img4")
    const groups = [g1, g2]
    const count = computeDuplicateCount(groups, new Set(["g1", "g2"]), {})
    // g1: img1 kept, img2+img3 trash (2); g2: img3 kept, img4 trash (1)
    expect(count).toBe(3)
  })
})
