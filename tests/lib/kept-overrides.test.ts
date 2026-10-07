/**
 * Tests for lib/kept-overrides.ts
 *
 * Trashing an entire group is the one action that leaves no survivor, so the
 * logic deciding when that happens lives in a pure module rather than inside
 * the component tree.
 */
import { describe, it, expect } from "vitest"
import {
  isWholeGroupTrashed,
  toggleWholeGroupTrashed,
  countFullyTrashedGroups,
} from "../../lib/kept-overrides"
import type { DuplicateGroup } from "../../lib/types"

const group = (id: string, ...mediaKeys: string[]): DuplicateGroup => ({
  id,
  mediaKeys,
  originalMediaKey: mediaKeys[0],
  similarity: 0.99,
})

describe("isWholeGroupTrashed", () => {
  it("is true for an explicit empty kept set", () => {
    expect(isWholeGroupTrashed(new Set())).toBe(true)
  })

  it("is false when something is kept", () => {
    expect(isWholeGroupTrashed(new Set(["a"]))).toBe(false)
  })

  // No override means the default keep applies, which always keeps one.
  it("is false when there is no override at all", () => {
    expect(isWholeGroupTrashed(undefined)).toBe(false)
  })
})

describe("toggleWholeGroupTrashed", () => {
  it("marks an untouched group as fully trashed", () => {
    const next = toggleWholeGroupTrashed({}, "g1")
    expect(next.g1).toEqual(new Set())
  })

  it("clears a group that had a partial override", () => {
    const next = toggleWholeGroupTrashed({ g1: new Set(["a", "b"]) }, "g1")
    expect(next.g1).toEqual(new Set())
  })

  // Toggling back removes the override entirely so the default keep — which
  // now prefers favorites — applies again, rather than freezing a stale choice.
  it("restores the default by removing the override on the second toggle", () => {
    const trashed = toggleWholeGroupTrashed({}, "g1")
    const restored = toggleWholeGroupTrashed(trashed, "g1")
    expect("g1" in restored).toBe(false)
  })

  it("leaves other groups untouched", () => {
    const next = toggleWholeGroupTrashed({ g2: new Set(["x"]) }, "g1")
    expect(next.g2).toEqual(new Set(["x"]))
  })

  it("does not mutate the input", () => {
    const before = { g1: new Set(["a"]) }
    toggleWholeGroupTrashed(before, "g1")
    expect(before.g1).toEqual(new Set(["a"]))
  })
})

describe("countFullyTrashedGroups", () => {
  const groups = [group("g1", "a", "b"), group("g2", "c", "d"), group("g3", "e", "f")]

  it("counts selected groups with an empty kept set", () => {
    const kept = new Map([["g1", new Set<string>()], ["g2", new Set(["c"])], ["g3", new Set<string>()]])
    const n = countFullyTrashedGroups(groups, new Set(["g1", "g2", "g3"]), (g) => kept.get(g.id)!)
    expect(n).toBe(2)
  })

  it("ignores groups that are not selected for trashing", () => {
    const kept = new Map([["g1", new Set<string>()], ["g2", new Set<string>()], ["g3", new Set(["e"])]])
    const n = countFullyTrashedGroups(groups, new Set(["g3"]), (g) => kept.get(g.id)!)
    expect(n).toBe(0)
  })

  it("returns zero when every group keeps something", () => {
    const kept = new Map([["g1", new Set(["a"])], ["g2", new Set(["c"])], ["g3", new Set(["e"])]])
    const n = countFullyTrashedGroups(groups, new Set(["g1", "g2", "g3"]), (g) => kept.get(g.id)!)
    expect(n).toBe(0)
  })
})
