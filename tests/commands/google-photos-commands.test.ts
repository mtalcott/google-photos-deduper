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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"

// ============================================================
// Globals the script expects at runtime
// ============================================================

const mockMoveItemsToTrash = vi.fn()
const mockRestoreFromTrash = vi.fn()

const mockApi = {
  moveItemsToTrash: mockMoveItemsToTrash,
  restoreFromTrash: mockRestoreFromTrash
}

// Set up window globals BEFORE importing the module so the script
// sees them when it first executes.
Object.defineProperty(window, "gptkApiUtils", {
  value: { api: mockApi },
  writable: true,
  configurable: true
})

// ============================================================
// Import the commands script (registers listener on window)
// ============================================================

beforeAll(async () => {
  // google-photos-commands.js is a side-effect-only MAIN world script (no exports).
  // We import it here purely to register its window "message" listener.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("../../scripts/photo-provider-command-host.js")
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
      data: { app: "GPD", action: "gptkCommand", command, requestId, args }
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
  ;(window as any).gptkApiUtils = { api: mockApi }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================
// Unit tests: getAllMediaItems
// ============================================================

describe("getAllMediaItems — field mapping", () => {
  function setupGptkApi(items: unknown[], nextPageId: string | null = null) {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi.fn().mockResolvedValue({ items, nextPageId })
    }
  }

  function setupGptkAlbumApi(items: unknown[]) {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi.fn()
    }
    ;(window as any).gptkApiUtils = {
      api: mockApi,
      getAllMediaInAlbum: vi.fn().mockResolvedValue(items)
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
        isOriginalQuality: true
      }
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
        isOriginalQuality: false
      }
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
        creationTimestamp: 2000
        // isOriginalQuality intentionally absent
      }
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

  it("passes storage accounting fields through to output item", async () => {
    setupGptkApi([
      {
        mediaKey: "mk-storage",
        dedupKey: "dk-storage",
        thumb: "https://thumb/storage",
        timestamp: 1000,
        creationTimestamp: 2000,
        takesUpSpace: false,
        spaceTaken: 0
      }
    ])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-storage-1", {})
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.data[0]).toMatchObject({
      takesUpSpace: false,
      spaceTaken: 0
    })
    restore()
  })

  it("filters items outside the requested taken date range", async () => {
    setupGptkApi([
      {
        mediaKey: "before",
        dedupKey: "dk-before",
        thumb: "https://thumb/before",
        timestamp: Date.parse("2023-12-31T23:59:59.999Z"),
        creationTimestamp: Date.parse("2024-01-02T00:00:00.000Z")
      },
      {
        mediaKey: "inside",
        dedupKey: "dk-inside",
        thumb: "https://thumb/inside",
        timestamp: Date.parse("2024-06-15T12:00:00.000Z"),
        creationTimestamp: Date.parse("2024-06-16T00:00:00.000Z")
      },
      {
        mediaKey: "after",
        dedupKey: "dk-after",
        thumb: "https://thumb/after",
        timestamp: Date.parse("2025-01-01T00:00:00.000Z"),
        creationTimestamp: Date.parse("2025-01-02T00:00:00.000Z")
      }
    ])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-range-1", {
      dateRange: { from: "2024-01-01", to: "2024-12-31" }
    })
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data.map((item: any) => item.mediaKey)).toEqual(["inside"])
    restore()
  })

  it("reports scanned items for date ranges even before any item matches", async () => {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              mediaKey: "newer-outside-1",
              dedupKey: "dk-newer-outside-1",
              thumb: "https://thumb/newer-outside-1",
              timestamp: Date.parse("2026-01-01T00:00:00.000Z"),
              creationTimestamp: Date.parse("2026-01-02T00:00:00.000Z")
            },
            {
              mediaKey: "newer-outside-2",
              dedupKey: "dk-newer-outside-2",
              thumb: "https://thumb/newer-outside-2",
              timestamp: Date.parse("2025-01-01T00:00:00.000Z"),
              creationTimestamp: Date.parse("2025-01-02T00:00:00.000Z")
            }
          ],
          nextPageId: "next-page"
        })
        .mockResolvedValueOnce({
          items: [
            {
              mediaKey: "inside",
              dedupKey: "dk-inside",
              thumb: "https://thumb/inside",
              timestamp: Date.parse("2024-06-15T12:00:00.000Z"),
              creationTimestamp: Date.parse("2026-06-01T00:00:00.000Z")
            }
          ],
          nextPageId: null
        })
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-range-progress-1", {
      dateRange: { from: "2024-01-01", to: "2024-12-31" }
    })
    await flush()
    await flush()

    const progressMsgs = messages.filter(
      (m: any) =>
        m.action === "gptkProgress" &&
        typeof m.message === "string" &&
        m.message.startsWith("Scanned ")
    ) as any[]
    expect(progressMsgs.map((m) => m.itemsProcessed)).toEqual([2, 3])
    expect(progressMsgs[0].message).toBe("Scanned 2 items, matched 0")
    expect(progressMsgs[1].message).toBe("Scanned 3 items, matched 1")

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data.map((item: any) => item.mediaKey)).toEqual(["inside"])
    restore()
  })

  it("fetches media from a requested album scope", async () => {
    setupGptkAlbumApi([
      {
        mediaKey: "album-1",
        dedupKey: "dk-album-1",
        thumb: "https://thumb/album-1",
        timestamp: Date.parse("2024-06-15T12:00:00.000Z"),
        creationTimestamp: Date.parse("2024-06-16T00:00:00.000Z"),
        descriptionShort: "album-photo.jpg"
      },
      {
        mediaKey: "outside-date",
        dedupKey: "dk-outside-date",
        thumb: "https://thumb/outside-date",
        timestamp: Date.parse("2023-06-15T12:00:00.000Z"),
        creationTimestamp: Date.parse("2023-06-16T00:00:00.000Z")
      }
    ])

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-album-1", {
      albumScope: { mediaKey: "album-key", title: "Tiny test album" },
      dateRange: { from: "2024-01-01", to: "2024-12-31" }
    })
    await flush()

    expect(
      (window as any).gptkApiUtils.getAllMediaInAlbum
    ).toHaveBeenCalledWith("album-key")
    expect(
      (window as any).gptkApi.getItemsByUploadedDate
    ).not.toHaveBeenCalled()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data).toMatchObject([
      {
        mediaKey: "album-1",
        fileName: "album-photo.jpg"
      }
    ])
    restore()
  })

  it("fetches album media through the low-level page API when the GPTK helper is guarded", async () => {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi.fn()
    }
    ;(window as any).gptkApiUtils = {
      api: {
        ...mockApi,
        getAlbumPage: vi
          .fn()
          .mockResolvedValueOnce({
            items: [
              {
                mediaKey: "album-page-1",
                dedupKey: "dk-album-page-1",
                thumb: "https://thumb/album-page-1",
                timestamp: Date.parse("2024-06-15T12:00:00.000Z"),
                creationTimestamp: Date.parse("2024-06-16T00:00:00.000Z")
              }
            ],
            nextPageId: "next"
          })
          .mockResolvedValueOnce({
            items: [
              {
                mediaKey: "album-page-2",
                dedupKey: "dk-album-page-2",
                thumb: "https://thumb/album-page-2",
                timestamp: Date.parse("2024-06-15T12:01:00.000Z"),
                creationTimestamp: Date.parse("2024-06-16T00:01:00.000Z")
              }
            ],
            nextPageId: null
          })
      },
      getAllMediaInAlbum: vi.fn().mockResolvedValue([])
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-album-page-1", {
      albumScope: { mediaKey: "album-key", title: "Tiny test album" }
    })
    await flush()

    const getAlbumPage = (window as any).gptkApiUtils.api.getAlbumPage
    expect(getAlbumPage).toHaveBeenCalledWith("album-key", null)
    expect(getAlbumPage).toHaveBeenCalledWith("album-key", "next")
    expect(
      (window as any).gptkApiUtils.getAllMediaInAlbum
    ).not.toHaveBeenCalled()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data.map((item: any) => item.mediaKey)).toEqual([
      "album-page-1",
      "album-page-2"
    ])
    restore()
  })
})

describe("listAlbums", () => {
  it("returns mapped GPTK albums for the scan picker", async () => {
    ;(window as any).gptkApiUtils = {
      api: mockApi,
      getAllAlbums: vi.fn().mockResolvedValue([
        {
          mediaKey: "album-1",
          title: "Tiny test album",
          itemCount: 3,
          isShared: false
        },
        {
          mediaKey: "album-2",
          itemCount: 2,
          isShared: true
        }
      ])
    }

    const { messages, restore } = collectMessages()
    sendCommand("listAlbums", "req-albums-1", {})
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "listAlbums"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data).toEqual([
      {
        mediaKey: "album-1",
        title: "Tiny test album",
        itemCount: 3,
        isShared: false
      },
      {
        mediaKey: "album-2",
        title: "(Untitled album)",
        itemCount: 2,
        isShared: true
      }
    ])
    restore()
  })

  it("lists albums through the low-level page API when the GPTK helper is guarded", async () => {
    ;(window as any).gptkApiUtils = {
      api: {
        ...mockApi,
        getAlbums: vi
          .fn()
          .mockResolvedValueOnce({
            items: [
              {
                mediaKey: "album-page-1",
                title: "Tiny duplicate test",
                itemCount: 3,
                isShared: false
              }
            ],
            nextPageId: "next"
          })
          .mockResolvedValueOnce({
            items: [
              {
                mediaKey: "album-page-2",
                title: "Older album",
                itemCount: 2,
                isShared: true
              }
            ],
            nextPageId: null
          })
      },
      getAllAlbums: vi.fn().mockResolvedValue([])
    }

    const { messages, restore } = collectMessages()
    sendCommand("listAlbums", "req-albums-pages-1", {})
    await flush()

    const getAlbums = (window as any).gptkApiUtils.api.getAlbums
    expect(getAlbums).toHaveBeenCalledWith(null)
    expect(getAlbums).toHaveBeenCalledWith("next")
    expect((window as any).gptkApiUtils.getAllAlbums).not.toHaveBeenCalled()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "listAlbums"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data.map((album: any) => album.title)).toEqual([
      "Tiny duplicate test",
      "Older album"
    ])
    restore()
  })
})

// ============================================================
// Unit tests: trashItems
// ============================================================

describe("trashItems — chunking", () => {
  it("sends a single API call when items fit in one conservative batch (≤ 25)", async () => {
    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 20 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-1", { dedupKeys })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(1)
    expect(mockMoveItemsToTrash).toHaveBeenCalledWith(dedupKeys)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data?.trashedCount).toBe(20)
    restore()
  })

  it("splits 55 items into 3 chunks: 25 + 25 + 5", async () => {
    const { restore } = collectMessages()
    const dedupKeys = Array.from({ length: 55 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-2", { dedupKeys })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(3)
    expect(mockMoveItemsToTrash.mock.calls[0][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[1][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[2][0]).toHaveLength(5)
    restore()
  })

  it("caps requested trash batch size at 25", async () => {
    const { restore } = collectMessages()
    const dedupKeys = Array.from({ length: 60 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-2b", {
      dedupKeys,
      batchSize: 250
    })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(3)
    expect(mockMoveItemsToTrash.mock.calls[0][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[1][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[2][0]).toHaveLength(10)
    restore()
  })

  it("posts a progress message after each chunk", async () => {
    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 50 }, (_, i) => `dk-${i}`)
    const mediaKeysToTrash = Array.from({ length: 50 }, (_, i) => `mk-${i}`)

    sendCommand("trashItems", "req-3", { dedupKeys, mediaKeysToTrash })
    await flush()

    const progressMsgs = messages.filter(
      (m: any) => m.action === "gptkProgress" && m.command === "trashItems"
    ) as any[]

    // One progress message per chunk (2 chunks for 50 items)
    expect(progressMsgs).toHaveLength(2)
    expect(progressMsgs[0].itemsProcessed).toBe(25)
    expect(progressMsgs[0].data).toMatchObject({
      trashedKeys: mediaKeysToTrash.slice(0, 25),
      trashedDedupKeys: dedupKeys.slice(0, 25)
    })
    expect(progressMsgs[1].itemsProcessed).toBe(50)
    expect(progressMsgs[1].data).toMatchObject({
      trashedKeys: mediaKeysToTrash,
      trashedDedupKeys: dedupKeys
    })
    restore()
  })

  it("retries a failing batch before reporting failure", async () => {
    mockMoveItemsToTrash.mockRejectedValue(new Error("HTTP 504"))

    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 40 }, (_, i) => `dk-${i}`)

    sendCommand("trashItems", "req-4", { dedupKeys })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(3)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("HTTP 504")
    expect(result?.data).toMatchObject({
      partial: false,
      trashedCount: 0,
      trashedKeys: [],
      trashedDedupKeys: [],
      retryAttempts: 2
    })
    restore()
  })

  it("continues when a retry succeeds", async () => {
    mockMoveItemsToTrash
      .mockRejectedValueOnce(new Error("HTTP 504"))
      .mockResolvedValueOnce(undefined)

    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 20 }, (_, i) => `dk-${i}`)
    const mediaKeysToTrash = Array.from({ length: 20 }, (_, i) => `mk-${i}`)

    sendCommand("trashItems", "req-4-retry", { dedupKeys, mediaKeysToTrash })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(2)
    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data).toMatchObject({
      trashedCount: 20,
      trashedKeys: mediaKeysToTrash,
      trashedDedupKeys: dedupKeys,
      retryAttempts: 1
    })
    restore()
  })

  it("uses explicit moved keys from a structured trash response", async () => {
    const dedupKeys = Array.from({ length: 3 }, (_, i) => `dk-${i}`)
    const mediaKeysToTrash = Array.from({ length: 3 }, (_, i) => `mk-${i}`)
    mockMoveItemsToTrash.mockResolvedValue({
      movedDedupKeys: dedupKeys
    })

    const { messages, restore } = collectMessages()

    sendCommand("trashItems", "req-4-structured", {
      dedupKeys,
      mediaKeysToTrash,
      retryCount: 0
    })
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(true)
    expect(result?.data).toMatchObject({
      trashedCount: 3,
      trashedKeys: mediaKeysToTrash,
      trashedDedupKeys: dedupKeys
    })
    restore()
  })

  it("fails closed when a structured trash response reports a partial chunk", async () => {
    const dedupKeys = ["dk-0", "dk-1", "dk-2"]
    const mediaKeysToTrash = ["mk-0", "mk-1", "mk-2"]
    mockMoveItemsToTrash.mockResolvedValue({
      movedDedupKeys: ["dk-0", "dk-2"],
      failedDedupKeys: ["dk-1"]
    })

    const { messages, restore } = collectMessages()

    sendCommand("trashItems", "req-4-partial", {
      dedupKeys,
      mediaKeysToTrash,
      retryCount: 0
    })
    await flush()

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("2 of 3 items moved")
    expect(result?.data).toMatchObject({
      partial: true,
      trashedCount: 2,
      trashedKeys: ["mk-0", "mk-2"],
      trashedDedupKeys: ["dk-0", "dk-2"],
      retryAttempts: 0
    })
    restore()
  })

  it("reports completed batches when a later batch fails", async () => {
    mockMoveItemsToTrash
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("HTTP 504"))

    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 40 }, (_, i) => `dk-${i}`)
    const mediaKeysToTrash = Array.from({ length: 40 }, (_, i) => `mk-${i}`)

    sendCommand("trashItems", "req-4b", { dedupKeys, mediaKeysToTrash })
    await flush()

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(4)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("HTTP 504")
    expect(result?.data).toMatchObject({
      partial: true,
      trashedCount: 25,
      trashedKeys: mediaKeysToTrash.slice(0, 25),
      trashedDedupKeys: dedupKeys.slice(0, 25),
      retryAttempts: 2
    })
    restore()
  })

  it("times out and reports completed batches when a later batch hangs", async () => {
    vi.useFakeTimers()
    mockMoveItemsToTrash
      .mockResolvedValueOnce(undefined)
      .mockImplementation(() => new Promise(() => {}))

    const { messages, restore } = collectMessages()
    const dedupKeys = Array.from({ length: 40 }, (_, i) => `dk-${i}`)
    const mediaKeysToTrash = Array.from({ length: 40 }, (_, i) => `mk-${i}`)

    sendCommand("trashItems", "req-4c", {
      dedupKeys,
      mediaKeysToTrash,
      chunkTimeoutMs: 1000
    })
    await vi.advanceTimersByTimeAsync(3_000)

    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(4)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("timed out")
    expect(result?.data).toMatchObject({
      partial: true,
      trashedCount: 25,
      trashedKeys: mediaKeysToTrash.slice(0, 25),
      trashedDedupKeys: dedupKeys.slice(0, 25),
      retryAttempts: 2
    })
    vi.useRealTimers()
    restore()
  })
})

describe("trashItems — argument validation", () => {
  it("rejects missing dedupKeys without calling the API", async () => {
    const { messages, restore } = collectMessages()

    sendCommand("trashItems", "req-trash-invalid-1", {})
    await flush()

    expect(mockMoveItemsToTrash).not.toHaveBeenCalled()
    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("dedupKeys")
    restore()
  })

  it("rejects empty, non-string, and duplicate dedupKeys", async () => {
    const cases = [
      { dedupKeys: [] },
      { dedupKeys: ["dk-1", ""] },
      { dedupKeys: ["dk-1", 123] },
      { dedupKeys: ["dk-1", "dk-1"] }
    ]

    for (const [index, args] of cases.entries()) {
      const { messages, restore } = collectMessages()

      sendCommand("trashItems", `req-trash-invalid-${index + 2}`, args)
      await flush()

      const result = messages.find(
        (m: any) => m.action === "gptkResult" && m.command === "trashItems"
      ) as any
      expect(result?.success).toBe(false)
      expect(result?.error).toContain("dedupKeys")
      restore()
    }
    expect(mockMoveItemsToTrash).not.toHaveBeenCalled()
  })

  it("rejects mismatched mediaKeysToTrash without calling the API", async () => {
    const { messages, restore } = collectMessages()

    sendCommand("trashItems", "req-trash-invalid-media", {
      dedupKeys: ["dk-1", "dk-2"],
      mediaKeysToTrash: ["mk-1"]
    })
    await flush()

    expect(mockMoveItemsToTrash).not.toHaveBeenCalled()
    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("mediaKeysToTrash")
    restore()
  })

  it("rejects invalid mediaKeysToTrash values without calling the API", async () => {
    const { messages, restore } = collectMessages()

    sendCommand("trashItems", "req-trash-invalid-media-value", {
      dedupKeys: ["dk-1", "dk-2"],
      mediaKeysToTrash: ["mk-1", ""]
    })
    await flush()

    expect(mockMoveItemsToTrash).not.toHaveBeenCalled()
    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "trashItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("mediaKeysToTrash")
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

describe("restoreItems — argument validation", () => {
  it("rejects missing dedupKeys without calling the API", async () => {
    const { messages, restore } = collectMessages()

    sendCommand("restoreItems", "req-restore-invalid-1", {})
    await flush()

    expect(mockRestoreFromTrash).not.toHaveBeenCalled()
    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "restoreItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toContain("dedupKeys")
    restore()
  })

  it("rejects empty, non-string, and duplicate dedupKeys", async () => {
    const cases = [
      { dedupKeys: [] },
      { dedupKeys: ["dk-1", ""] },
      { dedupKeys: ["dk-1", 123] },
      { dedupKeys: ["dk-1", "dk-1"] }
    ]

    for (const [index, args] of cases.entries()) {
      const { messages, restore } = collectMessages()

      sendCommand("restoreItems", `req-restore-invalid-${index + 2}`, args)
      await flush()

      const result = messages.find(
        (m: any) => m.action === "gptkResult" && m.command === "restoreItems"
      ) as any
      expect(result?.success).toBe(false)
      expect(result?.error).toContain("dedupKeys")
      restore()
    }
    expect(mockRestoreFromTrash).not.toHaveBeenCalled()
  })
})

// ============================================================
// Integration test: full trash flow with a realistic large batch
// ============================================================

describe("integration: trashItems full flow", () => {
  it("chunks 110 items into 5 conservative batches, reports progress, and returns correct result", async () => {
    const { messages, restore } = collectMessages()

    const total = 110
    const dedupKeys = Array.from({ length: total }, (_, i) => `dedup-${i}`)
    const mediaKeysToTrash = Array.from(
      { length: total },
      (_, i) => `media-${i}`
    )

    sendCommand("trashItems", "req-int-1", { dedupKeys, mediaKeysToTrash })
    await flush()

    // 110 / 25 = 4 full chunks + 1 remainder of 10 → 5 calls
    expect(mockMoveItemsToTrash).toHaveBeenCalledTimes(5)
    expect(mockMoveItemsToTrash.mock.calls[0][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[1][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[2][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[3][0]).toHaveLength(25)
    expect(mockMoveItemsToTrash.mock.calls[4][0]).toHaveLength(10)

    // Keys are passed in order and cover the full set
    const allSentKeys = mockMoveItemsToTrash.mock.calls.flatMap((c) => c[0])
    expect(allSentKeys).toEqual(dedupKeys)

    // 5 progress messages, monotonically increasing
    const progressMsgs = messages.filter(
      (m: any) => m.action === "gptkProgress" && m.command === "trashItems"
    ) as any[]
    expect(progressMsgs).toHaveLength(5)
    expect(progressMsgs.map((p: any) => p.itemsProcessed)).toEqual([
      25, 50, 75, 100, 110
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
// withTimeout() races each page against a short timer so a stall surfaces as a
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
      getItemsByUploadedDate: vi.fn(() => new Promise(() => {}))
    }

    const { messages, restore } = collectMessages()
    sendCommand("getAllMediaItems", "req-timeout-1", {})

    // Advance past all page timeout retries to trip the withTimeout race.
    await vi.advanceTimersByTimeAsync(65_000)

    const result = messages.find(
      (m: any) => m.action === "gptkResult" && m.command === "getAllMediaItems"
    ) as any
    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/timed out/i)
    expect((window as any).gptkApi.getItemsByUploadedDate).toHaveBeenCalledTimes(
      3
    )
    restore()
  })

  it("does not error when the page resolves before the timeout fires", async () => {
    ;(window as any).gptkApi = {
      getItemsByUploadedDate: vi
        .fn()
        .mockResolvedValue({ items: [], nextPageId: null })
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
