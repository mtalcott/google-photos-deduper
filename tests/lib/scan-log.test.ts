/**
 * Unit tests for lib/scan-log.ts — ScanLogger and StabilityTracker.
 *
 * chrome.storage.local is mocked in-memory. Each test gets a fresh store
 * so state never leaks between tests.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ScanLogger, StabilityTracker } from "../../lib/scan-log"

// ============================================================
// chrome.storage.local mock
// ============================================================

let store: Record<string, unknown> = {}

const mockStorage = {
  get: vi.fn(async (key: string | string[] | null) => {
    if (key === null) return { ...store }
    if (typeof key === "string") return { [key]: store[key] }
    return Object.fromEntries((key as string[]).map((k) => [k, store[k]]))
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items)
  }),
  remove: vi.fn(async (key: string | string[]) => {
    const keys = typeof key === "string" ? [key] : key
    for (const k of keys) delete store[k]
  }),
  clear: vi.fn(async () => {
    store = {}
  }),
}

vi.stubGlobal("chrome", { storage: { local: mockStorage } })

beforeEach(() => {
  store = {}
  vi.clearAllMocks()
})

// ============================================================
// ScanLogger tests
// ============================================================

describe("ScanLogger", () => {
  describe("start + finalize", () => {
    it("writes an active entry to storage on start", async () => {
      const logger = new ScanLogger()
      await logger.start(5000)

      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          scanLogActive: expect.objectContaining({
            totalItems: 5000,
            candidates: 0,
            cacheHits: 0,
          }),
        })
      )
    })

    it("commits a log entry and removes active key on finalize", async () => {
      const logger = new ScanLogger()
      await logger.start(1000)
      await logger.finalize("complete", { groupsFound: 42 })

      expect(store["scanLogs"]).toHaveLength(1)
      const entry = (store["scanLogs"] as unknown[])[0] as Record<string, unknown>
      expect(entry.status).toBe("complete")
      expect(entry.groupsFound).toBe(42)
      expect(entry.totalItems).toBe(1000)
      expect(store["scanLogActive"]).toBeUndefined()
    })

    it("sets status to 'error' and records error string on finalize", async () => {
      const logger = new ScanLogger()
      await logger.start(200)
      await logger.finalize("error", { error: "Network timeout" })

      const entry = (store["scanLogs"] as unknown[])[0] as Record<string, unknown>
      expect(entry.status).toBe("error")
      expect(entry.error).toBe("Network timeout")
    })

    it("does not write to storage when finalize is called without start", async () => {
      const logger = new ScanLogger()
      await logger.finalize("complete")
      expect(mockStorage.set).not.toHaveBeenCalled()
    })
  })

  describe("updateInfo", () => {
    it("updates candidates and cacheHits in the active entry", async () => {
      const logger = new ScanLogger()
      await logger.start(3000)
      logger.updateInfo({ candidates: 1200, cacheHits: 800 })

      // updateInfo is fire-and-forget; wait a tick for the microtask
      await Promise.resolve()

      const lastCall = mockStorage.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      const active = lastCall?.["scanLogActive"] as Record<string, unknown>
      expect(active?.candidates).toBe(1200)
      expect(active?.cacheHits).toBe(800)
    })

    it("is a no-op when called before start", () => {
      const logger = new ScanLogger()
      logger.updateInfo({ candidates: 5, cacheHits: 3 })
      expect(mockStorage.set).not.toHaveBeenCalled()
    })
  })

  describe("phaseComplete", () => {
    it("records phase timing in the active entry", async () => {
      const logger = new ScanLogger()
      await logger.start(500)
      await logger.phaseComplete("fetchThumbnailsMs", 1234)

      const lastCall = mockStorage.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      const active = lastCall?.["scanLogActive"] as Record<string, unknown>
      const timings = active?.["phaseTimings"] as Record<string, number>
      expect(timings?.fetchThumbnailsMs).toBe(1234)
    })
  })

  describe("recoverStale", () => {
    it("commits stale active entry as killed_by_reload if present", async () => {
      // Seed a stale active entry (simulating a mid-scan page reload)
      store["scanLogActive"] = {
        startedAt: Date.now() - 5000,
        totalItems: 800,
        candidates: 600,
        cacheHits: 200,
        phaseTimings: { fetchThumbnailsMs: 1500 },
        stableEstimates: [],
      }

      const logger = new ScanLogger()
      await logger.recoverStale()

      expect(store["scanLogs"]).toHaveLength(1)
      const entry = (store["scanLogs"] as unknown[])[0] as Record<string, unknown>
      expect(entry.status).toBe("killed_by_reload")
      expect(entry.totalItems).toBe(800)
    })

    it("is a no-op when no active entry exists", async () => {
      const logger = new ScanLogger()
      await logger.recoverStale()
      expect(store["scanLogs"]).toBeUndefined()
    })
  })

  describe("log rotation", () => {
    it("caps stored entries at 50 (MAX_ENTRIES)", async () => {
      // Pre-fill 50 entries
      store["scanLogs"] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: i,
        status: "complete",
        totalItems: i,
        candidates: 0,
        cacheHits: 0,
        phaseTimings: {},
        totalMs: 100,
        stableEstimates: [],
      }))

      const logger = new ScanLogger()
      await logger.start(999)
      await logger.finalize("complete")

      const logs = store["scanLogs"] as unknown[]
      expect(logs).toHaveLength(50)
      // The newest entry should be at the end
      const last = logs[49] as Record<string, unknown>
      expect(last.totalItems).toBe(999)
    })
  })

  describe("recordStableEstimate", () => {
    it("appends stable estimates to the active entry", async () => {
      const logger = new ScanLogger()
      await logger.start(1000)
      logger.recordStableEstimate({
        phase: "computing_embeddings",
        estimatedMs: 30000,
        atPercent: 15,
      })

      await Promise.resolve()

      const lastCall = mockStorage.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      const active = lastCall?.["scanLogActive"] as Record<string, unknown>
      const estimates = active?.["stableEstimates"] as unknown[]
      expect(estimates).toHaveLength(1)
      expect(estimates[0]).toMatchObject({ phase: "computing_embeddings", atPercent: 15 })
    })
  })
})

// ============================================================
// StabilityTracker tests
// ============================================================

describe("StabilityTracker", () => {
  // Mock performance.now() to return controlled timestamps so estimates
  // converge deterministically regardless of actual test execution speed.
  // The tracker uses elapsedMs = performance.now() - phaseStart to project
  // total phase duration. We return linearly increasing values so all three
  // window samples produce the same projected total (~1000ms).
  let perfNow: ReturnType<typeof vi.spyOn>
  // Call counter used to control return values across multiple calls
  let nowCallIndex: number

  beforeEach(() => {
    nowCallIndex = 0
    perfNow = vi.spyOn(performance, "now").mockImplementation(() => {
      // Pattern: phaseStart call → 0, then elapsedMs calls → progress*1000
      // This makes each window sample = elapsed/progress = 1000ms (all equal)
      const schedule = [0, 110, 220, 330, 440, 550, 660, 770]
      return schedule[nowCallIndex++ % schedule.length] ?? 0
    })
  })

  afterEach(() => {
    perfNow.mockRestore()
  })

  it("fires onStable when three consecutive estimates converge", () => {
    const onStable = vi.fn()
    const tracker = new StabilityTracker(onStable, 3, 0.05, 0.1)

    // Call 1: phaseStart = 0, elapsedMs = 110 → 110/0.11 = 1000
    // Call 2: elapsedMs = 220 → 220/0.22 = 1000
    // Call 3: elapsedMs = 330 → 330/0.33 = 1000
    // Window = [1000, 1000, 1000] → max/min = 1.0 ≤ 1.05 → stable
    tracker.update("computing_embeddings", 110, 1000)
    tracker.update("computing_embeddings", 220, 1000)
    tracker.update("computing_embeddings", 330, 1000)

    expect(onStable).toHaveBeenCalledTimes(1)
    const est = onStable.mock.calls[0][0]
    expect(est.phase).toBe("computing_embeddings")
    expect(est.estimatedMs).toBe(1000)
    expect(est.atPercent).toBe(33)
  })

  it("does not fire before minProgress threshold", () => {
    const onStable = vi.fn()
    const tracker = new StabilityTracker(onStable, 3, 0.05, 0.1)

    // Only 5% progress — below the 10% default minProgress
    tracker.update("fetching", 5, 100)
    tracker.update("fetching", 5, 100)
    tracker.update("fetching", 5, 100)

    expect(onStable).not.toHaveBeenCalled()
  })

  it("fires onStable at most once per phase", () => {
    const onStable = vi.fn()
    const tracker = new StabilityTracker(onStable, 3, 0.05, 0.1)

    // Fill window → fires once on the 3rd call
    tracker.update("p1", 110, 1000)
    tracker.update("p1", 220, 1000)
    tracker.update("p1", 330, 1000)
    // 4th and 5th calls return early (firedPhases.has("p1")); no extra fires
    tracker.update("p1", 440, 1000)
    tracker.update("p1", 550, 1000)

    expect(onStable).toHaveBeenCalledTimes(1)
  })

  it("resets window on phase transition", () => {
    const onStable = vi.fn()
    const tracker = new StabilityTracker(onStable, 3, 0.05, 0.1)

    // phase-a: 2 samples — window incomplete (length 2 < 3), returns early
    tracker.update("phase-a", 110, 1000)
    tracker.update("phase-a", 220, 1000)
    // phase-b: window resets, 3 samples fill it → fires
    tracker.update("phase-b", 110, 1000)
    tracker.update("phase-b", 220, 1000)
    tracker.update("phase-b", 330, 1000)

    // phase-a never completed its window; only phase-b fired
    expect(onStable).toHaveBeenCalledTimes(1)
    expect(onStable.mock.calls[0][0].phase).toBe("phase-b")
  })

  it("is a no-op when total is 0", () => {
    const onStable = vi.fn()
    const tracker = new StabilityTracker(onStable)
    tracker.update("fetching", 10, 0)
    expect(onStable).not.toHaveBeenCalled()
  })
})
