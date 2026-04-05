import type { PlasmoCSConfig } from "plasmo"
import { APP_ID } from "../lib/types"
import type { AppMessage } from "../lib/types"

// Bridge content script (ISOLATED world) for Google Photos pages.
// Relays messages between:
//   - MAIN world scripts (via window.postMessage) and
//   - The extension service worker (via chrome.runtime messaging)

export const config: PlasmoCSConfig = {
  matches: ["https://photos.google.com/*"],
  run_at: "document_idle",
}

// MAIN world -> service worker
// Forward gptkResult, gptkProgress, gptkLog messages from the page to the extension.
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const msg = event.data as AppMessage
  if (msg?.app !== APP_ID) return

  // Only forward GPTK result/progress/log messages to the service worker
  if (
    msg.action === "gptkResult" ||
    msg.action === "gptkProgress" ||
    msg.action === "gptkLog"
  ) {
    chrome.runtime.sendMessage(msg)
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
