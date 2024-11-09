// Runs on Google Photos web app pages

import { DeletePhotoMessageType, DeletePhotoResultMessageType } from "types";

chrome.runtime.onMessage.addListener(
  (message: DeletePhotoMessageType, sender) => {
    if (message?.app !== "GooglePhotosDeduper") {
      // Filter out messages not intended for our app
      // TODO: more thorough vetting
      return;
    }

    if (message?.action === "deletePhoto") {
      handleDeletePhoto(message, sender);
    }
  }
);

function handleDeletePhoto(
  message: DeletePhotoMessageType,
  _sender: chrome.runtime.MessageSender
): void {
  (async () => {
    const resultMessage: Partial<DeletePhotoResultMessageType> = {
      app: "GooglePhotosDeduper",
      action: "deletePhoto.result",
      mediaItemId: message.mediaItemId,
    };

    try {
      await waitForElement("img[aria-label][src*='usercontent']");
    } catch (error) {
      chrome.runtime.sendMessage({
        ...resultMessage,
        success: false,
        error: document.title, // "Can't access photo", "Error 404 (Not Found)!!1", etc.
      });
      return;
    }

    try {
      const trashButton = await waitForElement("[data-delete-origin] button");
      trashButton.click();
    } catch (error) {
      chrome.runtime.sendMessage({
        ...resultMessage,
        success: false,
        error: "Trash button not found",
      });
      return;
    }

    try {
      const confirmButton = await waitForElement("[data-mdc-dialog-button-default]");
      confirmButton.click();
    } catch (error) {
      chrome.runtime.sendMessage({
        ...resultMessage,
        success: false,
        error: "Confirm button not found",
      });
      return;
    }

    try {
      await waitForElement('[role="status"][aria-live="polite"]');
    } catch (error) {
      chrome.runtime.sendMessage({
        ...resultMessage,
        success: false,
        error: "Confirmation toaster not found",
      });
      return;
    }

    chrome.runtime.sendMessage({
      ...resultMessage,
      success: true,
      userUrl: window.location.href,
      deletedAt: new Date(),
    });
  })();
}

function waitForElement(
  selector: string,
  timeout: number = 10_000
): Promise<HTMLElement> {
  const findElementPromise = new Promise<HTMLElement>((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector) as HTMLElement);
    }

    const observer = new MutationObserver((_mutations) => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector) as HTMLElement);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  let timerId: number | undefined;
  const timeoutPromise = new Promise(
    (_resolve, reject) =>
      (timerId = setTimeout(
        () =>
          reject(
            `Timeout: selector \`${selector}\` not found after ${timeout}ms`
          ),
        timeout
      ))
  );

  return Promise.race([findElementPromise, timeoutPromise]).finally(() =>
    clearTimeout(timerId)
  ) as Promise<HTMLElement>;
}
