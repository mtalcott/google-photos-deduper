// MAIN world command handler for Google Photos pages.
// This script runs in the page's JS context (injected via <script> tag)
// and has access to GPTK globals: window.gptkApi, window.gptkCore, window.gptkApiUtils.
//
// Communication with the extension happens via window.postMessage.
// The bridge content script (google-photos-bridge.ts) relays these to chrome.runtime.

const GPD_APP_ID = "GPD";

function postResult(command, requestId, data) {
  window.postMessage({
    app: GPD_APP_ID,
    action: "gptkResult",
    command,
    requestId,
    success: true,
    data,
  });
}

function postError(command, requestId, error) {
  window.postMessage({
    app: GPD_APP_ID,
    action: "gptkResult",
    command,
    requestId,
    success: false,
    error: String(error),
  });
}

function postProgress(requestId, itemsProcessed, message) {
  window.postMessage({
    app: GPD_APP_ID,
    action: "gptkProgress",
    requestId,
    itemsProcessed,
    message,
  });
}

// ============================================================
// Command: getAllMediaItems
// Fetches all media items from the library via GPTK pagination.
// ============================================================

async function getAllMediaItems(requestId, args) {
  const gptkApi = window.gptkApi;
  if (!gptkApi) {
    postError("getAllMediaItems", requestId, "GPTK API not available. Reload the Google Photos page.");
    return;
  }

  try {
    let nextPageId = null;
    const mediaItems = [];

    do {
      const page = await gptkApi.getItemsByUploadedDate(nextPageId);
      if (!page) {
        console.warn("GPD: Empty page response, stopping pagination");
        break;
      }
      if (page.items && page.items.length > 0) {
        for (const item of page.items) {
          mediaItems.push({
            mediaKey: item.mediaKey,
            dedupKey: item.dedupKey,
            thumb: item.thumb,
            timestamp: item.timestamp,
            creationTimestamp: item.creationTimestamp,
            resWidth: item.resWidth,
            resHeight: item.resHeight,
            duration: item.duration,
            isOwned: item.isOwned,
            fileName: item.descriptionShort || null,
            productUrl: 'https://photos.google.com/photo/' + item.mediaKey,
          });
        }
      }
      nextPageId = page.nextPageId || null;

      postProgress(requestId, mediaItems.length, `Fetched ${mediaItems.length} items`);
    } while (nextPageId);

    postResult("getAllMediaItems", requestId, mediaItems);
  } catch (error) {
    postError("getAllMediaItems", requestId, error);
  }
}

// ============================================================
// Command: trashItems
// Moves items to trash via GPTK's batch API (no DOM clicking).
// ============================================================

async function trashItems(requestId, args) {
  // Call api.moveItemsToTrash directly instead of gptkApiUtils.moveToTrash,
  // because the latter goes through executeWithConcurrency which checks
  // gptkCore.isProcessRunning (always false when called from extension).
  const api = window.gptkApiUtils?.api;
  if (!api) {
    postError("trashItems", requestId, "GPTK API not available. Reload the Google Photos page.");
    return;
  }

  try {
    const dedupKeys = args.dedupKeys;
    const mediaKeysToTrash = args.mediaKeysToTrash || [];
    console.log("GPD: Trashing", dedupKeys.length, "items via api.moveItemsToTrash");
    await api.moveItemsToTrash(dedupKeys);
    postResult("trashItems", requestId, {
      trashedCount: dedupKeys.length,
      trashedKeys: mediaKeysToTrash,
    });
  } catch (error) {
    console.error("GPD: Trash error", error);
    postError("trashItems", requestId, error);
  }
}

// ============================================================
// Command: restoreItems
// Restores items from trash via GPTK's batch API.
// ============================================================

async function restoreItems(requestId, args) {
  // Call api.restoreFromTrash directly (same reason as trashItems —
  // executeWithConcurrency checks isProcessRunning which is always false here).
  const api = window.gptkApiUtils?.api;
  if (!api) {
    postError("restoreItems", requestId, "GPTK API not available. Reload the Google Photos page.");
    return;
  }

  try {
    const dedupKeys = args.dedupKeys;
    console.log("GPD: Restoring", dedupKeys.length, "items from trash");
    await api.restoreFromTrash(dedupKeys);
    postResult("restoreItems", requestId, { restoredCount: dedupKeys.length });
  } catch (error) {
    console.error("GPD: Restore error", error);
    postError("restoreItems", requestId, error);
  }
}

// ============================================================
// Command: healthCheck
// Verifies GPTK is loaded and WIZ_global_data is available.
// ============================================================

function healthCheck(requestId) {
  const hasGptk = typeof window.gptkApi !== "undefined";
  const hasWizData = typeof window.WIZ_global_data !== "undefined";
  // oPEP7c is the signed-in account email in WIZ_global_data
  const accountEmail = hasWizData ? (window.WIZ_global_data.oPEP7c || "") : "";
  postResult("healthCheck", requestId, { hasGptk, hasWizData, accountEmail });
}

// ============================================================
// Message listener
// ============================================================

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (msg?.app !== GPD_APP_ID || msg?.action !== "gptkCommand") return;

  const { command, requestId, args } = msg;
  console.log("GPD: Received command", command, requestId);

  switch (command) {
    case "getAllMediaItems":
      await getAllMediaItems(requestId, args);
      break;
    case "trashItems":
      await trashItems(requestId, args);
      break;
    case "restoreItems":
      await restoreItems(requestId, args);
      break;
    case "healthCheck":
      healthCheck(requestId);
      break;
    default:
      postError(command, requestId, `Unknown command: ${command}`);
  }
});

console.log("GPD: Command handler loaded");
