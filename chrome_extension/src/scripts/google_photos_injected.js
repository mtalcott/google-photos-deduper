// Runs on Google Photos web app pages.
// Because this script is added directly
//   to the page, it has access to window variables that a Chrome extension
//   content script does not (see https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts#world-timings).
//   This is necessary to be able to access GPTK's `window.gptkApi`.
// Unfortunately, CRXJS doesn't support compilation of web_accessible_resources
//   (see https://github.com/crxjs/chrome-extension-tools/discussions/616), and
//   also doesn't support `world: "MAIN"` (see https://github.com/crxjs/chrome-extension-tools/issues/695)
//   so JS and not TS it is.

// Listen for incoming messages on window from servaice worker executeScript calls
window.addEventListener("message", async (message) => {
  if (message.data?.app !== "GooglePhotosDeduper") {
    // Filter out messages not intended for our app
    // TODO: more thorough vetting
    return;
  }

  console.log("google_photos_injected received message", { message });

  if (message.data?.action === "getAllMediaItems") {
    await getAllMediaItems();
  }
});

async function getAllMediaItems() {
  let nextPageId = null;
  const mediaItems = [];
  const gptkApi = window.gptkApi;
  do {
    const page = await gptkApi.getItemsByUploadedDate(nextPageId);
    for (const item of page.items) {
      // const itemInfo = await gptkApi.getItemInfoExt(item.mediaKey);
      mediaItems.push(item);
    }
    nextPageId = page.nextPageId;
  } while (nextPageId);

  window.postMessage({
    app: "GooglePhotosDeduper",
    action: "getAllMediaItems.result",
    mediaItems
  })
}
