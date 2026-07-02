import type { PlasmoCSConfig } from "plasmo"

import { APP_ID } from "../lib/types"
import type { AppMessage } from "../lib/types"

export const config: PlasmoCSConfig = {
  matches: ["https://www.icloud.com/*", "https://www.icloud.com.cn/*"],
  all_frames: true,
  run_at: "document_idle"
}

function safeSendRuntimeMessage(message: AppMessage) {
  try {
    chrome.runtime?.sendMessage?.(message)
  } catch {
    // The extension was likely reloaded while this content script remained on
    // the page. Ignore stale bridge messages instead of surfacing noisy errors.
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const msg = event.data as AppMessage
  if (msg?.app !== APP_ID) return

  if (
    msg.action === "gptkResult" ||
    msg.action === "gptkProgress" ||
    msg.action === "gptkLog"
  ) {
    safeSendRuntimeMessage(msg)
  }
})

chrome.runtime.onMessage.addListener((message: AppMessage) => {
  if (message?.app !== APP_ID) return
  if (message.action === "gptkCommand") {
    window.postMessage(message)
  }
})

console.log("GPD: iCloud bridge content script loaded")
