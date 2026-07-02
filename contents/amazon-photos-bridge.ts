import type { PlasmoCSConfig } from "plasmo"

import { APP_ID } from "../lib/types"
import type { AppMessage } from "../lib/types"

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.amazon.com/*",
    "https://www.amazon.ca/*",
    "https://www.amazon.co.uk/*",
    "https://www.amazon.de/*",
    "https://www.amazon.fr/*",
    "https://www.amazon.it/*",
    "https://www.amazon.es/*",
    "https://www.amazon.co.jp/*",
    "https://www.amazon.com.au/*",
    "https://www.amazon.in/*",
    "https://www.amazon.com.br/*",
    "https://www.amazon.com.mx/*",
    "https://www.amazon.nl/*",
    "https://www.amazon.sg/*",
    "https://www.amazon.ae/*",
    "https://www.amazon.sa/*",
    "https://www.amazon.se/*",
    "https://www.amazon.pl/*",
    "https://www.amazon.com.tr/*",
    "https://www.amazon.be/*",
    "https://www.amazon.eg/*"
  ],
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

console.log("GPD: Amazon Photos bridge content script loaded")
