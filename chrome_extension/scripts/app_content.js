// Runs on _this_ app's pages

(async () => {
  // Listen to window messages and pass them on to the chrome runtime
  window.addEventListener("message", async (event) => {
    if (
      event.data?.app !== "GooglePhotosDeduper" || // Filter out messages not intended for our app
      event.data?.action === "response" // Filter out our own responses posted here
    ) {
      // TODO: more thorough vetting
      return;
    }
    console.debug(
      "message received in app_content, passing on to chrome runtime",
      event.data,
    );
    const response = await chrome.runtime.sendMessage(event.data);
    console.debug("message responded in app_content", {
      response,
      eventData: event.data,
    });
    window.postMessage({
      app: "GooglePhotosDeduper",
      action: "response",
      originalMessage: event.data,
      response,
    });
  });
})();
