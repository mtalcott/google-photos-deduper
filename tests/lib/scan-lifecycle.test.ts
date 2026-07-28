import { describe, expect, it, vi } from "vitest"

import type { ScanCheckpoint } from "../../lib/scan-checkpoint"
import { ScanLifecycle } from "../../lib/scan-lifecycle"
import { DEFAULT_SETTINGS } from "../../lib/types"

function harness() {
  const persisted: ScanCheckpoint[] = []
  const clear = vi.fn()
  let now = 10
  const lifecycle = new ScanLifecycle({
    persist: (checkpoint) => {
      persisted.push(checkpoint)
    },
    clear,
    now: () => ++now
  })
  return { lifecycle, persisted, clear }
}

describe("ScanLifecycle", () => {
  it("starts one current request and persists its checkpoint", () => {
    const { lifecycle, persisted } = harness()
    const started = lifecycle.begin({
      requestId: "scan-1",
      settings: DEFAULT_SETTINGS,
      accountEmail: "person@example.com"
    })

    expect(lifecycle.isCurrent("scan-1")).toBe(true)
    expect(started.checkpoint).toMatchObject({
      id: "scan-1",
      status: "active",
      phase: "fetching"
    })
    expect(persisted).toHaveLength(1)
  })

  it("rejects stale progress without changing the checkpoint", () => {
    const { lifecycle, persisted } = harness()
    lifecycle.begin({ requestId: "scan-1", settings: DEFAULT_SETTINGS })

    expect(lifecycle.patch({ itemsProcessed: 50 }, "stale-scan")).toBeNull()
    expect(lifecycle.checkpoint?.itemsProcessed).toBe(0)
    expect(persisted).toHaveLength(1)
  })

  it("pauses the current request and preserves a resumable checkpoint", () => {
    const { lifecycle, persisted } = harness()
    lifecycle.begin({ requestId: "scan-1", settings: DEFAULT_SETTINGS })
    lifecycle.patch({ itemsProcessed: 12 }, "scan-1")

    const paused = lifecycle.pause("scan-1")

    expect(paused).toMatchObject({
      status: "interrupted",
      itemsProcessed: 12
    })
    expect(lifecycle.requestId).toBeNull()
    expect(lifecycle.signal).toBeNull()
    expect(persisted.at(-1)?.status).toBe("interrupted")
  })

  it("resumes with a new request identity and retains checkpoint history", () => {
    const { lifecycle } = harness()
    lifecycle.begin({ requestId: "scan-1", settings: DEFAULT_SETTINGS })
    const paused = lifecycle.pause("scan-1")!

    lifecycle.resume({
      requestId: "scan-2",
      checkpoint: paused,
      patch: {
        phase: "computing_embeddings",
        message: "Resuming"
      }
    })

    expect(lifecycle.isCurrent("scan-2")).toBe(true)
    expect(lifecycle.checkpoint).toMatchObject({
      id: "scan-2",
      status: "active",
      phase: "computing_embeddings"
    })
  })

  it("turns a restored active checkpoint into an interrupted one", () => {
    const { lifecycle } = harness()
    const started = lifecycle.begin({
      requestId: "scan-1",
      settings: DEFAULT_SETTINGS
    })

    const restored = lifecycle.restore(started.checkpoint)

    expect(restored?.status).toBe("interrupted")
    expect(lifecycle.requestId).toBeNull()
  })

  it("records failure only for the current request", () => {
    const { lifecycle } = harness()
    lifecycle.begin({ requestId: "scan-1", settings: DEFAULT_SETTINGS })

    expect(lifecycle.fail("stale", new Error("ignored"))).toBeNull()
    const failed = lifecycle.fail("scan-1", new Error("boom"))

    expect(failed).toMatchObject({ status: "error" })
    expect(failed?.error).toContain("boom")
    expect(lifecycle.requestId).toBeNull()
  })

  it("clears persisted state only when the current request completes", async () => {
    const { lifecycle, clear } = harness()
    lifecycle.begin({ requestId: "scan-1", settings: DEFAULT_SETTINGS })

    await expect(lifecycle.complete("stale")).resolves.toBe(false)
    expect(clear).not.toHaveBeenCalled()
    await expect(lifecycle.complete("scan-1")).resolves.toBe(true)
    expect(clear).toHaveBeenCalledOnce()
    expect(lifecycle.checkpoint).toBeNull()
  })
})
