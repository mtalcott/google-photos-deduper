import type { PlasmoCSConfig } from "plasmo"
import { APP_ID } from "../lib/types"
import type {
  AppMessage,
  GptkResultChunkMessage,
  GptkResultMessage,
} from "../lib/types"

// Bridge content script (ISOLATED world) for Google Photos pages.
// Relays messages between:
//   - MAIN world scripts (via window.postMessage) and
//   - The extension service worker (via chrome.runtime messaging)

export const config: PlasmoCSConfig = {
  matches: ["https://photos.google.com/*"],
  run_at: "document_idle",
}

/**
 * Reports a failed relay back to the app so a lost message surfaces as an
 * error instead of an apparent hang.
 *
 * Only result messages can strand the app — it blocks waiting for them.
 * Progress and log messages are advisory, so a failure there is logged only.
 */
function reportRelayFailure(msg: AppMessage, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(
    `[GPD] Failed to relay ${msg.action} to the service worker:`,
    detail
  )

  if (msg.action !== "gptkResult" && msg.action !== "gptkResultChunk") return

  const { command, requestId } = msg as
    | GptkResultMessage
    | GptkResultChunkMessage

  try {
    // Deliberately tiny, so it cannot fail for the same reason the original did.
    chrome.runtime.sendMessage({
      app: APP_ID,
      action: "gptkResult",
      command,
      requestId,
      success: false,
      error: `Could not deliver the ${command} result: ${detail}`,
    } as GptkResultMessage)
  } catch (nested) {
    console.error("[GPD] Failed to report the relay failure:", nested)
  }
}

/**
 * Relays one message to the service worker, converting any delivery failure
 * into a visible error.
 *
 * chrome.runtime.sendMessage throws *synchronously* when a message exceeds
 * Chrome's 64MiB cap. That exception used to escape the listener below
 * uncaught, which silently destroyed scan results for large libraries and left
 * the app waiting forever (#147). Results are chunked now, but any future
 * oversize or undeliverable payload must fail loudly rather than vanish.
 */
function forwardToServiceWorker(msg: AppMessage): void {
  try {
    const pending = chrome.runtime.sendMessage(msg)
    // Delivery can also fail asynchronously, e.g. no receiving end.
    if (pending && typeof pending.catch === "function") {
      pending.catch((error: unknown) => reportRelayFailure(msg, error))
    }
  } catch (error) {
    reportRelayFailure(msg, error)
  }
}

// MAIN world -> service worker
// Forward gptkResult, gptkResultChunk, gptkProgress, gptkLog messages.
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const msg = event.data as AppMessage
  if (msg?.app !== APP_ID) return

  // Only forward GPTK result/progress/log messages to the service worker
  if (
    msg.action === "gptkResult" ||
    msg.action === "gptkResultChunk" ||
    msg.action === "gptkProgress" ||
    msg.action === "gptkLog"
  ) {
    forwardToServiceWorker(msg)
  }
})

// Service worker -> MAIN world
// Forward gptkCommand messages from the extension to the page.
chrome.runtime.onMessage.addListener((message: AppMessage) => {
  if (message?.app !== APP_ID) return
  if (message.action === "gptkCommand") {
    window.postMessage(message)
  }
})

console.log("GPD: Bridge content script loaded")
