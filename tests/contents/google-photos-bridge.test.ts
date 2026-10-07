/**
 * Tests for contents/google-photos-bridge.ts
 *
 * The bridge is an ISOLATED world content script that relays MAIN world
 * window.postMessage traffic to the service worker. Tests drive it by
 * dispatching MessageEvents and inspecting chrome.runtime.sendMessage.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { APP_ID } from "../../lib/types"

const mockSendMessage = vi.fn()

const mockChrome = {
  runtime: {
    sendMessage: mockSendMessage,
    getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
    getManifest: vi.fn(() => ({ version: "0.0.0" })),
    onMessage: { addListener: vi.fn() },
  },
}

vi.stubGlobal("chrome", mockChrome)

beforeAll(async () => {
  await import("../../contents/google-photos-bridge")
})

beforeEach(() => {
  mockSendMessage.mockReset()
  mockSendMessage.mockResolvedValue(undefined)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

/** Dispatch a message the way a MAIN world script does. */
function postFromPage(data: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", { source: window, data })
  )
}

/** Messages the bridge actually handed to chrome.runtime.sendMessage. */
function forwarded() {
  return mockSendMessage.mock.calls.map((c) => c[0])
}

describe("bridge — message forwarding", () => {
  it.each([
    "gptkResult",
    "gptkResultChunk",
    "gptkProgress",
    "gptkLog",
  ])("forwards %s to the service worker", (action) => {
    postFromPage({ app: APP_ID, action, command: "getAllMediaItems", requestId: "r1" })
    expect(forwarded()).toHaveLength(1)
    expect(forwarded()[0].action).toBe(action)
  })

  it("ignores messages from other apps", () => {
    postFromPage({ app: "SOMETHING_ELSE", action: "gptkResult" })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it("ignores actions it does not relay", () => {
    postFromPage({ app: APP_ID, action: "gptkCommand", command: "x", requestId: "r1" })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe("bridge — delivery failures surface as errors", () => {
  // Chrome throws this synchronously, which is what made #147 a silent hang.
  const OVERSIZE = "Message exceeded maximum allowed size of 64MiB."

  it("reports a synchronous send failure as a failed gptkResult", () => {
    mockSendMessage.mockImplementationOnce(() => {
      throw new Error(OVERSIZE)
    })

    postFromPage({
      app: APP_ID,
      action: "gptkResult",
      command: "getAllMediaItems",
      requestId: "req-1",
      success: true,
      data: [],
    })

    const reply = forwarded()[1]
    expect(reply).toMatchObject({
      app: APP_ID,
      action: "gptkResult",
      command: "getAllMediaItems",
      requestId: "req-1",
      success: false,
    })
    expect(reply.error).toContain(OVERSIZE)
    // The error reply must not carry the payload that failed to send
    expect(reply.data).toBeUndefined()
  })

  it("reports a failed chunk against the same requestId", () => {
    mockSendMessage.mockImplementationOnce(() => {
      throw new Error(OVERSIZE)
    })

    postFromPage({
      app: APP_ID,
      action: "gptkResultChunk",
      command: "getAllMediaItems",
      requestId: "req-2",
      chunkIndex: 0,
      totalChunks: 3,
      data: [],
    })

    expect(forwarded()[1]).toMatchObject({
      action: "gptkResult",
      command: "getAllMediaItems",
      requestId: "req-2",
      success: false,
    })
  })

  it("reports an asynchronous send rejection", async () => {
    mockSendMessage.mockRejectedValueOnce(
      new Error("Could not establish connection.")
    )

    postFromPage({
      app: APP_ID,
      action: "gptkResult",
      command: "getAllMediaItems",
      requestId: "req-3",
      success: true,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(forwarded()[1]).toMatchObject({
      action: "gptkResult",
      requestId: "req-3",
      success: false,
    })
  })

  it("does not send an error reply for advisory progress messages", () => {
    mockSendMessage.mockImplementationOnce(() => {
      throw new Error(OVERSIZE)
    })

    postFromPage({
      app: APP_ID,
      action: "gptkProgress",
      requestId: "req-4",
      itemsProcessed: 10,
    })

    // Logged, but no follow-up message — progress is not what the app waits on
    expect(forwarded()).toHaveLength(1)
  })

  it("does not throw when reporting the failure also fails", () => {
    mockSendMessage.mockImplementation(() => {
      throw new Error(OVERSIZE)
    })

    expect(() =>
      postFromPage({
        app: APP_ID,
        action: "gptkResult",
        command: "getAllMediaItems",
        requestId: "req-5",
        success: true,
      })
    ).not.toThrow()
  })
})
