// Runs on GooglePhotosDeduper app's pages

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
    console.debug(
      "[app_content] window message received, posting to chrome runtime",
      event.data
    );

    chrome.runtime.sendMessage(event.data);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
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
    console.debug(
      "[app_content] message received from chrome runtime, posting to window",
      { message, sender }
    );
    window.postMessage(message);
  }
});
