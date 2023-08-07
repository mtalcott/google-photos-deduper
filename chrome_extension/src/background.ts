// Chrome extension background worker

const VERSION = "0.1";

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message?.app !== "GooglePhotosDeduper") {
    // Filter out messages not intended for our app
    // TODO: more thorough vetting
    return;
  }

  console.debug("background.js message received", message);

  if (message?.action === "healthCheck") {
    sendResponse({
      app: "GooglePhotosDeduper",
      success: true,
      version: VERSION,
    });
    // Function becomes invalid when the event listener returns, unless you return true from the event listener to indicate you wish to send a response asynchronously (this will keep the message channel open to the other end until sendResponse is called).
    return true;
  }

  if (message?.action === "startDeletionTask") {
    console.debug("background.js startDeletionTask", message);

    for (mediaItem of message.duplicateMediaItems) {
      // Wait until photosTab, created below, has finished loading, then send message
      chrome.tabs.onUpdated.addListener(
        async function listener(tabId, changeInfo, tab) {
          if (
            photosTab &&
            tabId == photosTab.id &&
            changeInfo.status === "complete"
          ) {
            // Remove the listener now so we don't send duplicate messages
            chrome.tabs.onUpdated.removeListener(listener);
            // Send deletePhoto action to photosTab
            console.debug("sending deletePhoto action to photosTab");

            let result = await chrome.tabs.sendMessage(photosTab.id, {
              action: "deletePhoto",
            });

            console.debug("result", result);
            if (result?.success) {
              // TODO: just reuse this tab instead of creating a new one every time
              await chrome.tabs.remove(photosTab.id);
            }
          }
        },
      );

      console.debug("Creating tab for", { mediaItem });
      let photosTab = await chrome.tabs.create({
        url: mediaItem.productUrl,
        active: true,
      });
    }

    sendResponse({
      app: "GooglePhotosDeduper",
      success: true,
      version: VERSION,
    });
    // Function becomes invalid when the event listener returns, unless you return true from the event listener to indicate you wish to send a response asynchronously (this will keep the message channel open to the other end until sendResponse is called).
    return true;
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
