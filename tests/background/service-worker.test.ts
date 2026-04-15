/**
 * Integration tests for background/index.ts message routing.
 *
 * Chrome APIs are mocked via globalThis.chrome so the service worker
 * module can be imported and its message handlers exercised directly.
 * Listeners are captured at import time and reused across tests.
 *
 * @vitest-environment happy-dom
 */
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { APP_ID } from "../../lib/types"

// ============================================================
// Chrome API mock setup — must be done before the module import
// ============================================================

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r?: unknown) => void
) => void
type TabRemovedListener = (tabId: number) => void

// Persistent listener arrays — the SW registers into these once at import
const messageListeners: MessageListener[] = []
const tabRemovedListeners: TabRemovedListener[] = []

const mockChrome = {
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    onRemoved: {
      addListener: vi.fn((fn: TabRemovedListener) => tabRemovedListeners.push(fn)),
    },
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    onMessage: {
      addListener: vi.fn((fn: MessageListener) => messageListeners.push(fn)),
    },
  },
}

vi.stubGlobal("chrome", mockChrome)

// ============================================================
// Import the service worker AFTER mocks are installed
// ============================================================

beforeAll(async () => {
  await import("../../background/index")
})

// ============================================================
// Helpers
// ============================================================

function dispatchMessage(
  message: unknown,
  sender: Partial<chrome.runtime.MessageSender> = {}
) {
  for (const fn of messageListeners) {
    fn(message, sender as chrome.runtime.MessageSender, () => {})
  }
}

/** App tab sender: no sender.tab (extension page). Resolved via tabs.query by URL. */
function appSender(): Partial<chrome.runtime.MessageSender> {
  return { url: "chrome-extension://test/tabs/app.html" }
}

/** Content script sender: has sender.tab set. */
function gpSender(tabId: number): Partial<chrome.runtime.MessageSender> {
  return { tab: { id: tabId } as chrome.tabs.Tab }
}

// Reset call history (not implementations) between tests
beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================
// healthCheck — GP tab not found
// ============================================================

describe("healthCheck", () => {
  it("sends healthCheck.result failure when no GP tab found", async () => {
    const appTabId = 20

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([])
      // App tab lookup by URL
      return Promise.resolve([{ id: appTabId }])
    })

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "healthCheck.result", success: false })
    )
  })

  it("forwards healthCheck command to GP tab when GP tab exists", async () => {
    const gpTabId = 10
    const appTabId = 20

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([{ id: appTabId }])
    })

    // GPTK result arrives from GP tab after command is forwarded
    mockChrome.tabs.sendMessage.mockImplementation((_tabId: number, msg: { command?: string; requestId?: string }) => {
      if (msg?.command === "healthCheck") {
        setTimeout(() => {
          dispatchMessage(
            {
              app: APP_ID,
              action: "gptkResult",
              command: "healthCheck",
              requestId: msg.requestId,
              success: true,
              data: { hasGptk: true, hasWizData: true },
            },
            gpSender(gpTabId)
          )
        }, 0)
      }
      return Promise.resolve()
    })

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "healthCheck.result", success: true, hasGptk: true })
    )
  })
})

// ============================================================
// gptkCommand routing
// ============================================================

describe("gptkCommand routing", () => {
  it("forwards command to GP tab", async () => {
    const gpTabId = 10
    const appTabId = 20
    const requestId = "test-req-1"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    dispatchMessage(
      { app: APP_ID, action: "gptkCommand", command: "getAllMediaItems", requestId, args: {} },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      gpTabId,
      expect.objectContaining({ command: "getAllMediaItems", requestId })
    )
  })

  it("relays gptkResult from GP tab back to app tab", async () => {
    const gpTabId = 10
    const appTabId = 20
    const requestId = "test-req-2"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    // First send a command so the SW registers the pending requestId → appTabId mapping
    dispatchMessage(
      { app: APP_ID, action: "gptkCommand", command: "getAllMediaItems", requestId, args: {} },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    // Now simulate result arriving from GP content script
    vi.clearAllMocks()
    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkResult",
        command: "getAllMediaItems",
        requestId,
        success: true,
        data: [],
      },
      gpSender(gpTabId)
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "gptkResult", command: "getAllMediaItems", success: true })
    )
  })

  it("sends error result when GP tab not found", async () => {
    // Use unique IDs — tabMap is module-level and persists across tests
    const appTabId = 30

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([])
      return Promise.resolve([{ id: appTabId }])
    })

    dispatchMessage(
      { app: APP_ID, action: "gptkCommand", command: "trashItems", requestId: "req-err-2", args: {} },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "gptkResult", success: false })
    )
  })
})

// ============================================================
// Message filter
// ============================================================

describe("message filtering", () => {
  it("ignores messages from other extensions", () => {
    dispatchMessage({ app: "other-extension", action: "healthCheck" }, {})
    expect(mockChrome.tabs.sendMessage).not.toHaveBeenCalled()
    expect(mockChrome.tabs.query).not.toHaveBeenCalled()
  })

  it("ignores messages without app field", () => {
    dispatchMessage({ action: "healthCheck" }, {})
    expect(mockChrome.tabs.sendMessage).not.toHaveBeenCalled()
  })
})
