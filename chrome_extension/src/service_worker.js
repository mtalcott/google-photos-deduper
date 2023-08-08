// Chrome extension background worker

// TODO: Get this from the manifest
// https://developer.chrome.com/docs/extensions/reference/runtime/#method-getManifest
const VERSION = "0.1";

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.app !== "GooglePhotosDeduper") {
    // Filter out messages not intended for our app
    // TODO: more thorough vetting
    return;
  }

  console.debug("[service_worker] message received", { message, sender });

  if (message?.action === "healthCheck") {
    handleHealthCheck(message, sender);
  } else if (message?.action === "startDeletionTask") {
    handleStartDeletionTask(message, sender);
  } else if (message?.action === "deletePhoto.result") {
    handleDeletePhotoResult(message, sender);
  }
});

function handleHealthCheck(message, sender) {
  const response = {
    app: "GooglePhotosDeduper",
    action: "healthCheck.result",
    success: true,
    version: VERSION,
  };
  console.debug("[service_worker] sending healthCheck response", response);
  chrome.tabs.sendMessage(sender.tab.id, response);
}

function handleStartDeletionTask(message, sender, sendResponse) {
  console.debug("[service_worker] startDeletionTask", message);

  (async () => {
    for (const mediaItem of message.duplicateMediaItems) {
      // Wait until photosTab, created below, has finished loading, then send message
      chrome.tabs.onUpdated.addListener(async function listener(
        tabId,
        changeInfo,
        tab
      ) {
        if (tabId == photosTab?.id && changeInfo.status === "complete") {
          // Remove the listener now so we don't send duplicate messages
          chrome.tabs.onUpdated.removeListener(listener);
          // Send deletePhoto action to photosTab
          console.debug(
            "[service_worker] sending deletePhoto action to photosTab"
          );

          chrome.tabs.sendMessage(photosTab.id, {
            app: "GooglePhotosDeduper",
            action: "deletePhoto",
            photoId: mediaItem.id,
            senderTabId: sender.tab.id,
          });
        }
      });

      console.debug("[service_worker] Creating tab for", { mediaItem });
      let photosTab = await chrome.tabs.create({
        url: mediaItem.productUrl,
        active: true,
      });
    }
  })();
}

function handleDeletePhotoResult(message, sender) {
  console.debug(
    "[service_worker] handleDeletePhotoResult forwarding result to original tab",
    { message, sender }
  );

  chrome.tabs.sendMessage(message.originalMessage.senderTabId, message);

  if (message.success) {
    // TODO: just reuse this tab instead of creating a new one every time
    chrome.tabs.remove(sender.tab.id);
  }
}

// photosTab = await chrome.tabs.create({active: false});
// chrome.storage.local.set({ apiSuggestions })
// await chrome.storage.local.get('apiSuggestions')

// Option 2 - delete dupes directly
// add listener to listen to message from app page, with commands and args
// command = delete duplicate(s)
// create tab if none exists
// visit each duplicate
// click trash icon, move to trash
// send message back to service worker to mark as successfully deleted & timestamp, save on image metadata
