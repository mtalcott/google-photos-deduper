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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_ID } from "../../lib/types"

// ============================================================
// Chrome API mock setup — must be done before the module import
// ============================================================

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r?: unknown) => void
) => boolean | void
type TabRemovedListener = (tabId: number) => void
type TabActivatedListener = (activeInfo: chrome.tabs.TabActiveInfo) => void
type TabUpdatedListener = (
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) => void
type ActionClickListener = (tab: chrome.tabs.Tab) => void
type PortMessageListener = (message: unknown) => void
type PortDisconnectListener = () => void
type ConnectListener = (port: chrome.runtime.Port) => void

// Persistent listener arrays — the SW registers into these once at import
const messageListeners: MessageListener[] = []
const tabRemovedListeners: TabRemovedListener[] = []
const tabActivatedListeners: TabActivatedListener[] = []
const tabUpdatedListeners: TabUpdatedListener[] = []
const actionClickListeners: ActionClickListener[] = []
const connectListeners: ConnectListener[] = []

const mockChrome = {
  action: {
    onClicked: {
      addListener: vi.fn((fn: ActionClickListener) =>
        actionClickListeners.push(fn)
      )
    }
  },
  sidePanel: {
    setPanelBehavior: vi.fn(() => Promise.resolve()),
    setOptions: vi.fn(() => Promise.resolve()),
    open: vi.fn(() => Promise.resolve())
  },
  tabs: {
    query: vi.fn((_query: unknown) => Promise.resolve([])),
    get: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    onRemoved: {
      addListener: vi.fn((fn: TabRemovedListener) =>
        tabRemovedListeners.push(fn)
      )
    },
    onActivated: {
      addListener: vi.fn((fn: TabActivatedListener) =>
        tabActivatedListeners.push(fn)
      )
    },
    onUpdated: {
      addListener: vi.fn((fn: TabUpdatedListener) =>
        tabUpdatedListeners.push(fn)
      )
    }
  },
  scripting: {
    executeScript: vi.fn()
  },
  webNavigation: {
    getAllFrames: vi.fn()
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    getManifest: vi.fn(() => ({
      content_scripts: [
        {
          matches: ["https://photos.google.com/*"],
          js: ["google-photos-inject.js", "google-photos-bridge.js"]
        },
        {
          matches: ["https://www.icloud.com/*"],
          js: ["icloud-photos-inject.js", "icloud-photos-bridge.js"]
        },
        {
          matches: ["https://www.amazon.ca/*"],
          js: ["amazon-photos-inject.js", "amazon-photos-bridge.js"]
        }
      ]
    })),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn((fn: MessageListener) => messageListeners.push(fn))
    },
    onConnect: {
      addListener: vi.fn((fn: ConnectListener) => connectListeners.push(fn))
    }
  }
}

vi.stubGlobal("chrome", mockChrome)
let startupSetOptionsCalls: unknown[][] = []

// ============================================================
// Import the service worker AFTER mocks are installed
// ============================================================

beforeAll(async () => {
  await import("../../background/index")
  startupSetOptionsCalls = mockChrome.sidePanel.setOptions.mock.calls.map(
    (call) => [...call]
  )
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

async function dispatchMessageWithResponse(
  message: unknown,
  sender: Partial<chrome.runtime.MessageSender> = {}
): Promise<unknown> {
  let response: unknown
  for (const fn of messageListeners) {
    fn(message, sender as chrome.runtime.MessageSender, (nextResponse) => {
      response = nextResponse
    })
  }
  await new Promise((r) => setTimeout(r, 20))
  return response
}

function dispatchActionClick(tab: chrome.tabs.Tab) {
  for (const fn of actionClickListeners) {
    fn(tab)
  }
}

function createMockPort(name = "gpd-side-panel") {
  const messageListeners: PortMessageListener[] = []
  const disconnectListeners: PortDisconnectListener[] = []
  return {
    name,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((fn: PortMessageListener) => messageListeners.push(fn))
    },
    onDisconnect: {
      addListener: vi.fn((fn: PortDisconnectListener) =>
        disconnectListeners.push(fn)
      )
    },
    dispatchMessage(message: unknown) {
      messageListeners.forEach((fn) => fn(message))
    },
    dispatchDisconnect() {
      disconnectListeners.forEach((fn) => fn())
    }
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
  mockChrome.tabs.get.mockResolvedValue(undefined)
  mockChrome.tabs.update.mockResolvedValue({})
  mockChrome.tabs.create.mockResolvedValue({})
  mockChrome.sidePanel.setOptions.mockResolvedValue(undefined)
  mockChrome.sidePanel.open.mockResolvedValue(undefined)
  mockChrome.scripting.executeScript.mockResolvedValue([])
  mockChrome.webNavigation.getAllFrames.mockResolvedValue([])
})

// ============================================================
// Launch flow
// ============================================================

describe("launch flow", () => {
  it("disables the global default side panel on startup", () => {
    expect(startupSetOptionsCalls).toContainEqual([{ enabled: false }])
  })

  it("opens a tab-scoped side panel from the extension action", async () => {
    dispatchActionClick({
      id: 7,
      url: "https://example.com/"
    } as chrome.tabs.Tab)

    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: "tabs/scanner-panel.html",
      enabled: true
    })
    expect(mockChrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 })
    expect(mockChrome.tabs.update).not.toHaveBeenCalled()
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
  })

  it("updates the side-panel host tab when the side panel opens a provider", async () => {
    dispatchActionClick({
      id: 11,
      url: "https://example.com/"
    } as chrome.tabs.Tab)
    await new Promise((r) => setTimeout(r, 20))
    vi.clearAllMocks()

    mockChrome.tabs.get.mockResolvedValue({
      id: 11,
      url: "https://example.com/"
    })
    mockChrome.tabs.update.mockResolvedValue({
      id: 11,
      url: "https://www.icloud.com/photos"
    })

    dispatchMessage(
      { app: APP_ID, action: "launchProvider", provider: "icloud" },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.get).toHaveBeenCalledWith(11)
    expect(mockChrome.tabs.query).not.toHaveBeenCalledWith({
      active: true,
      currentWindow: true
    })
    expect(mockChrome.tabs.update).toHaveBeenCalledWith(11, {
      url: "https://www.icloud.com/photos",
      active: true
    })
    expect(mockChrome.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 11,
      path: "tabs/scanner-panel.html",
      enabled: true
    })
    expect(mockChrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 11 })
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
  })

  it("uses the active host tab reported by the side panel before creating provider tabs", async () => {
    const port = createMockPort()
    connectListeners.forEach((fn) => fn(port as unknown as chrome.runtime.Port))
    port.dispatchMessage({
      app: APP_ID,
      action: "sidePanel.ready",
      clientId: "panel-client-1",
      activeTabId: 31
    })

    mockChrome.tabs.get.mockResolvedValue({
      id: 31,
      url: "https://example.com/"
    })
    mockChrome.tabs.update.mockResolvedValue({
      id: 31,
      url: "https://photos.google.com/"
    })

    dispatchMessage(
      { app: APP_ID, action: "launchProvider", provider: "google" },
      {
        url: "chrome-extension://test/tabs/scanner-panel.html",
        tab: {
          id: 99,
          url: "chrome-extension://test/tabs/scanner-panel.html"
        } as chrome.tabs.Tab
      }
    )

    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.get).toHaveBeenCalledWith(31)
    expect(mockChrome.tabs.update).toHaveBeenCalledWith(31, {
      url: "https://photos.google.com/",
      active: true
    })
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
  })

  it("uses the side-panel supplied host tab id when opening a provider", async () => {
    mockChrome.tabs.get.mockResolvedValue({
      id: 52,
      url: "https://example.com/"
    })
    mockChrome.tabs.update.mockResolvedValue({
      id: 52,
      url: "https://www.amazon.ca/photos?sf=1"
    })

    const response = await dispatchMessageWithResponse(
      {
        app: APP_ID,
        action: "launchProvider",
        provider: "amazon",
        hostTabId: 52
      },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    expect(mockChrome.tabs.get).toHaveBeenCalledWith(52)
    expect(mockChrome.tabs.update).toHaveBeenCalledWith(52, {
      url: "https://www.amazon.com/photos?sf=1",
      active: true
    })
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      success: true,
      provider: "amazon",
      tabId: 52,
      alreadyOpen: false
    })
  })

  it("focuses the active main tab without reloading when it already matches the selected provider", async () => {
    mockChrome.tabs.query.mockResolvedValue([
      { id: 12, url: "https://www.amazon.ca/photos?sf=1" }
    ])

    dispatchMessage(
      { app: APP_ID, action: "launchProvider", provider: "amazon" },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.update).toHaveBeenCalledWith(12, { active: true })
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
  })

  it("marks launchProvider as alreadyOpen only when the chosen tab matched before navigation", async () => {
    mockChrome.tabs.query.mockResolvedValue([
      { id: 12, url: "https://www.amazon.ca/photos?sf=1" }
    ])
    mockChrome.tabs.update.mockResolvedValue({
      id: 12,
      url: "https://www.amazon.ca/photos?sf=1"
    })

    const response = await dispatchMessageWithResponse(
      { app: APP_ID, action: "launchProvider", provider: "amazon" },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    expect(response).toMatchObject({
      success: true,
      provider: "amazon",
      tabId: 12,
      alreadyOpen: true
    })
  })

  it("navigates a Chrome-owned active tab instead of failing side-panel Open", async () => {
    mockChrome.tabs.query.mockImplementation(
      (query: { active?: boolean; currentWindow?: boolean }) => {
        if (query.active && query.currentWindow) {
          return Promise.resolve([{ id: 45, url: "chrome://extensions/" }])
        }
        return Promise.resolve([])
      }
    )
    mockChrome.tabs.update.mockResolvedValue({
      id: 45,
      url: "https://photos.google.com/"
    })

    const response = await dispatchMessageWithResponse(
      { app: APP_ID, action: "launchProvider", provider: "google" },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    expect(mockChrome.tabs.update).toHaveBeenCalledWith(45, {
      url: "https://photos.google.com/",
      active: true
    })
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      success: true,
      provider: "google",
      tabId: 45
    })
  })

  it("falls back to another normal window tab when the active tab is an extension page", async () => {
    mockChrome.tabs.query.mockImplementation(
      (query: { active?: boolean; currentWindow?: boolean }) => {
        if (query.active && query.currentWindow) {
          return Promise.resolve([
            {
              id: 61,
              url: "chrome-extension://test/tabs/scanner-panel.html"
            }
          ])
        }
        if (query.currentWindow) {
          return Promise.resolve([
            {
              id: 61,
              url: "chrome-extension://test/tabs/scanner-panel.html"
            },
            { id: 62, url: "https://example.com/" }
          ])
        }
        return Promise.resolve([])
      }
    )
    mockChrome.tabs.update.mockResolvedValue({
      id: 62,
      url: "https://www.icloud.com/photos"
    })

    const response = await dispatchMessageWithResponse(
      { app: APP_ID, action: "launchProvider", provider: "icloud" },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    expect(mockChrome.tabs.update).toHaveBeenCalledWith(62, {
      url: "https://www.icloud.com/photos",
      active: true
    })
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      success: true,
      provider: "icloud",
      tabId: 62
    })
  })

  it("does not create a new tab when a side-panel provider switch has no navigable host", async () => {
    mockChrome.tabs.query.mockResolvedValue([
      {
        id: 44,
        url: "chrome-extension://test/tabs/scanner-panel.html"
      }
    ])

    dispatchMessage(
      { app: APP_ID, action: "launchProvider", provider: "icloud" },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )

    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.update).not.toHaveBeenCalled()
    expect(mockChrome.tabs.create).not.toHaveBeenCalled()
    expect(mockChrome.sidePanel.open).not.toHaveBeenCalled()
  })
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

  it("treats app tab id 0 as a valid sender tab", async () => {
    const appTabId = 0

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([])
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
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([{ id: appTabId }])
    })

    // GPTK result arrives from GP tab after command is forwarded
    mockChrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: { command?: string; requestId?: string }) => {
        if (msg?.command === "healthCheck") {
          setTimeout(() => {
            dispatchMessage(
              {
                app: APP_ID,
                action: "gptkResult",
                command: "healthCheck",
                requestId: msg.requestId,
                success: true,
                data: { hasGptk: true, hasWizData: true }
              },
              gpSender(gpTabId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "healthCheck.result",
        success: true,
        hasGptk: true
      })
    )
  })

  it("reinjects Google MAIN world scripts and retries when healthCheck reports missing GPTK", async () => {
    const gpTabId = 23
    const appTabId = 24
    let healthChecks = 0

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([
          { id: gpTabId, url: "https://photos.google.com/" }
        ])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.scripting.executeScript.mockImplementation(
      ({ files }: { files?: string[] }) => {
        if (files) return Promise.resolve([])
        return Promise.resolve([
          {
            result:
              healthChecks === 0
                ? {
                    hasGptk: false,
                    hasCommandHost: true,
                    hasCommandHandler: true
                  }
                : {
                    hasGptk: true,
                    hasCommandHost: true,
                    hasCommandHandler: true
                  }
          }
        ])
      }
    )
    mockChrome.tabs.sendMessage.mockImplementation(
      (
        _tabId: number,
        msg: { action?: string; command?: string; requestId?: string }
      ) => {
        if (msg?.action === "ping") return Promise.resolve()
        if (msg?.command === "healthCheck") {
          healthChecks++
          const hasGptk = healthChecks > 1
          setTimeout(() => {
            dispatchMessage(
              {
                app: APP_ID,
                action: "gptkResult",
                command: "healthCheck",
                requestId: msg.requestId,
                success: true,
                data: { hasGptk }
              },
              gpSender(gpTabId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 40))

    expect(healthChecks).toBe(2)
    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: gpTabId },
      world: "MAIN",
      files: ["scripts/unsafewindow-shim.js"]
    })
    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: gpTabId },
      world: "MAIN",
      files: ["scripts/google-photos-toolkit.user.js"]
    })
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "healthCheck.result",
        success: true,
        hasGptk: true
      })
    )
  })

  it("reports healthCheck failure when the provider handler is not ready", async () => {
    const icloudTabId = 21
    const appTabId = 22

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("icloud.com"))
        return Promise.resolve([
          { id: icloudTabId, url: "https://www.icloud.com/photos" }
        ])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: { action?: string }) => {
        if (msg?.action === "ping") return Promise.resolve()
        return Promise.resolve()
      }
    )
    mockChrome.scripting.executeScript.mockImplementation(
      ({
        args
      }: {
        args?: Array<{ command?: string; requestId?: string }>
      }) => {
        const msg = args?.[0]
        if (msg?.command === "healthCheck") {
          setTimeout(() => {
            dispatchMessage(
              {
                app: APP_ID,
                action: "gptkResult",
                command: "healthCheck",
                requestId: msg.requestId,
                success: true,
                data: { hasGptk: false }
              },
              gpSender(icloudTabId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage(
      { app: APP_ID, action: "healthCheck", provider: "icloud" },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 30))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "healthCheck.result",
        provider: "icloud",
        success: false,
        hasGptk: false
      })
    )
  })

  it("injects the Google Photos bridge when an already-open tab is missing content scripts", async () => {
    const gpTabId = 3010
    const appTabId = 3011
    let bridgeInjected = false

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([
          { id: gpTabId, url: "https://photos.google.com/" }
        ])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.scripting.executeScript.mockImplementation(
      ({ files }: { files?: string[] }) => {
        if (files?.includes("google-photos-bridge.js")) bridgeInjected = true
        return Promise.resolve([])
      }
    )
    mockChrome.tabs.sendMessage.mockImplementation(
      (
        _tabId: number,
        msg: { action?: string; command?: string; requestId?: string }
      ) => {
        if (msg?.action === "ping") {
          return bridgeInjected
            ? Promise.resolve()
            : Promise.reject(new Error("Receiving end does not exist"))
        }
        if (msg?.command === "healthCheck") {
          setTimeout(() => {
            dispatchMessage(
              {
                app: APP_ID,
                action: "gptkResult",
                command: "healthCheck",
                requestId: msg.requestId,
                success: true,
                data: { hasGptk: true, hasWizData: true }
              },
              gpSender(gpTabId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: gpTabId, allFrames: false },
      files: ["google-photos-inject.js"]
    })
    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: gpTabId, allFrames: false },
      files: ["google-photos-bridge.js"]
    })
    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: gpTabId },
      world: "MAIN",
      files: ["scripts/google-photos-commands.js"]
    })
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "healthCheck.result",
        success: true,
        hasGptk: true
      })
    )
  })

  it("checks the side-panel host Photos tab first on first extension open", async () => {
    const staleTabId = 4010
    const hostTabId = 4011
    const appTabId = 4012

    dispatchActionClick({
      id: hostTabId,
      url: "https://photos.google.com/"
    } as chrome.tabs.Tab)
    await new Promise((r) => setTimeout(r, 20))
    vi.clearAllMocks()

    mockChrome.tabs.get.mockResolvedValue({
      id: hostTabId,
      url: "https://photos.google.com/"
    })
    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com")) {
        return Promise.resolve([
          { id: staleTabId, url: "https://photos.google.com/", active: false },
          { id: hostTabId, url: "https://photos.google.com/", active: true }
        ])
      }
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockImplementation(
      (
        tabId: number,
        msg: { action?: string; command?: string; requestId?: string }
      ) => {
        if (msg?.action === "ping") {
          return tabId === hostTabId
            ? Promise.resolve()
            : Promise.reject(new Error("stale tab"))
        }
        if (msg?.command === "healthCheck") {
          expect(tabId).toBe(hostTabId)
          setTimeout(() => {
            dispatchMessage(
              {
                app: APP_ID,
                action: "gptkResult",
                command: "healthCheck",
                requestId: msg.requestId,
                success: true,
                data: { hasGptk: true, hasWizData: true }
              },
              gpSender(hostTabId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    expect(mockChrome.tabs.get).toHaveBeenCalledWith(hostTabId)
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      hostTabId,
      expect.objectContaining({ command: "healthCheck" })
    )
    expect(mockChrome.tabs.sendMessage).not.toHaveBeenCalledWith(
      staleTabId,
      expect.objectContaining({ command: "healthCheck" })
    )
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "healthCheck.result",
        success: true
      })
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
          { id: reachableId, active: false, lastAccessed: 100 }
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
                data: { hasGptk: true, hasWizData: true }
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
          { id: activeId, active: true, lastAccessed: 1 }
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

  it("treats Google Photos tab id 0 as a valid reachable tab", async () => {
    const gpTabId = 0
    const appTabId = 58

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId, active: true, lastAccessed: 1 }])
      return Promise.resolve([{ id: appTabId }])
    })

    mockChrome.tabs.sendMessage.mockImplementation(
      (
        _tabId: number,
        msg: { action?: string; command?: string; requestId?: string }
      ) => {
        if (msg?.command === "healthCheck") {
          setTimeout(() => {
            dispatchMessage(
              {
                app: APP_ID,
                action: "gptkResult",
                command: "healthCheck",
                requestId: msg.requestId,
                success: true,
                data: { hasGptk: true, hasWizData: true }
              },
              gpSender(gpTabId)
            )
          }, 0)
        }
        return Promise.resolve()
      }
    )

    dispatchMessage({ app: APP_ID, action: "healthCheck" }, appSender())
    await new Promise((r) => setTimeout(r, 30))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      gpTabId,
      expect.objectContaining({ action: "ping" })
    )
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      gpTabId,
      expect.objectContaining({ command: "healthCheck" })
    )
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "healthCheck.result", success: true })
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
          { id: tabB, active: false, lastAccessed: 1 }
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
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)
    mockChrome.webNavigation.getAllFrames.mockResolvedValue([
      {
        frameId: 9,
        parentFrameId: 0,
        url: "https://www.icloud.com/applications/photos3/current/en-us/index.html"
      }
    ])
    mockChrome.webNavigation.getAllFrames.mockResolvedValue([
      {
        frameId: 9,
        parentFrameId: 0,
        url: "https://www.icloud.com/applications/photos3/current/en-us/index.html"
      }
    ])
    mockChrome.webNavigation.getAllFrames.mockResolvedValue([
      {
        frameId: 9,
        parentFrameId: 0,
        url: "https://www.icloud.com/applications/photos3/current/en-us/index.html"
      }
    ])

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        requestId,
        args: {}
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      gpTabId,
      expect.objectContaining({ command: "getAllMediaItems", requestId })
    )
  })

  it("drops side-panel commands when the side panel closes", async () => {
    const gpTabId = 81
    const requestId = "side-panel-scan"
    const clientId = "panel-client-1"
    const port = createMockPort()

    connectListeners.forEach((fn) => fn(port as unknown as chrome.runtime.Port))
    port.dispatchMessage({
      app: APP_ID,
      action: "sidePanel.ready",
      clientId
    })

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        requestId,
        clientId,
        args: {}
      },
      { url: "chrome-extension://test/tabs/scanner-panel.html" }
    )
    await new Promise((r) => setTimeout(r, 20))

    port.dispatchDisconnect()
    vi.clearAllMocks()

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkResult",
        command: "getAllMediaItems",
        requestId,
        success: true,
        data: []
      },
      gpSender(gpTabId)
    )

    expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalled()
    expect(mockChrome.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it("routes iCloud scan commands to an iCloud Photos tab", async () => {
    const appTabId = 71
    const icloudTabId = 72
    const requestId = "test-icloud-scan"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("icloud.com"))
        return Promise.resolve([{ id: icloudTabId, active: true }])
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)
    mockChrome.webNavigation.getAllFrames.mockResolvedValue([
      {
        frameId: 9,
        parentFrameId: 0,
        url: "https://www.icloud.com/applications/photos3/current/en-us/index.html"
      }
    ])

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        provider: "icloud",
        requestId,
        args: { limit: 25 }
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 1600))

    expect(mockChrome.tabs.update).toHaveBeenCalledWith(icloudTabId, {
      active: true
    })
    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: icloudTabId, frameIds: [9] },
        func: expect.any(Function),
        args: [
          expect.objectContaining({
            command: "getAllMediaItems",
            provider: "icloud",
            requestId,
            args: expect.objectContaining({ limit: 25 })
          })
        ]
      })
    )
  })

  it("routes iCloud trash dry-run commands to an iCloud Photos tab", async () => {
    const appTabId = 173
    const icloudTabId = 174
    const requestId = "test-icloud-trash-dry-run"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("icloud.com"))
        return Promise.resolve([{ id: icloudTabId, active: true }])
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "trashItems",
        provider: "icloud",
        requestId,
        args: {
          dryRun: true,
          dedupKeys: ["icloud-a"],
          mediaKeysToTrash: ["icloud-a"]
        }
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 1600))

    expect(mockChrome.tabs.update).toHaveBeenCalledWith(icloudTabId, {
      active: true
    })
    expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: icloudTabId, allFrames: true },
        args: [
          expect.objectContaining({
            command: "trashItems",
            provider: "icloud",
            requestId,
            args: expect.objectContaining({ dryRun: true })
          })
        ]
      })
    )
  })

  it("routes Amazon scan commands without activating the Amazon Photos tab", async () => {
    const appTabId = 73
    const amazonTabId = 74
    const requestId = "test-amazon-scan"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("amazon.ca"))
        return Promise.resolve([{ id: amazonTabId, active: true }])
      if (query?.url?.includes("photos.google.com")) return Promise.resolve([])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        provider: "amazon",
        requestId,
        args: {}
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.update).not.toHaveBeenCalled()
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      amazonTabId,
      expect.objectContaining({
        command: "getAllMediaItems",
        provider: "amazon",
        requestId
      })
    )
  })

  it("relays gptkResult from GP tab back to app tab", async () => {
    const gpTabId = 10
    const appTabId = 20
    const requestId = "test-req-2"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId }])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockResolvedValue(undefined)

    // First send a command so the SW registers the pending requestId → appTabId mapping
    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        requestId,
        args: {}
      },
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
        data: []
      },
      gpSender(gpTabId)
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "gptkResult",
        command: "getAllMediaItems",
        success: true
      })
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
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "trashItems",
        requestId: "req-err-2",
        args: {}
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({ action: "gptkResult", success: false })
    )
  })

  it("forwards commands from app tab id 0", async () => {
    const appTabId = 0
    const gpTabId = 61
    const requestId = "test-req-zero-app"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId, active: true }])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockImplementation(
      (tabId: number, msg: { action?: string }) => {
        if (msg?.action === "ping" && tabId !== gpTabId) {
          return Promise.reject(new Error("stale mapping"))
        }
        return Promise.resolve()
      }
    )

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        requestId,
        args: {}
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      gpTabId,
      expect.objectContaining({ command: "getAllMediaItems", requestId })
    )
  })

  it("relays progress back to app tab id 0", async () => {
    const appTabId = 0
    const gpTabId = 62
    const requestId = "test-req-zero-progress"

    mockChrome.tabs.query.mockImplementation((query: { url?: string }) => {
      if (query?.url?.includes("photos.google.com"))
        return Promise.resolve([{ id: gpTabId, active: true }])
      return Promise.resolve([{ id: appTabId }])
    })
    mockChrome.tabs.sendMessage.mockImplementation(
      (tabId: number, msg: { action?: string }) => {
        if (msg?.action === "ping" && tabId !== gpTabId) {
          return Promise.reject(new Error("stale mapping"))
        }
        return Promise.resolve()
      }
    )

    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkCommand",
        command: "getAllMediaItems",
        requestId,
        args: {}
      },
      appSender()
    )
    await new Promise((r) => setTimeout(r, 20))

    vi.clearAllMocks()
    dispatchMessage(
      {
        app: APP_ID,
        action: "gptkProgress",
        command: "getAllMediaItems",
        requestId,
        itemsProcessed: 25,
        message: "Fetched 25"
      },
      gpSender(gpTabId)
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
      appTabId,
      expect.objectContaining({
        action: "gptkProgress",
        command: "getAllMediaItems",
        requestId,
        itemsProcessed: 25
      })
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
