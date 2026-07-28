import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.icloud.com/*", "https://www.icloud.com.cn/*"],
  all_frames: true,
  run_at: "document_idle"
}

function injectScript(fileName: string): Promise<void> {
  const url = chrome.runtime.getURL(fileName)
  const script = document.createElement("script")
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

async function injectIcloudPhotosScripts(): Promise<void> {
  await injectScript("scripts/photo-provider-command-host.js")
  await injectScript("scripts/icloud-photos-commands.js")
}

void injectIcloudPhotosScripts()
  .then(() => {
    console.log("GPD: Injected MAIN world scripts into iCloud Photos page")
  })
  .catch((error) => {
    console.warn("GPD: Failed to inject iCloud Photos scripts", error)
  })
