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
// findGooglePhotosTab — multi-tab selection (PR #120)
//
// When several photos.google.com tabs are open, picking tabs[0] was
// unreliable: the bridge may not be loaded in it, and sendMessage rejects
// with "Receiving end does not exist". The SW now pings each candidate —
// preferring the active tab, then most-recently-accessed — until one replies.
// ============================================================

describe("findGooglePhotosTab — multi-tab selection", () => {
  /** Filter recorded sendMessage calls down to ping probes. */
  function pingCalls() {
    return mockChrome.tabs.sendMessage.mock.calls.filter(
      (c: unknown[]) => (c[1] as { action?: string })?.action === "ping"
    )
  }

  it("skips an unreachable tab and forwards to the reachable one", async () => {
    const unreachableId = 31
    const reachableId = 32
    const appTabId = 33

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([
          { id: unreachableId, active: false, lastAccessed: 200 },
          { id: reachableId, active: false, lastAccessed: 100 },
        ])
      return Promise.resolve([{ id: appTabId }])
    })

    mockChrome.tabs.sendMessage.mockImplementation(
      (
        tabId: number,
        msg: { action?: string; command?: string; requestId?: string }
      ) => {
        // The more-recently-accessed tab has no bridge loaded → ping rejects.
        if (msg?.action === "ping") {
          return tabId === unreachableId
            ? Promise.reject(new Error("Receiving end does not exist"))
            : Promise.resolve()
        }
        // healthCheck forwarded to the chosen tab → reply with success.
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
              gpSender(reachableId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    // Command went to the reachable tab, never to the unreachable one.
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      reachableId,
      expect.objectContaining({ command: "healthCheck" })
    )
    expect(mockChrome.tabs.sendMessage).not.toHaveBeenCalledWith(
      unreachableId,
      expect.objectContaining({ command: "healthCheck" })
    )
    // And the app tab sees a successful connection.
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "healthCheck.result", success: true })
    )
  })

  it("prefers the active tab over a more-recently-accessed inactive one", async () => {
    const activeId = 41
    const inactiveId = 42
    const appTabId = 43

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([
          { id: inactiveId, active: false, lastAccessed: 999 },
          { id: activeId, active: true, lastAccessed: 1 },
        ])
      return Promise.resolve([{ id: appTabId }])
    })
    // Both tabs reachable — selection comes down purely to ordering.
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 20))

    // The first (and only) ping hits the active tab; the inactive one is
    // never probed because the active tab answers first.
    const pings = pingCalls()
    expect(pings[0][0]).toBe(activeId)
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      activeId,
      expect.objectContaining({ command: "healthCheck" })
    )
  })

  it("reports failure when no Google Photos tab has the bridge loaded", async () => {
    const tabA = 51
    const tabB = 52
    const appTabId = 53

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([
          { id: tabA, active: false, lastAccessed: 2 },
          { id: tabB, active: false, lastAccessed: 1 },
        ])
      return Promise.resolve([{ id: appTabId }])
    })
    // Every ping rejects → no reachable bridge anywhere.
    mockChrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: { action?: string }) => {
        if (msg?.action === "ping")
          return Promise.reject(new Error("no bridge"))
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    // Both candidates were probed before giving up.
    const pingedIds = pingCalls().map((c: unknown[]) => c[0])
    expect(pingedIds).toContain(tabA)
    expect(pingedIds).toContain(tabB)
    // App tab is told it cannot connect.
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "healthCheck.result", success: false })
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
