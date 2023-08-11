// Chrome extension background worker

import {
  DeletePhotoMessageType,
  DeletePhotoResultMessageType,
  HealthCheckMessageType,
  StartDeletionTaskMessageType,
} from "types";

const VERSION = chrome.runtime.getManifest().version;

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.app !== "GooglePhotosDeduper") {
    // Filter out messages not intended for our app
    // TODO: more thorough vetting
    return;
  }

  if (message?.action === "healthCheck") {
    handleHealthCheck(message as HealthCheckMessageType, sender);
  } else if (message?.action === "startDeletionTask") {
    handleStartDeletionTask(message as StartDeletionTaskMessageType, sender);
  }
});

function handleHealthCheck(
  message: HealthCheckMessageType,
  sender: chrome.runtime.MessageSender
): void {
  const response = {
    app: "GooglePhotosDeduper",
    action: "healthCheck.result",
    success: true,
    version: VERSION,
  };

  chrome.tabs.sendMessage(sender.tab!.id!, response);
}

function handleStartDeletionTask(
  message: StartDeletionTaskMessageType,
  sender: chrome.runtime.MessageSender
): void {
  (async () => {
    // Open a new window to delete photos in
    const window = await chrome.windows.create({
      focused: true,
      incognito: sender.tab!.incognito,
    });
    const tab = window.tabs![0];

    for (const mediaItem of message.mediaItems) {
      await navigateAndDelete(tab, mediaItem, sender);
    }

    await chrome.windows.remove(window.id!);
  })();

  const response = {
    app: "GooglePhotosDeduper",
    action: "startDeletionTask.result",
    success: true,
  };

  chrome.tabs.sendMessage(sender.tab!.id!, response);
}

async function navigateAndDelete(
  tab: chrome.tabs.Tab,
  mediaItem: StartDeletionTaskMessageType["mediaItems"][0],
  sender: chrome.runtime.MessageSender
): Promise<void> {
  debugger;
  // Navigate to the photo in Google Photos
  await chrome.tabs.update(tab.id!, { url: mediaItem.productUrl });

  // Wait for the page to load
  await new Promise<void>((resolve) => {
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

  chrome.tabs.sendMessage(tab.id!, {
    app: "GooglePhotosDeduper",
    action: "deletePhoto",
    mediaItemId: mediaItem.id,
  } as DeletePhotoMessageType);

  // Wait for a result message
  const result = await new Promise<DeletePhotoResultMessageType>((resolve) => {
    chrome.runtime.onMessage.addListener(function listener(message, sender) {
      if (
        message?.app === "GooglePhotosDeduper" &&
        message?.action === "deletePhoto.result" &&
        message?.mediaItemId === mediaItem.id
      ) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message);
      }
    });
  });

  // Forward the result to the original tab
  chrome.tabs.sendMessage(sender.tab!.id!, result);
}
