chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("background.js onMessage", { message });
  if (message?.action === "startDeletionTask") {
    console.log("background.js startDeletionTask", message);

    for (mediaItem of message.duplicateMediaItems) {
      // Wait until photosTab, created below, has finished loading, then send message
      chrome.tabs.onUpdated.addListener(async function listener(
        tabId,
        changeInfo,
        tab
      ) {
        if (
          photosTab &&
          tabId == photosTab.id &&
          changeInfo.status === "complete"
        ) {
          // Remove the listener now so we don't send duplicate messages
          chrome.tabs.onUpdated.removeListener(listener);
          // Send deletePhoto action to photosTab
          console.log("sending deletePhoto action to photosTab");

          let result = await chrome.tabs.sendMessage(photosTab.id, {
            action: "deletePhoto",
          });

          console.log("result", result);
          if (result?.success) {
            // TODO: just reuse this tab instead of creating a new one every time
            await chrome.tabs.remove(photosTab.id);
          }
        }
      });

      console.log("Creating tab for", { mediaItem });
      let photosTab = await chrome.tabs.create({
        url: mediaItem.productUrl,
        active: true,
      });
    }
  }
});

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
