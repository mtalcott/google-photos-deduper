import type { PlasmoCSConfig } from "plasmo"

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

async function injectAmazonPhotosScripts(): Promise<void> {
  await injectScript("scripts/photo-provider-command-host.js")
  await injectScript("scripts/amazon-photos-commands.js")
}

void injectAmazonPhotosScripts()
  .then(() => {
    console.log("GPD: Injected MAIN world scripts into Amazon Photos page")
  })
  .catch((error) => {
    console.warn("GPD: Failed to inject Amazon Photos scripts", error)
  })
