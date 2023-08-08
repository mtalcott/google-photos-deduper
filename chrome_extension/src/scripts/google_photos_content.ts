// Runs on Google Photos web app pages

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.app !== "GooglePhotosDeduper") {
    // Filter out messages not intended for our app
    // TODO: more thorough vetting
    return;
  }

  console.info("[google_photos_content] message received", { message, sender });

  if (message?.action === "deletePhoto") {
    handleDeletePhoto(message, sender);
  }
});

function handleDeletePhoto(message, sender) {
  (async () => {
    const trashButton = await waitForElement("[data-delete-origin] button");
    console.info("trashButton", trashButton);
    // trashButton.click();

    // const confirmButton = await waitForElement("[jsshadow] [autofocus]");
    // console.info("confirmButton", confirmButton);
    // confirmButton.click();

    // const confirmationToaster = await waitForElement(
    //   '[role="status"][aria-live="polite"]',
    // );
    // console.info("confirmationToaster", confirmationToaster);

    const resultMessage = {
      app: "GooglePhotosDeduper",
      action: "deletePhoto.result",
      success: true,
      userUrl: window.location.href,
      deletedAt: new Date(),
      mediaItemId: message.mediaItemId,
      originalMessage: message,
    };
    console.info(
      "[google_photos_content] success, sending response to chrome runtime",
      resultMessage
    );
    chrome.runtime.sendMessage(resultMessage);
  })();
}

function waitForElement(selector) {
  // TODO: Add timeout
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver((mutations) => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}
