// Runs on GooglePhotosDeduper app's pages

import {
  DeletePhotoResultMessageType,
  HealthCheckMessageType,
  HealthCheckResultMessageType,
  StartDeletionTaskMessageType,
  StartDeletionTaskResultMessageType,
} from "types";

// Listen to window messages and pass them on to the chrome runtime
window.addEventListener("message", (event) => {
  if (
    // Filter out messages not intended for our app
    event.data?.app !== "GooglePhotosDeduper"
  ) {
    // TODO: more thorough vetting?
    return;
  }

  if (["healthCheck", "startDeletionTask"].includes(event.data?.action)) {
    const message: HealthCheckMessageType | StartDeletionTaskMessageType =
      event.data;
    chrome.runtime.sendMessage(message);
  }
});

chrome.runtime.onMessage.addListener(
  (
    message:
      | HealthCheckResultMessageType
      | StartDeletionTaskResultMessageType
      | DeletePhotoResultMessageType,
    _sender
  ) => {
    if (
      // Filter out messages not intended for our app
      message?.app !== "GooglePhotosDeduper"
    ) {
      // TODO: more thorough vetting?
      return;
    }

    if (
      [
        "healthCheck.result",
        "startDeletionTask.result",
        "deletePhoto.result",
      ].includes(message.action)
    ) {
      window.postMessage(message);
    }
  }
);
