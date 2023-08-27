// Chrome extension background worker

import {
  DeletePhotoMessageType,
  DeletePhotoResultMessageType,
  HealthCheckMessageType,
  StartDeletionTaskMessageType,
  StartDeletionTaskResultMessageType,
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
  _message: HealthCheckMessageType,
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
    const resultMessage: StartDeletionTaskResultMessageType = {
      app: "GooglePhotosDeduper",
      action: "startDeletionTask.result",
      success: true,
    };

    try {
      // Open a new window to delete photos in
      const window = await chrome.windows.create({
        focused: true,
        incognito: sender.tab!.incognito,
        width: 500,
        height: 200,
      });
      const tab = window.tabs![0];

      // Detect and warn if window closed
      const windowRemovedListener = (windowId: number) => {
        if (windowId === window.id) {
          // TODO: handle window closed
          console.error("Window closed!");
          chrome.tabs.sendMessage(sender.tab!.id!, {
            ...resultMessage,
            success: false,
            error: "Window was closed.",
          });
        }
      };
      chrome.windows.onRemoved.addListener(windowRemovedListener);

      for (const mediaItem of message.mediaItems) {
        await navigateAndDelete(tab, mediaItem, sender);
      }

      chrome.windows.onRemoved.removeListener(windowRemovedListener);

      await chrome.windows.remove(window.id!);

      chrome.tabs.sendMessage(sender.tab!.id!, resultMessage);
    } catch (error) {
      console.error("handleStartDeletionTask error", error);
      chrome.tabs.sendMessage(sender.tab!.id!, {
        ...resultMessage,
        success: false,
        error:
          "Whoops! An unexpected error occurred. Please check the Chrome \
          Extension service worker logs for more details.",
      });
    }
  })().catch((error) => {
    console.error("handleStartDeletionTask promise error", error);
  });
}

async function navigateAndDelete(
  tab: chrome.tabs.Tab,
  mediaItem: StartDeletionTaskMessageType["mediaItems"][0],
  sender: chrome.runtime.MessageSender
): Promise<void> {
  try {
    // Navigate to the photo in Google Photos
    await chrome.tabs.update(tab.id!, { url: mediaItem.productUrl });

    // Wait for the page to load
    await new Promise<void>((resolve) => {
      chrome.tabs.onUpdated.addListener(async function listener(
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

    await chrome.tabs.sendMessage(tab.id!, {
      app: "GooglePhotosDeduper",
      action: "deletePhoto",
      mediaItemId: mediaItem.id,
    } as DeletePhotoMessageType);

    // Wait for a result message
    const timeout = 10_000;
    let timerId: number | undefined;
    let result = await Promise.race([
      new Promise<DeletePhotoResultMessageType>((resolve) => {
        chrome.runtime.onMessage.addListener(function listener(
          message,
          _sender
        ) {
          if (
            message?.app === "GooglePhotosDeduper" &&
            message?.action === "deletePhoto.result" &&
            message?.mediaItemId === mediaItem.id
          ) {
            chrome.runtime.onMessage.removeListener(listener);
            resolve(message);
          }
        });
      }),
      new Promise(
        (_resolve, reject) =>
          (timerId = setTimeout(
            () =>
              reject(
                `Timeout: failed to delete mediaItem ${mediaItem.id} within ${
                  timeout / 1000
                }s, skipping`
              ),
            timeout
          ))
      ),
    ]).finally(() => clearTimeout(timerId));

    // Forward the result to the original tab
    chrome.tabs.sendMessage(sender.tab!.id!, result);
  } catch (error) {
    console.error("navigateAndDelete error", error);
    const resultMessage: DeletePhotoResultMessageType = {
      app: "GooglePhotosDeduper",
      action: "deletePhoto.result",
      mediaItemId: mediaItem.id,
      success: false,
      error: "Error, please try again",
    };

    try {
      chrome.tabs.sendMessage(sender.tab!.id!, resultMessage);
    } catch (error) {
      console.error(
        "navigateAndDelete failed to send error message back to original tab",
        error
      );
    }
  }
}
