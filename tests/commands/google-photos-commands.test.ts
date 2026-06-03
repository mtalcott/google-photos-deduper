/**
 * Tests for scripts/google-photos-commands.js
 *
 * The commands script runs in a MAIN world context — it registers a
 * window "message" listener on import and uses window.postMessage to
 * communicate results back to the bridge. Tests drive it by dispatching
 * MessageEvents and inspecting postMessage calls.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"

// ============================================================
// Globals the script expects at runtime
// ============================================================

const mockMoveItemsToTrash = vi.fn()
const mockRestoreFromTrash = vi.fn()

const mockApi = {
  moveItemsToTrash: mockMoveItemsToTrash,
  restoreFromTrash: mockRestoreFromTrash,
}

// Set up window globals BEFORE importing the module so the script
// sees them when it first executes.
Object.defineProperty(window, "gptkApiUtils", {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ============================================================
// Import the commands script (registers listener on window)
// ============================================================

beforeAll(async () => {
  // google-photos-commands.js is a side-effect-only MAIN world script (no exports).
  // We import it here purely to register its window "message" listener.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("../../scripts/google-photos-commands.js")
})

// ============================================================
// Helpers
// ============================================================

/** Dispatch a gptkCommand message the same way the bridge does. */
function sendCommand(command: string, requestId: string, args: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: { app: "GPD", action: "gptkCommand", command, requestId, args },
    })
  )
}

/** Collect window.postMessage calls during an async operation. */
function collectMessages(): { messages: unknown[]; restore: () => void } {
  const messages: unknown[] = []
  const original = window.postMessage.bind(window)
  const spy = vi.spyOn(window, "postMessage").mockImplementation((msg) => {
    messages.push(msg)
  })
  return { messages, restore: () => spy.mockRestore() }
}

/** Wait for all queued microtasks / promise continuations to settle. */
async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

// ============================================================
// Reset between tests
// ============================================================

beforeEach(() => {
  mockMoveItemsToTrash.mockReset()
  mockRestoreFromTrash.mockReset()
  mockMoveItemsToTrash.mockResolvedValue(undefined)
  mockRestoreFromTrash.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================
// Unit tests: getAlbums
// ============================================================

describe("getAlbums", () => {
  it("fetches and maps albums", async () => {
    ;(window as any).gptkApi = {
      getAlbums: vi.fn().mockResolvedValue({
        items: [
          { mediaKey: "a1", title: "Album 1", thumb: "http://thumb/1", itemCount: 10 },
          { mediaKey: "a2", title: "Album 2", thumb: "http://thumb/2", itemCount: 20 }
        ],
        nextPageId: null
      }),
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAlbums", "req-alb-1", {})
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAlbums"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data).toHaveLength(2)
    expect(result?.data[0].title).toBe("Album 1")
    restore()
    delete (window as any).gptkApi
  })
})

// ============================================================
// Unit tests: getAllMediaItems
// ============================================================

describe("getAllMediaItems — album fetching", () => {
  it("fetches items from provided albumMediaKeys and deduplicates by mediaKey", async () => {
    ;(window as any).gptkApi = {
      getAlbumPage: vi.fn().mockImplementation((albumKey) => {
        if (albumKey === "album1") {
          return Promise.resolve({
            items: [
              { mediaKey: "mk1", dedupKey: "dk1", thumb: "th1", timestamp: 1000, creationTimestamp: 2000, resWidth: 1920, resHeight: 1080, isOwned: true, isOriginalQuality: true, descriptionShort: "file1.jpg" },
              { mediaKey: "mk2", dedupKey: "dk2", thumb: "th2", timestamp: 1001, creationTimestamp: 2001, resWidth: 1920, resHeight: 1080, isOwned: true, isOriginalQuality: true, descriptionShort: "file2.jpg" }
            ],
            nextPageId: null
          })
        }
        if (albumKey === "album2") {
          return Promise.resolve({
            items: [
              { mediaKey: "mk2", dedupKey: "dk2", thumb: "th2", timestamp: 1001, creationTimestamp: 2001, resWidth: 1920, resHeight: 1080, isOwned: true, isOriginalQuality: true, descriptionShort: "file2.jpg" }, // Duplicate
              { mediaKey: "mk3", dedupKey: "dk3", thumb: "th3", timestamp: 1002, creationTimestamp: 2002, resWidth: 1920, resHeight: 1080, isOwned: true, isOriginalQuality: false, descriptionShort: "file3.jpg" }
            ],
            nextPageId: null
          })
        }
      })
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-alb-2", { albumMediaKeys: ["album1", "album2"] })
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    
    expect(result?.success).toBe(true)
    // Should have 3 unique items
    expect(result?.data).toHaveLength(3)
    expect(result?.data.map((i: any) => i.mediaKey)).toEqual(["mk1", "mk2", "mk3"])
    restore()
    delete (window as any).gptkApi
  })

  it("retries fetching an album page upon failure and succeeds", async () => {
    vi.useFakeTimers()
    let attempts = 0
    ;(window as any).gptkApi = {
      getAlbumPage: vi.fn().mockImplementation((albumKey) => {
        attempts++
        if (attempts <= 2) {
          // Fail the first two times
          return Promise.reject(new Error("Network Error"))
        }
        // Succeed on the third try
        return Promise.resolve({
          items: [
            { mediaKey: "mk1", dedupKey: "dk1", thumb: "th1", timestamp: 1000, creationTimestamp: 2000, resWidth: 1920, resHeight: 1080, isOwned: true, isOriginalQuality: true, descriptionShort: "file1.jpg" }
          ],
          nextPageId: null
        })
      })
    }

    const { messages, restore } = collectMessages()
    try {
      sendCommand("getAllMediaItems", "req-alb-retry-success", { albumMediaKeys: ["album1"] })
      
      // Advance timers to trigger the retries without using flush()
      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(1000)

      const result = messages.find(
        (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
      ) as any
      
      expect(result?.success).toBe(true)
      expect(result?.data).toHaveLength(1)
      expect(attempts).toBe(3)
    } finally {
      restore()
      delete (window as any).gptkApi
      vi.useRealTimers()
    }
  })

  it("fails after maximum retries when fetching an album page", async () => {
    vi.useFakeTimers()
    let attempts = 0
    ;(window as any).gptkApi = {
      getAlbumPage: vi.fn().mockImplementation((albumKey) => {
        attempts++
        return Promise.resolve(null) // Simulates an empty payload, which triggers retry
      })
    }

    const { messages, restore } = collectMessages()
    try {
      sendCommand("getAllMediaItems", "req-alb-retry-fail", { albumMediaKeys: ["album1"] })
      
      // Advance timers three times for the 3 retries
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(10)
        await vi.advanceTimersByTimeAsync(1000)
      }

      const result = messages.find(
        (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
      ) as any
      
      expect(result?.success).toBe(false)
      expect(result?.error).toMatch(/after 3 retries/i)
      // 1 initial try + 3 retries = 4 attempts total
      expect(attempts).toBe(4)
    } finally {
      restore()
      delete (window as any).gptkApi
      vi.useRealTimers()
    }
  })
})

describe("getAllMediaItems — field mapping", () => {
  function setupGptkApi(items: unknown[], nextPageId: string | null = null) {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi.fn().mockResolvedValue({ items, nextPageId }),
    }
  }

  afterEach(() => {
    delete (window as any).gptkApi
  })

  it("passes isOriginalQuality=true through to output item", async () => {
    setupGptkApi([
      {
        mediaKey: "mk1",
        dedupKey: "dk1",
        thumb: "https://thumb/1",
        timestamp: 1000,
        creationTimestamp: 2000,
        isOriginalQuality: true,
      },
    ])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-oq-1", {})
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data[0].isOriginalQuality).toBe(true)
    restore()
  })

  it("passes isOriginalQuality=false (storage saver) through to output item", async () => {
    setupGptkApi([
      {
        mediaKey: "mk2",
        dedupKey: "dk2",
        thumb: "https://thumb/2",
        timestamp: 1000,
        creationTimestamp: 2000,
        isOriginalQuality: false,
      },
    ])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-oq-2", {})
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.data[0].isOriginalQuality).toBe(false)
    restore()
  })

  it("maps undefined isOriginalQuality to null", async () => {
    setupGptkApi([
      {
        mediaKey: "mk3",
        dedupKey: "dk3",
        thumb: "https://thumb/3",
        timestamp: 1000,
        creationTimestamp: 2000,
        // isOriginalQuality intentionally absent
      },
    ])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-oq-3", {})
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.data[0].isOriginalQuality).toBeNull()
    restore()
  })
})

// ============================================================
// Unit tests: getAllMediaItems — dateRange filtering
// ============================================================

describe("getAllMediaItems — dateRange filtering", () => {
  const mk1 = { mediaKey: "mk1", timestamp: new Date("2021-01-01").getTime(), thumb: "th1" }
  const mk2 = { mediaKey: "mk2", timestamp: new Date("2022-01-01").getTime(), thumb: "th2" }
  const mk3 = { mediaKey: "mk3", timestamp: new Date("2023-01-01").getTime(), thumb: "th3" }

  function setupGptkApi(items: unknown[]) {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi.fn().mockResolvedValue({ items, nextPageId: null }),
      getAlbumPage: vi.fn().mockResolvedValue({ items, nextPageId: null }),
    }
  }

  afterEach(() => {
    delete (window as any).gptkApi
  })

  it("filters out items outside the dateRange (full scan)", async () => {
    setupGptkApi([mk1, mk2, mk3])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-date-1", {
      dateRange: {
        from: "2021-06-01T00:00:00.000Z",
        to: "2022-06-01T00:00:00.000Z",
      }
    })
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    
    expect(result?.success).toBe(true)
    expect(result?.data).toHaveLength(1)
    expect(result?.data[0].mediaKey).toBe("mk2")
    restore()
  })

  it("filters out items outside the dateRange (album scan)", async () => {
    setupGptkApi([mk1, mk2, mk3])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-date-2", {
      albumMediaKeys: ["album1"],
      dateRange: {
        from: "2021-06-01T00:00:00.000Z",
        to: "2022-06-01T00:00:00.000Z",
      }
    })
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    
    expect(result?.success).toBe(true)
    expect(result?.data).toHaveLength(1)
    expect(result?.data[0].mediaKey).toBe("mk2")
    restore()
  })
})

// ============================================================
// Unit tests: trashItems
// ============================================================

describe("trashItems — chunking", () => {
  it("sends a single API call when items fit in one batch (≤ 250)", async () => {
    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 200 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-1", { dedupKeys, mediaKeysToTrash: [] })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(1)
    expect(mockMoveItemsToTrash).toHaveBeenCalledWith(dedupKeys)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data?.trashedCount).toBe(200)
    restore()
  })

  it("splits 550 items into 3 chunks: 250 + 250 + 50", async () => {
    const { restore } = collectMessages()
    const dedupKeys = Array.from({ length: 550 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-2", { dedupKeys, mediaKeysToTrash: [] })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(3)
    expect(mockMoveItemsToTrash.mock.calls[0][0]).toHaveLength(250)
    expect(mockMoveItemsToTrash.mock.calls[1][0]).toHaveLength(250)
    expect(mockMoveItemsToTrash.mock.calls[2][0]).toHaveLength(50)
    restore()
  })

  it("posts a progress message after each chunk", async () => {
    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 500 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-3", { dedupKeys, mediaKeysToTrash: [] })
    await flush()

    const progressMsgs = messages.filter(
      (m: any) => m.action === "gptkProgress" && m.command === "trashItems"
    ) as any[]

    // One progress message per chunk (2 chunks for 500 items)
    expect(progressMsgs).toHaveLength(2)
    expect(progressMsgs[0].itemsProcessed).toBe(250)
    expect(progressMsgs[1].itemsProcessed).toBe(500)
    restore()
  })

  it("reports error and stops on first API failure", async () => {
    mockMoveItemsToTrash.mockRejectedValueOnce(new Error("HTTP 504"))

    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 400 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-4", { dedupKeys, mediaKeysToTrash: [] })
    await flush()

    // Only called once — stops after the first failure
    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(1)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("HTTP 504")
    restore()
  })
})

// ============================================================
// Unit tests: restoreItems
// ============================================================

describe("restoreItems — chunking", () => {
  it("sends a single API call for ≤ 250 items", async () => {
    const { restore } = collectMessages()
    const dedupKeys = Array.from({ length: 100 }, (_, i) => `dk-${i}`)

    sendCommand("restoreItems", "req-5", { dedupKeys })
    await flush()

    expect(mockRestoreFromTrash).toHaveBeenCalledTimes(1)
    expect(mockRestoreFromTrash).toHaveBeenCalledWith(dedupKeys)
    restore()
  })

  it("splits 750 items into 3 chunks: 250 + 250 + 250", async () => {
    const { restore } = collectMessages()
    const dedupKeys = Array.from({ length: 750 }, (_, i) => `dk-${i}`)

    sendCommand("restoreItems", "req-6", { dedupKeys })
    await flush()

    expect(mockRestoreFromTrash).toHaveBeenCalledTimes(3)
    for (const call of mockRestoreFromTrash.mock.calls) {
      expect(call[0]).toHaveLength(250)
    }
    restore()
  })

  it("posts a progress message after each chunk", async () => {
    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 500 }, (_, i) => `dk-${i}`)

    sendCommand("restoreItems", "req-7", { dedupKeys })
    await flush()

    const progressMsgs = messages.filter(
      (m: any) => m.action === "gptkProgress" && m.command === "restoreItems"
    ) as any[]

    expect(progressMsgs).toHaveLength(2)
    expect(progressMsgs[0].itemsProcessed).toBe(250)
    expect(progressMsgs[1].itemsProcessed).toBe(500)
    restore()
  })
})

// ============================================================
// Integration test: full trash flow with a realistic large batch
// ============================================================

describe("integration: trashItems full flow", () => {
  it("chunks 1100 items into 5 batches, reports progress, and returns correct result", async () => {
    const { messages, restore } = collectMessages()

    const total = 1100
    const dedupKeys = Array.from({ length: total }, (_, i) => `dedup-${i}`)
    const mediaKeysToTrash = Array.from({ length: total }, (_, i) => `media-${i}`)

    sendCommand("trashItems", "req-int-1", { dedupKeys, mediaKeysToTrash })
    await flush()

    // 1100 / 250 = 4 full chunks + 1 remainder of 100 → 5 calls
    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(5)
    expect(mockMoveItemsToTrash.mock.calls[0][0]).toHaveLength(250)
    expect(mockMoveItemsToTrash.mock.calls[1][0]).toHaveLength(250)
    expect(mockMoveItemsToTrash.mock.calls[2][0]).toHaveLength(250)
    expect(mockMoveItemsToTrash.mock.calls[3][0]).toHaveLength(250)
    expect(mockMoveItemsToTrash.mock.calls[4][0]).toHaveLength(100)

    // Keys are passed in order and cover the full set
    const allSentKeys = mockMoveItemsToTrash.mock.calls.flatMap((c) => c[0])
    expect(allSentKeys).toEqual(dedupKeys)

    // 5 progress messages, monotonically increasing
    const progressMsgs = messages.filter(
      (m: any) => m.action === "gptkProgress" && m.command === "trashItems"
    ) as any[]
    expect(progressMsgs).toHaveLength(5)
    expect(progressMsgs.map((p: any) => p.itemsProcessed)).toEqual([
      250, 500, 750, 1000, 1100,
    ])

    // Final result message
    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data?.trashedCount).toBe(total)
    expect(result?.data?.trashedKeys).toEqual(mediaKeysToTrash)

    restore()
  })
})

// ============================================================
// getAllMediaItems — per-page timeout (PR #122)
//
// Google's pagination endpoint occasionally hangs without ever rejecting
// fetch(), which used to lock the UI on "Fetching media items" forever.
// withTimeout() races each page against a 60s timer so a stall surfaces as a
// real error instead of an indefinite hang.
// ============================================================

describe("getAllMediaItems — page timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as any).gptkApi
  })

  it("surfaces a timeout error when a page fetch never resolves", async () => {
    ;(window as any).gptkApi = {
      // Never resolves — simulates Google's pagination endpoint hanging.
      getItemsByUploadedDate: vi.fn(() => new Promise(() => {})),
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-timeout-1", {})

    // Advance past the 60s per-page timeout to trip the withTimeout race.
    await vi.advanceTimersByTimeAsync(60_000)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/timed out/i)
    restore()
  })

  it("does not error when the page resolves before the timeout fires", async () => {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi
        .fn()
        .mockResolvedValue({ items: [], nextPageId: null }),
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-timeout-2", {})

    // Flush microtasks (no real delay needed — the page resolves immediately).
    await vi.advanceTimersByTimeAsync(0)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(true)
    restore()
  })
})
