// Runs on Google Photos web app pages

(async () => {
    // console.info("google_photos_content.js loaded");

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

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.info("google_photos_content.js onMessage", { message, sender });

        if (message?.action === "deletePhoto") {
            (async () => {
                const trashButton = await waitForElement(
                    "[data-delete-origin] button"
                );
                console.info("trashButton", trashButton);
                trashButton.click();

                const confirmButton = await waitForElement(
                    "[jsshadow] [autofocus]"
                );
                console.info("confirmButton", confirmButton);
                confirmButton.click();

                const confirmationToaster = await waitForElement(
                    '[role="status"][aria-live="polite"]'
                );
                console.info("confirmationToaster", confirmationToaster);

                console.info("success, sending response");
                sendResponse({ success: true });
            })();

            // Function becomes invalid when the event listener returns, unless you return true from the event listener to indicate you wish to send a response asynchronously (this will keep the message channel open to the other end until sendResponse is called).
            return true;
        }
    });

    // chrome.runtime.sendMessage("google_photos_content.js in photosTab ready!");
})();
