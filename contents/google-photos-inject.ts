import type { PlasmoCSConfig } from "plasmo"

// Content script that injects MAIN world scripts into Google Photos pages.
// These scripts need to run in the page's JS context to access GPTK globals
// (window.gptkApi, window.gptkCore, window.WIZ_global_data).

export const config: PlasmoCSConfig = {
  matches: ["https://photos.google.com/*"],
  run_at: "document_idle"
}

function injectScript(fileName: string): Promise<void> {
  const url = chrome.runtime.getURL(fileName)
  const script = document.createElement("script")
  // Cache-bust to ensure latest version after extension reload
  script.src =
    url + "?v=" + chrome.runtime.getManifest().version + "-" + Date.now()
  script.type = "text/javascript"
  script.async = false
  const loaded = new Promise<void>((resolve, reject) => {
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener(
      "error",
      () => reject(new Error(`Unable to inject ${fileName}`)),
      { once: true }
    )
  })
  ;(document.head || document.documentElement).appendChild(script)
  return loaded
}

async function injectGooglePhotosScripts(): Promise<void> {
  // Order matters: GPTK requires the unsafeWindow shim, and the command
  // handler expects GPTK globals to be available when health checks run.
  await injectScript("scripts/unsafewindow-shim.js")
  await injectScript("scripts/google-photos-toolkit.user.js")
  await injectScript("scripts/photo-provider-command-host.js")
  await injectScript("scripts/google-photos-commands.js")
  console.log("GPD: Injected MAIN world scripts into Google Photos page")
}

void injectGooglePhotosScripts().catch((error) => {
  console.warn("GPD: Failed to inject Google Photos scripts", error)
})
