import type { PlasmoCSConfig } from "plasmo"

// Content script that injects MAIN world scripts into Google Photos pages.
// These scripts need to run in the page's JS context to access GPTK globals
// (window.gptkApi, window.gptkCore, window.WIZ_global_data).

export const config: PlasmoCSConfig = {
  matches: ["https://photos.google.com/*"],
  run_at: "document_idle",
}

function injectScript(fileName: string): void {
  const url = chrome.runtime.getURL(fileName)
  const script = document.createElement("script")
  script.src = url
  script.type = "text/javascript"
  ;(document.head || document.documentElement).appendChild(script)
}

// Order matters:
// 1. unsafeWindow shim (so GPTK can use `unsafeWindow`)
// 2. GPTK userscript (exposes window.gptkApi, gptkCore, gptkApiUtils)
// 3. Our command handler (listens for postMessage commands from the bridge)
injectScript("scripts/unsafewindow-shim.js")
injectScript("scripts/google-photos-toolkit.user.js")
injectScript("scripts/google-photos-commands.js")

console.log("GPD: Injected MAIN world scripts into Google Photos page")
