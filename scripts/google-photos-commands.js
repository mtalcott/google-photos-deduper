// MAIN world command handler for Google Photos pages.
// This script runs in the page's JS context (injected via <script> tag)
// and has access to GPTK globals: window.gptkApi, window.gptkCore, window.gptkApiUtils.
//
// Communication with the extension happens via window.postMessage.
// The bridge content script (google-photos-bridge.ts) relays these to chrome.runtime.

const GPD_APP_ID = "GPD"

// Number of items per API request for batch operations (trash, restore).
// Matches GPTK's default operationSize. Large single requests cause HTTP 504.
const BATCH_SIZE = 250

function postResult(command, requestId, data) {
  window.postMessage({
    app: GPD_APP_ID,
    action: "gptkResult",
    command,
    requestId,
    success: true,
    data
  })
}

function postError(command, requestId, error) {
  window.postMessage({
    app: GPD_APP_ID,
    action: "gptkResult",
    command,
    requestId,
    success: false,
    error: String(error)
  })
}

// command is optional; when provided, the app can route progress to the right handler.
function postProgress(requestId, itemsProcessed, message, command) {
  window.postMessage({
    app: GPD_APP_ID,
    action: "gptkProgress",
    requestId,
    itemsProcessed,
    message,
    ...(command !== undefined ? { command } : {})
  })
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function mapMediaItem(item) {
  return {
    mediaKey: item.mediaKey,
    dedupKey: item.dedupKey,
    thumb: item.thumb,
    timestamp: item.timestamp,
    creationTimestamp: item.creationTimestamp,
    resWidth: item.resWidth,
    resHeight: item.resHeight,
    duration: item.duration,
    isOwned: item.isOwned,
    isOriginalQuality: item.isOriginalQuality ?? null,
    fileName: item.descriptionShort || null,
    productUrl: "https://photos.google.com/photo/" + item.mediaKey
  }
}

// ============================================================
// Command: getAlbums
// Fetches all albums from the library via GPTK pagination.
// ============================================================

// Per-page timeout. Google's pagination endpoint occasionally hangs without
// ever rejecting fetch(), which used to lock the UI on "Fetching media
// items" indefinitely. A timeout lets us surface a real error to the user.
const PAGE_TIMEOUT_MS = 60_000

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${Math.round(ms / 1000)}s. Google's API likely stalled — please re-scan.`
          )
        ),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}


async function getAlbums(requestId) {
  const gptkApi = window.gptkApi
  if (!gptkApi) {
    postError(
      "getAlbums",
      requestId,
      "GPTK API not available. Reload the Google Photos page."
    )
    return
  }

  try {
    let nextPageId = null
    const albums = []

    do {
      const page = await withTimeout(
        gptkApi.getAlbums(nextPageId),
        PAGE_TIMEOUT_MS,
        "Fetching albums from Google Photos"
      )
      if (!page) {
        console.warn("GPD: Empty page response, stopping pagination")
        break
      }
      if (page.items && page.items.length > 0) {
        for (const album of page.items) {
          albums.push({
            mediaKey: album.mediaKey,
            title: album.title,
            thumb: album.thumb,
            itemCount: album.itemCount
          })
        }
      }
      nextPageId = page.nextPageId || null
    } while (nextPageId)

    postResult("getAlbums", requestId, albums)
  } catch (error) {
    postError("getAlbums", requestId, error)
  }
}

// ============================================================
// Command: getAllMediaItems
// Fetches all media items from the library via GPTK pagination.
// ============================================================

async function getAllMediaItems(requestId, args) {
  const gptkApi = window.gptkApi
  if (!gptkApi) {
    postError(
      "getAllMediaItems",
      requestId,
      "GPTK API not available. Reload the Google Photos page."
    )
    return
  }

  // sinceTimestamp: stop paginating once we reach items already in the cache
  const sinceTimestamp =
    args && args.sinceTimestamp ? args.sinceTimestamp : null

  try {
    const mediaItems = []
    const albumKeys = (args && args.albumMediaKeys) ? args.albumMediaKeys : []
    const isAlbumScan = albumKeys.length > 0

    const dateRange = (args && args.dateRange) ? args.dateRange : null
    const fromTs = dateRange?.from ? new Date(dateRange.from).getTime() : null
    const toTs = dateRange?.to ? new Date(dateRange.to).getTime() : null

    if (isAlbumScan) {
      const seenKeys = new Set()
      for (const albumMediaKey of albumKeys) {
        let nextPageId = null
        do {
          let page = null;
          let retries = 0;
          const MAX_RETRIES = 3;
          while (true) {
            try {
              page = await withTimeout(
                gptkApi.getAlbumPage(albumMediaKey, nextPageId),
                PAGE_TIMEOUT_MS,
                "Fetching album page from Google Photos"
              )
              if (!page) {
                throw new Error("Empty page response from Google Photos API");
              }
              break; // Success
            } catch (error) {
              if (retries >= MAX_RETRIES) {
                throw new Error(`Failed to fetch album ${albumMediaKey} after ${MAX_RETRIES} retries: ${error.message}`);
              }
              retries++;
              console.warn(`GPD: Error fetching album page, retrying (${retries}/${MAX_RETRIES}):`, error);
              await new Promise(r => setTimeout(r, 1000));
            }
          }
          if (page.items && page.items.length > 0) {
            for (const item of page.items) {
              if (seenKeys.has(item.mediaKey)) continue
              if (fromTs !== null && item.timestamp < fromTs) continue
              if (toTs !== null && item.timestamp > toTs) continue
              seenKeys.add(item.mediaKey)
              mediaItems.push(mapMediaItem(item))
            }
          }
          nextPageId = page.nextPageId || null

          postProgress(
            requestId,
            mediaItems.length,
            `Fetched ${mediaItems.length} items from albums`
          )
        } while (nextPageId)
      }
    } else {
      let reachedCache = false
      let nextPageId = null
      do {
        const page = await withTimeout(
          gptkApi.getItemsByUploadedDate(nextPageId),
          PAGE_TIMEOUT_MS,
          "Fetching page from Google Photos"
        )
        if (!page) {
          console.warn("GPD: Empty page response, stopping pagination")
          break
        }
        if (page.items && page.items.length > 0) {
          for (const item of page.items) {
            // Items are sorted newest-first — stop when we hit the cached watermark
            if (
              sinceTimestamp !== null &&
              item.creationTimestamp <= sinceTimestamp
            ) {
              reachedCache = true
              break
            }
            if (fromTs !== null && item.timestamp < fromTs) continue
            if (toTs !== null && item.timestamp > toTs) continue
            mediaItems.push(mapMediaItem(item))
          }
        }
        nextPageId = page.nextPageId || null

        postProgress(
          requestId,
          mediaItems.length,
          `Fetched ${mediaItems.length} items`
        )

        if (reachedCache) break
      } while (nextPageId)
    }

    postResult("getAllMediaItems", requestId, mediaItems)
  } catch (error) {
    postError("getAllMediaItems", requestId, error)
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
  const api = window.gptkApiUtils?.api
  if (!api) {
    postError(
      "trashItems",
      requestId,
      "GPTK API not available. Reload the Google Photos page."
    )
    return
  }

  try {
    const dedupKeys = args.dedupKeys
    const mediaKeysToTrash = args.mediaKeysToTrash || []
    const total = dedupKeys.length
    const chunks = chunkArray(dedupKeys, BATCH_SIZE)
    console.log(
      `[GPD] trash: ${total} items, ${chunks.length} chunk(s) of ${BATCH_SIZE}`
    )

    // Chunk to avoid HTTP 504 Gateway Timeout on large batches (fixes #107).
    let trashed = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      await api.moveItemsToTrash(chunk)
      trashed += chunk.length
      console.log(
        `[GPD] trash chunk ${i + 1}/${chunks.length}: ${trashed}/${total} done`
      )
      postProgress(
        requestId,
        trashed,
        `Moved ${trashed} of ${total} items to trash`,
        "trashItems"
      )
    }

    console.log(`[GPD] trash complete: ${total} items moved`)
    postResult("trashItems", requestId, {
      trashedCount: total,
      trashedKeys: mediaKeysToTrash
    })
  } catch (error) {
    console.error("[GPD] trash error:", error)
    postError("trashItems", requestId, error)
  }
}

// ============================================================
// Command: restoreItems
// Restores items from trash via GPTK's batch API.
// ============================================================

async function restoreItems(requestId, args) {
  // Call api.restoreFromTrash directly (same reason as trashItems —
  // executeWithConcurrency checks isProcessRunning which is always false here).
  const api = window.gptkApiUtils?.api
  if (!api) {
    postError(
      "restoreItems",
      requestId,
      "GPTK API not available. Reload the Google Photos page."
    )
    return
  }

  try {
    const dedupKeys = args.dedupKeys
    const total = dedupKeys.length
    const chunks = chunkArray(dedupKeys, BATCH_SIZE)
    console.log(
      `[GPD] restore: ${total} items, ${chunks.length} chunk(s) of ${BATCH_SIZE}`
    )

    // Chunk to avoid HTTP 504 Gateway Timeout on large batches.
    let restored = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      await api.restoreFromTrash(chunk)
      restored += chunk.length
      console.log(
        `[GPD] restore chunk ${i + 1}/${chunks.length}: ${restored}/${total} done`
      )
      postProgress(
        requestId,
        restored,
        `Restored ${restored} of ${total} items`,
        "restoreItems"
      )
    }

    console.log(`[GPD] restore complete: ${total} items restored`)
    postResult("restoreItems", requestId, { restoredCount: total })
  } catch (error) {
    console.error("[GPD] restore error:", error)
    postError("restoreItems", requestId, error)
  }
}

// ============================================================
// Command: healthCheck
// Verifies GPTK is loaded and WIZ_global_data is available.
// ============================================================

function healthCheck(requestId) {
  const hasGptk = typeof window.gptkApi !== "undefined"
  const hasWizData = typeof window.WIZ_global_data !== "undefined"
  // oPEP7c is the signed-in account email in WIZ_global_data
  const accountEmail = hasWizData ? window.WIZ_global_data.oPEP7c || "" : ""
  postResult("healthCheck", requestId, { hasGptk, hasWizData, accountEmail })
}

// ============================================================
// Message listener
// ============================================================

window.addEventListener("message", async (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (msg?.app !== GPD_APP_ID || msg?.action !== "gptkCommand") return

  const { command, requestId, args } = msg
  console.log("GPD: Received command", command, requestId)

  switch (command) {
    case "getAlbums":
      await getAlbums(requestId)
      break
    case "getAllMediaItems":
      await getAllMediaItems(requestId, args)
      break
    case "trashItems":
      await trashItems(requestId, args)
      break
    case "restoreItems":
      await restoreItems(requestId, args)
      break
    case "healthCheck":
      healthCheck(requestId)
      break
    default:
      postError(command, requestId, `Unknown command: ${command}`)
  }
})

console.log("GPD: Command handler loaded")
