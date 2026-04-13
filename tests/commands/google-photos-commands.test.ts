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
