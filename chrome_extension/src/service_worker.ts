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

async function handleStartDeletionTask(
  message: StartDeletionTaskMessageType,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  let handleStopDeletionTask: any | undefined;
  let handleWindowRemoved: any | undefined;

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
    const handleWindowRemoved = (windowId: number) => {
      if (windowId === window.id) {
        console.error("Window closed!");
        abortController.abort(new WindowClosedError());
      }
    };
    chrome.windows.onRemoved.addListener(handleWindowRemoved);

    // Listen for cancel messages and abort if received
    handleStopDeletionTask = async (message: any, _sender: any) => {
      if (
        message?.app === "GooglePhotosDeduper" &&
        message?.action === "stopDeletionTask"
      ) {
        chrome.runtime.onMessage.removeListener(handleStopDeletionTask);
        abortController.abort(new TaskCancelledError());

        // Remove the window close listener so we don't error when closing
        chrome.windows.onRemoved.removeListener(handleWindowRemoved);
        // Close the window
        await chrome.windows.remove(window.id!);
      }
    };
    chrome.runtime.onMessage.addListener(handleStopDeletionTask);

    for (const mediaItem of message.mediaItems) {
      abortSignal.throwIfAborted();
      await navigateAndDelete(tab, mediaItem, sender);
    }

    chrome.windows.onRemoved.removeListener(handleWindowRemoved);

    await chrome.windows.remove(window.id!);

    chrome.tabs.sendMessage(
      sender.tab!.id!,
      deletionTaskResultMessage({ success: true })
    );
  } catch (error: any) {
    console.error("handleStartDeletionTask error", error);

    let message;
    if (error instanceof TaskCancelledError) {
      message = "Cancelled.";
    } else if (error instanceof WindowClosedError) {
      message = "Window was closed.";
    } else {
      message =
        "Whoops! An unexpected error occurred. Check the Chrome \
          Extension service worker logs for more details.";
    }

    chrome.tabs.sendMessage(
      sender.tab!.id!,
      deletionTaskResultMessage({
        success: false,
        error: message,
      })
    );
  } finally {
    if (handleStopDeletionTask) {
      chrome.runtime.onMessage.removeListener(handleStopDeletionTask);
    }
    if (handleWindowRemoved) {
      chrome.windows.onRemoved.removeListener(handleWindowRemoved);
    }
  }
}

async function navigateAndDelete(
  tab: chrome.tabs.Tab,
  mediaItem: StartDeletionTaskMessageType["mediaItems"][0],
  sender: chrome.runtime.MessageSender
): Promise<void> {
  let handleTabUpdated: any | undefined;
  let handleDeletePhotoResultMessage: any | undefined;

  try {
    // Navigate to the photo in Google Photos
    await chrome.tabs.update(tab.id!, { url: mediaItem.productUrl });

    // Wait for the page to load
    await new Promise<void>((resolve) => {
      handleTabUpdated = async (
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        tab: chrome.tabs.Tab
      ) => {
        if (tabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(handleTabUpdated!);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(handleTabUpdated);
    });

    let attempts = 3;
    let success = false;
    while (!success) {
      // Workaround for 'Error: Could not establish connection. Receiving end does not exist.'
      attempts--;
      try {
        await chrome.tabs.sendMessage(tab.id!, {
          app: "GooglePhotosDeduper",
          action: "deletePhoto",
          mediaItemId: mediaItem.id,
        } as DeletePhotoMessageType);
        success = true;
      } catch (error) {
        if (attempts > 0) {
          console.warn(
            `deletePhoto message error, retrying (retries left = ${attempts})`,
            error
          );
          await new Promise((r) => setTimeout(r, 1_000)); // Sleep 1s
        } else {
          throw error;
        }
      }
    }

    // Wait for a result message
    const timeout = 10_000;
    let timerId: number | undefined;
    let result = await Promise.race([
      new Promise<DeletePhotoResultMessageType>((resolve) => {
        handleDeletePhotoResultMessage = (message: any, _sender: any) => {
          if (
            message?.app === "GooglePhotosDeduper" &&
            message?.action === "deletePhoto.result" &&
            message?.mediaItemId === mediaItem.id
          ) {
            chrome.runtime.onMessage.removeListener(
              handleDeletePhotoResultMessage
            );
            resolve(message);
          }
        };
        chrome.runtime.onMessage.addListener(handleDeletePhotoResultMessage);
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
  } finally {
    if (handleTabUpdated) {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    }
    if (handleDeletePhotoResultMessage) {
      chrome.runtime.onMessage.removeListener(handleDeletePhotoResultMessage);
    }
  }
}

function deletionTaskResultMessage(
  props: Partial<StartDeletionTaskResultMessageType>
): StartDeletionTaskResultMessageType {
  return Object.assign(
    {
      app: "GooglePhotosDeduper",
      action: "startDeletionTask.result",
      success: true,
    },
    props
  ) as StartDeletionTaskResultMessageType;
}

class TaskCancelledError extends Error {}
class WindowClosedError extends Error {}
