import { APP_ID } from "../lib/types"
import type {
  AppMessage,
  GptkCommandMessage,
  GptkResultMessage,
  GptkProgressMessage,
} from "../lib/types"

// Service worker for Google Photos Deduper.
// Routes messages between the app tab and the Google Photos tab.

// Bidirectional tab mapping: appTabId <-> gpTabId
const tabMap: Record<number, number> = {}

// Pending GPTK command callbacks, keyed by requestId
const pendingCommands: Record<
  string,
  {
    resolve: (data: unknown) => void
    reject: (error: string) => void
    appTabId: number
  }
> = {}

// ============================================================
// Find tabs
// ============================================================

/**
 * Find a Google Photos tab that the bridge content script can actually reach.
 *
 * When the user has multiple photos.google.com tabs open (e.g. opened before
 * the extension was installed, or duplicated via the "Open Google Photos"
 * button), picking the first one returned by chrome.tabs.query is unreliable:
 * the bridge may not be loaded in it, and chrome.tabs.sendMessage rejects with
 * "Receiving end does not exist", surfacing as a spurious "Cannot connect to
 * Google Photos" error.
 *
 * Strategy: prefer the active tab, then sort by lastAccessed descending, and
 * ping each one until we find a reachable bridge. The bridge ignores
 * unrecognized actions, so a no-op ping resolves with undefined when reachable
 * and rejects when no content script is present.
 */
async function findGooglePhotosTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: "https://photos.google.com/*" })
  if (tabs.length === 0) return null

  // `lastAccessed` is available in Chrome 121+ but missing from this version
  // of @types/chrome.
  type TabWithLastAccessed = chrome.tabs.Tab & { lastAccessed?: number }
  const sorted = [...tabs].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const aAccessed = (a as TabWithLastAccessed).lastAccessed ?? 0
    const bAccessed = (b as TabWithLastAccessed).lastAccessed ?? 0
    return bAccessed - aAccessed
  })

  for (const candidate of sorted) {
    if (!candidate.id) continue
    try {
      await chrome.tabs.sendMessage(candidate.id, {
        app: APP_ID,
        action: "ping",
      })
      return candidate
    } catch {
      // Bridge not loaded in this tab; try the next one.
    }
  }
  return null
}

/**
 * Get the sender's tab ID. For content scripts, sender.tab is set.
 * For extension pages (tabs/app.html), sender.tab is undefined —
 * we resolve it from sender.url via chrome.tabs.query.
 */
async function getSenderTabId(
  sender: chrome.runtime.MessageSender
): Promise<number | null> {
  if (sender.tab?.id) return sender.tab.id

  // Extension page: find tab by URL
  if (sender.url) {
    const tabs = await chrome.tabs.query({ url: sender.url })
    if (tabs.length > 0 && tabs[0].id) return tabs[0].id
  }
  return null
}

// ============================================================
// Send a GPTK command to the Google Photos tab and await result
// ============================================================

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function sendGptkCommand(
  gpTabId: number,
  command: string,
  args?: unknown
): Promise<unknown> {
  const requestId = generateRequestId()

  const message: GptkCommandMessage = {
    app: APP_ID,
    action: "gptkCommand",
    command,
    requestId,
    args,
  }

  return new Promise((resolve, reject) => {
    pendingCommands[requestId] = { resolve, reject, appTabId: 0 }
    chrome.tabs.sendMessage(gpTabId, message).catch(() => {
      delete pendingCommands[requestId]
      reject(
        "Unable to connect to Google Photos tab. Please reload the tab and try again."
      )
    })
  })
}

// ============================================================
// Message handler
// ============================================================

chrome.runtime.onMessage.addListener(
  (message: AppMessage, sender: chrome.runtime.MessageSender) => {
    if (message?.app !== APP_ID) return

    switch (message.action) {
      case "launchApp":
        handleLaunchApp(sender)
        break
      case "healthCheck":
        handleHealthCheck(sender)
        break
      case "gptkCommand":
        handleGptkCommand(message as GptkCommandMessage, sender)
        break
      case "gptkResult":
        handleGptkResult(message as GptkResultMessage, sender)
        break
      case "gptkProgress":
        handleGptkProgress(message as GptkProgressMessage, sender)
        break
    }
  }
)

// ============================================================
// Handlers
// ============================================================

async function handleLaunchApp(
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const appTab = await chrome.tabs.create({
    url: chrome.runtime.getURL("tabs/app.html"),
  })
  if (sender.tab?.id && appTab.id) {
    tabMap[sender.tab.id] = appTab.id
    tabMap[appTab.id] = sender.tab.id
  }
}

async function handleHealthCheck(
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const senderTabId = await getSenderTabId(sender)

  const gpTab = await findGooglePhotosTab()
  if (!gpTab?.id) {
    if (senderTabId) {
      chrome.tabs.sendMessage(senderTabId, {
        app: APP_ID,
        action: "healthCheck.result",
        success: false,
        hasGptk: false,
      })
    }
    return
  }

  // Map the app tab to the GP tab
  if (senderTabId && gpTab.id) {
    tabMap[senderTabId] = gpTab.id
    tabMap[gpTab.id] = senderTabId
  }

  try {
    const result = await sendGptkCommand(gpTab.id, "healthCheck")
    if (senderTabId) {
      const r = result as { hasGptk: boolean; accountEmail?: string }
      chrome.tabs.sendMessage(senderTabId, {
        app: APP_ID,
        action: "healthCheck.result",
        success: true,
        hasGptk: r.hasGptk,
        accountEmail: r.accountEmail,
      })
    }
  } catch {
    if (senderTabId) {
      chrome.tabs.sendMessage(senderTabId, {
        app: APP_ID,
        action: "healthCheck.result",
        success: false,
        hasGptk: false,
      })
    }
  }
}

async function handleGptkCommand(
  message: GptkCommandMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const senderTabId = await getSenderTabId(sender)
  if (!senderTabId) return

  // Find the GP tab for this sender
  let gpTabId = tabMap[senderTabId]
  if (!gpTabId) {
    const gpTab = await findGooglePhotosTab()
    if (!gpTab?.id) {
      chrome.tabs.sendMessage(senderTabId, {
        app: APP_ID,
        action: "gptkResult",
        command: message.command,
        requestId: message.requestId,
        success: false,
        error: "Google Photos tab not found. Please open photos.google.com.",
      } as GptkResultMessage)
      return
    }
    gpTabId = gpTab.id
    tabMap[senderTabId] = gpTabId
    tabMap[gpTabId] = senderTabId
  }

  // Store the sender so we can relay results back
  pendingCommands[message.requestId] = {
    resolve: () => {},
    reject: () => {},
    appTabId: senderTabId,
  }

  // Forward the command to the GP tab (bridge will relay to MAIN world)
  chrome.tabs.sendMessage(gpTabId, message).catch(() => {
    chrome.tabs.sendMessage(senderTabId, {
      app: APP_ID,
      action: "gptkResult",
      command: message.command,
      requestId: message.requestId,
      success: false,
      error:
        "Unable to connect to Google Photos tab. Please reload the tab and try again.",
    } as GptkResultMessage)
    delete pendingCommands[message.requestId]
  })
}

function handleGptkResult(
  message: GptkResultMessage,
  _sender: chrome.runtime.MessageSender
): void {
  const pending = pendingCommands[message.requestId]
  if (!pending) return

  // Relay result to the app tab
  if (pending.appTabId) {
    chrome.tabs.sendMessage(pending.appTabId, message)
  }

  // Resolve/reject the promise if anyone is awaiting
  if (message.success) {
    pending.resolve(message.data)
  } else {
    pending.reject(message.error || "Unknown error")
  }

  delete pendingCommands[message.requestId]
}

function handleGptkProgress(
  message: GptkProgressMessage,
  _sender: chrome.runtime.MessageSender
): void {
  const pending = pendingCommands[message.requestId]
  if (!pending?.appTabId) return

  // Relay progress to the app tab
  chrome.tabs.sendMessage(pending.appTabId, message)
}

// ============================================================
// Tab cleanup
// ============================================================

chrome.tabs.onRemoved.addListener((tabId) => {
  const mappedTabId = tabMap[tabId]
  if (mappedTabId) {
    delete tabMap[mappedTabId]

    // If a GP tab closed, notify the app tab
    chrome.tabs
      .sendMessage(mappedTabId, {
        app: APP_ID,
        action: "gptkLog",
        level: "error",
        message: "Google Photos tab was closed.",
      })
      .catch(() => {
        // App tab may also be gone
      })
  }
  delete tabMap[tabId]

  // Clean up any pending commands from this tab
  for (const [reqId, cmd] of Object.entries(pendingCommands)) {
    if (cmd.appTabId === tabId) {
      delete pendingCommands[reqId]
    }
  }
})

// Open the app tab when the extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tabs/app.html") })
})

console.log("GPD: Service worker loaded")
