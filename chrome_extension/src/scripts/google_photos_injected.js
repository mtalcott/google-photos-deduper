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
