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
// Find or detect Google Photos tab
// ============================================================

async function findGooglePhotosTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: "https://photos.google.com/*" })
  return tabs.length > 0 ? tabs[0] : null
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
    chrome.tabs.sendMessage(gpTabId, message)
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
  const gpTab = await findGooglePhotosTab()
  if (!gpTab?.id) {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        app: APP_ID,
        action: "healthCheck.result",
        success: false,
        hasGptk: false,
      })
    }
    return
  }

  // Map the app tab to the GP tab
  if (sender.tab?.id && gpTab.id) {
    tabMap[sender.tab.id] = gpTab.id
    tabMap[gpTab.id] = sender.tab.id
  }

  try {
    const result = await sendGptkCommand(gpTab.id, "healthCheck")
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        app: APP_ID,
        action: "healthCheck.result",
        success: true,
        hasGptk: (result as { hasGptk: boolean }).hasGptk,
      })
    }
  } catch {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
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
  const senderTabId = sender.tab?.id
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
  chrome.tabs.sendMessage(gpTabId, message)
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

console.log("GPD: Service worker loaded")
