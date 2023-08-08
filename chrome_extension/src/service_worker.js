// Chrome extension background worker

const VERSION = chrome.runtime.getManifest().version;

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

function handleStartDeletionTask(message, sender) {
  console.debug("[service_worker] startDeletionTask", message);

  (async () => {
    let photosTab = await chrome.tabs.create({ active: true });

    for (const mediaItem of message.duplicateMediaItems) {
      await navigateAndDelete(photosTab, mediaItem, sender);
    }

    chrome.tabs.remove(photosTab.id);
  })();

  const response = {
    app: "GooglePhotosDeduper",
    action: "startDeletionTask.result",
    success: true,
  };
  console.debug(
    "[service_worker] sending startDeletionTask response",
    response
  );
  chrome.tabs.sendMessage(sender.tab.id, response);
}

async function navigateAndDelete(tab, mediaItem, sender) {
  // Navigate to the photo in Google Photos
  await chrome.tabs.update(tab.id, { url: mediaItem.productUrl });

  // Wait for the page to load
  await new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(
      tabId,
      changeInfo,
      tab
    ) {
      if (tabId === tab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });

  console.debug("[service_worker] sending deletePhoto action to photosTab");

  chrome.tabs.sendMessage(tab.id, {
    app: "GooglePhotosDeduper",
    action: "deletePhoto",
    mediaItemId: mediaItem.id,
    senderTabId: sender.tab.id,
  });

  // Wait for a result message
  const result = await new Promise((resolve) => {
    chrome.runtime.onMessage.addListener(function listener(message, sender) {
      if (
        message?.app === "GooglePhotosDeduper" &&
        message?.action === "deletePhoto.result" &&
        message?.mediaItemId === mediaItem.id
      ) {
        console.debug(
          "[service_worker] received deletePhoto.result message",
          message
        );
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message);
      }
    });
  });

  console.debug(
    "[service_worker] received deletePhoto.result, forwarding result to original tab",
    result
  );

  // Forward the result to the original tab
  chrome.tabs.sendMessage(sender.tab.id, result);
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
