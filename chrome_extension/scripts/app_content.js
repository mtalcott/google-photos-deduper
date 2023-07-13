// Runs on _this_ app's pages

(async () => {
  // Listen to window messages and pass them on to the chrome runtime
  window.addEventListener("message", (event) => {
    // TODO: qualify the event more, make sure it's something we want to pass along
    console.log(
      "message received in app_content, passing on to chrome runtime",
      event.data
    );
    chrome.runtime.sendMessage(event.data);
  });
})();
