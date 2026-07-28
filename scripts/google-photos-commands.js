// MAIN world command handler for Google Photos pages.
// This script runs in the page's JS context (injected via <script> tag)
// and has access to GPTK globals: window.gptkApi, window.gptkCore, window.gptkApiUtils.
//
// Communication with the extension happens via window.postMessage.
// The bridge content script (google-photos-bridge.ts) relays these to chrome.runtime.

(() => {
  if (window.__GPD_GOOGLE_COMMAND_HANDLER_LOADED__) {
    console.log("GPD: Command handler already loaded")
    return
  }
  window.__GPD_GOOGLE_COMMAND_HANDLER_LOADED__ = true

const commandHost = window.__GPD_COMMAND_HOST__
if (!commandHost) {
  console.error("GPD: Shared command host is not loaded")
  return
}
const { postResult, postError, postProgress } = commandHost

// Number of items per API request for restore operations.
// Matches GPTK's default operationSize. Large single requests cause HTTP 504.
const RESTORE_BATCH_SIZE = 250

// Conservative default for destructive trash operations. The app can pass a
// smaller value, but never a larger one.
const TRASH_BATCH_SIZE = 25
const TRASH_RETRY_COUNT = 2
const TRASH_RETRY_BACKOFF_MS = 0
const TRASH_CHUNK_TIMEOUT_MS = 30_000
const MEDIA_PAGE_TIMEOUT_MS = 20_000
const MEDIA_PAGE_RETRY_COUNT = 2
const MEDIA_PAGE_RETRY_BACKOFF_MS = 1000

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function normalizeTrashBatchSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return TRASH_BATCH_SIZE
  return Math.min(Math.floor(parsed), TRASH_BATCH_SIZE)
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${Math.round(ms / 1000)}s. Google's API likely stalled — please retry.`
          )
        ),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasSuccessMarker(values) {
  return values.some((value) => {
    if (value === true || value === 1) return true
    if (typeof value !== "string") return false
    return /^(ok|success|successful|done|moved|trashed)$/i.test(value)
  })
}

function hasFailureMarker(values) {
  return values.some((value) => {
    if (value === false || value === 0) return true
    if (typeof value !== "string") return false
    return /^(error|failed|failure|denied|not_found|not-found)$/i.test(value)
  })
}

function collectTrashStatuses(node, keySet, statuses) {
  if (Array.isArray(node)) {
    const values = node.flatMap((value) =>
      isPlainObject(value) || Array.isArray(value) ? [] : [value]
    )
    const keys = values.filter((value) => keySet.has(value))
    if (keys.length > 0) {
      const success = hasSuccessMarker(values)
      const failure = hasFailureMarker(values)
      if (success || failure) {
        for (const key of keys) statuses.set(key, success && !failure)
      }
    }
    for (const child of node) collectTrashStatuses(child, keySet, statuses)
    return
  }

  if (!isPlainObject(node)) return

  const values = Object.values(node)
  const keys = values.filter((value) => keySet.has(value))
  if (keys.length > 0) {
    const success = hasSuccessMarker(values)
    const failure = hasFailureMarker(values)
    if (success || failure) {
      for (const key of keys) statuses.set(key, success && !failure)
    }
  }

  for (const field of [
    "movedDedupKeys",
    "trashedDedupKeys",
    "successfulDedupKeys",
    "succeededDedupKeys"
  ]) {
    if (Array.isArray(node[field])) {
      for (const key of node[field]) {
        if (keySet.has(key)) statuses.set(key, true)
      }
    }
  }
  for (const field of [
    "failedDedupKeys",
    "errorDedupKeys",
    "rejectedDedupKeys"
  ]) {
    if (Array.isArray(node[field])) {
      for (const key of node[field]) {
        if (keySet.has(key)) statuses.set(key, false)
      }
    }
  }

  for (const child of values) collectTrashStatuses(child, keySet, statuses)
}

function createPartialTrashError(message, movedDedupKeys) {
  const error = new Error(message)
  error.gpdMovedDedupKeys = movedDedupKeys
  return error
}

function analyzeTrashResponse(response, chunk) {
  if (chunk.length === 0) return []

  // GPTK historically returned undefined/empty status on success. Preserve that
  // compatibility path, but use structured status data whenever Google returns it.
  if (
    response === undefined ||
    response === null ||
    response === true ||
    (Array.isArray(response) && response.length === 0)
  ) {
    return chunk
  }
  if (response === false) {
    throw createPartialTrashError(
      "Google Photos reported trash batch failure",
      []
    )
  }

  const keySet = new Set(chunk)
  const statuses = new Map()
  collectTrashStatuses(response, keySet, statuses)

  // Some APIs return a bare list of successful keys. Treat that as explicit
  // evidence and fail closed if it does not cover the full requested chunk.
  if (
    statuses.size === 0 &&
    Array.isArray(response) &&
    response.every((value) => keySet.has(value))
  ) {
    for (const key of response) statuses.set(key, true)
  }

  if (statuses.size === 0) return chunk

  const movedDedupKeys = chunk.filter((key) => statuses.get(key) === true)
  if (movedDedupKeys.length !== chunk.length) {
    throw createPartialTrashError(
      `Google Photos reported ${movedDedupKeys.length} of ${chunk.length} items moved in a trash batch`,
      movedDedupKeys
    )
  }
  return movedDedupKeys
}

async function moveTrashChunkWithRetry(api, chunk, options) {
  let attempt = 0
  let lastError
  while (attempt <= options.retryCount) {
    try {
      const response = await withTimeout(
        api.moveItemsToTrash(chunk),
        options.chunkTimeoutMs,
        `Moving trash chunk of ${chunk.length} item${chunk.length !== 1 ? "s" : ""}`
      )
      return {
        attempts: attempt + 1,
        movedDedupKeys: analyzeTrashResponse(response, chunk)
      }
    } catch (error) {
      lastError = error
      if (error?.gpdMovedDedupKeys?.length > 0) break
      if (attempt >= options.retryCount) break
      const delay = options.retryBackoffMs * Math.pow(2, attempt)
      console.warn(
        `[GPD] trash chunk failed, retrying (${attempt + 1}/${options.retryCount}) after ${delay}ms:`,
        error
      )
      await sleep(delay)
      attempt++
    }
  }
  if (lastError && typeof lastError === "object") {
    lastError.gpdRetryAttempts = attempt
  }
  throw lastError
}

function mediaKeysForDedupKeys(movedDedupKeys, dedupKeys, mediaKeys) {
  const moved = new Set(movedDedupKeys)
  return dedupKeys
    .map((key, index) => (moved.has(key) ? mediaKeys[index] : null))
    .filter(Boolean)
}

function validateDedupKeys(command, requestId, args) {
  const dedupKeys = args?.dedupKeys
  if (!Array.isArray(dedupKeys) || dedupKeys.length === 0) {
    postError(command, requestId, "dedupKeys must be a non-empty array")
    return null
  }
  if (dedupKeys.some((key) => typeof key !== "string" || key.length === 0)) {
    postError(command, requestId, "dedupKeys must contain non-empty strings")
    return null
  }
  if (new Set(dedupKeys).size !== dedupKeys.length) {
    postError(command, requestId, "dedupKeys must not contain duplicates")
    return null
  }
  return dedupKeys
}

function validateMediaKeysToTrash(requestId, args, dedupKeys) {
  if (args?.mediaKeysToTrash === undefined) return dedupKeys

  const mediaKeysToTrash = args.mediaKeysToTrash
  if (
    !Array.isArray(mediaKeysToTrash) ||
    mediaKeysToTrash.length !== dedupKeys.length
  ) {
    postError(
      "trashItems",
      requestId,
      "mediaKeysToTrash must match dedupKeys length"
    )
    return null
  }
  if (
    mediaKeysToTrash.some(
      (key) => typeof key !== "string" || key.length === 0
    )
  ) {
    postError(
      "trashItems",
      requestId,
      "mediaKeysToTrash must contain non-empty strings"
    )
    return null
  }
  return mediaKeysToTrash
}

function parseDateRange(dateRange) {
  if (!dateRange) return null
  const fromMs = dateRange.from
    ? Date.parse(`${dateRange.from}T00:00:00.000Z`)
    : Number.NEGATIVE_INFINITY
  const toMs = dateRange.to
    ? Date.parse(`${dateRange.to}T23:59:59.999Z`)
    : Number.POSITIVE_INFINITY
  return {
    fromMs: Number.isFinite(fromMs) ? fromMs : Number.NEGATIVE_INFINITY,
    toMs: Number.isFinite(toMs) ? toMs : Number.POSITIVE_INFINITY
  }
}

function isInDateRange(item, range) {
  if (!range) return true
  if (!Number.isFinite(item.timestamp)) return false
  return item.timestamp >= range.fromMs && item.timestamp <= range.toMs
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
    fileName: item.fileName || item.descriptionShort || null,
    size: item.size,
    takesUpSpace: item.takesUpSpace ?? null,
    spaceTaken: item.spaceTaken,
    productUrl: "https://photos.google.com/photo/" + item.mediaKey
  }
}

function mapAlbum(album) {
  return {
    mediaKey: album.mediaKey,
    title: album.title || "(Untitled album)",
    itemCount: album.itemCount,
    isShared: !!album.isShared,
    thumb: album.thumb
  }
}

async function fetchAllAlbums(apiUtils) {
  const api = apiUtils?.api
  if (api?.getAlbums) {
    const albums = []
    let nextPageId = null
    do {
      const page = await api.getAlbums(nextPageId)
      if (page?.items?.length) albums.push(...page.items)
      nextPageId = page?.nextPageId || null
    } while (nextPageId)
    return albums
  }
  return await apiUtils.getAllAlbums()
}

async function fetchAllMediaInAlbum(apiUtils, albumMediaKey) {
  const api = apiUtils?.api
  if (api?.getAlbumPage) {
    const mediaItems = []
    let nextPageId = null
    do {
      const page = await api.getAlbumPage(albumMediaKey, nextPageId)
      if (page?.items?.length) mediaItems.push(...page.items)
      nextPageId = page?.nextPageId || null
    } while (nextPageId)
    return mediaItems
  }
  return await apiUtils.getAllMediaInAlbum(albumMediaKey)
}

async function listAlbums(requestId) {
  const apiUtils = window.gptkApiUtils
  if (!apiUtils?.getAllAlbums && !apiUtils?.api?.getAlbums) {
    postError(
      "listAlbums",
      requestId,
      "GPTK album API not available. Reload the Google Photos page."
    )
    return
  }

  try {
    const albums = await fetchAllAlbums(apiUtils)
    postResult("listAlbums", requestId, (albums || []).map(mapAlbum))
  } catch (error) {
    postError("listAlbums", requestId, error)
  }
}

// ============================================================
// Command: getAllMediaItems
// Fetches all media items from the library via GPTK pagination.
// ============================================================

async function getAllMediaItems(requestId, args) {
  const gptkApi = window.gptkApi
  const apiUtils = window.gptkApiUtils
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
  const dateRange = parseDateRange(args && args.dateRange)
  const albumScope = args && args.albumScope

  async function fetchUploadedDatePageWithRetry(nextPageId, scannedItems) {
    let lastError
    for (let attempt = 0; attempt <= MEDIA_PAGE_RETRY_COUNT; attempt++) {
      const pageLabel =
        scannedItems === 0
          ? "first Google Photos page"
          : `next Google Photos page after ${scannedItems} scanned item${scannedItems !== 1 ? "s" : ""}`
      postProgress(
        requestId,
        scannedItems,
        attempt === 0
          ? `Fetching ${pageLabel}...`
          : `Retrying ${pageLabel} (${attempt}/${MEDIA_PAGE_RETRY_COUNT})...`
      )
      try {
        return await withTimeout(
          gptkApi.getItemsByUploadedDate(nextPageId),
          MEDIA_PAGE_TIMEOUT_MS,
          `Fetching ${pageLabel}`
        )
      } catch (error) {
        lastError = error
        if (attempt >= MEDIA_PAGE_RETRY_COUNT) break
        await sleep(MEDIA_PAGE_RETRY_BACKOFF_MS * (attempt + 1))
      }
    }
    throw lastError
  }

  try {
    if (albumScope?.mediaKey) {
      if (!apiUtils?.getAllMediaInAlbum && !apiUtils?.api?.getAlbumPage) {
        postError(
          "getAllMediaItems",
          requestId,
          "GPTK album media API not available. Reload the Google Photos page."
        )
        return
      }

      const albumItems = await withTimeout(
        fetchAllMediaInAlbum(apiUtils, albumScope.mediaKey),
        MEDIA_PAGE_TIMEOUT_MS,
        `Fetching album "${albumScope.title || albumScope.mediaKey}"`
      )
      const mediaItems = (albumItems || [])
        .filter((item) => isInDateRange(item, dateRange))
        .map(mapMediaItem)
      postProgress(
        requestId,
        (albumItems || []).length,
        dateRange
          ? `Scanned ${(albumItems || []).length} album items, matched ${mediaItems.length}`
          : `Fetched ${mediaItems.length} album items`
      )
      postResult("getAllMediaItems", requestId, mediaItems)
      return
    }

    let nextPageId = null
    const mediaItems = []
    let scannedItems = 0
    let reachedCache = false

    do {
      const page = await fetchUploadedDatePageWithRetry(
        nextPageId,
        scannedItems
      )
      if (!page) {
        console.warn("GPD: Empty page response, stopping pagination")
        break
      }
      if (page.items && page.items.length > 0) {
        scannedItems += page.items.length
        for (const item of page.items) {
          // Items are sorted newest-first — stop when we hit the cached watermark
          if (
            sinceTimestamp !== null &&
            item.creationTimestamp <= sinceTimestamp
          ) {
            reachedCache = true
            break
          }
          if (!isInDateRange(item, dateRange)) continue
          mediaItems.push(mapMediaItem(item))
        }
      }
      nextPageId = page.nextPageId || null

      postProgress(
        requestId,
        dateRange ? scannedItems : mediaItems.length,
        dateRange
          ? `Scanned ${scannedItems} items, matched ${mediaItems.length}`
          : `Fetched ${mediaItems.length} items`
      )

      if (reachedCache) break
    } while (nextPageId)

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

  const dedupKeys = validateDedupKeys("trashItems", requestId, args)
  if (!dedupKeys) return
  const mediaKeysToTrash = validateMediaKeysToTrash(
    requestId,
    args,
    dedupKeys
  )
  if (!mediaKeysToTrash) return
  const total = dedupKeys.length
  const movedDedupKeys = []
  let retryAttempts = 0

  try {
    const batchSize = normalizeTrashBatchSize(args.batchSize)
    const batchPauseMs = Math.max(0, Number(args.batchPauseMs) || 0)
    const retryCount = normalizeNonNegativeInteger(
      args.retryCount,
      TRASH_RETRY_COUNT
    )
    const retryBackoffMs = normalizeNonNegativeInteger(
      args.retryBackoffMs,
      TRASH_RETRY_BACKOFF_MS
    )
    const chunkTimeoutMs = normalizePositiveInteger(
      args.chunkTimeoutMs,
      TRASH_CHUNK_TIMEOUT_MS
    )
    const chunks = chunkArray(dedupKeys, batchSize)
    console.log(
      `[GPD] trash: ${total} items, ${chunks.length} chunk(s) of ${batchSize}, retries=${retryCount}, timeout=${chunkTimeoutMs}ms`
    )

    // Chunk conservatively. This is slower than GPTK's default batch size, but
    // safer for real libraries because each API failure affects fewer items.
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const result = await moveTrashChunkWithRetry(api, chunk, {
        retryCount,
        retryBackoffMs,
        chunkTimeoutMs
      })
      retryAttempts += result.attempts - 1
      movedDedupKeys.push(...result.movedDedupKeys)
      console.log(
        `[GPD] trash chunk ${i + 1}/${chunks.length}: ${movedDedupKeys.length}/${total} done`
      )
      postProgress(
        requestId,
        movedDedupKeys.length,
        `Moved ${movedDedupKeys.length} of ${total} items to trash`,
        "trashItems",
        {
          trashedKeys: mediaKeysForDedupKeys(
            movedDedupKeys,
            dedupKeys,
            mediaKeysToTrash
          ),
          trashedDedupKeys: movedDedupKeys.slice()
        }
      )
      if (i < chunks.length - 1) await sleep(batchPauseMs)
    }

    console.log(`[GPD] trash complete: ${total} items moved`)
    postResult("trashItems", requestId, {
      trashedCount: movedDedupKeys.length,
      trashedKeys: mediaKeysForDedupKeys(
        movedDedupKeys,
        dedupKeys,
        mediaKeysToTrash
      ),
      trashedDedupKeys: movedDedupKeys,
      retryAttempts
    })
  } catch (error) {
    retryAttempts += Number(error?.gpdRetryAttempts) || 0
    const confirmedMovedDedupKeys = [
      ...movedDedupKeys,
      ...((error && error.gpdMovedDedupKeys) || [])
    ]
    console.error("[GPD] trash error:", error)
    postError("trashItems", requestId, error, {
      partial: confirmedMovedDedupKeys.length > 0,
      trashedCount: confirmedMovedDedupKeys.length,
      trashedKeys: mediaKeysForDedupKeys(
        confirmedMovedDedupKeys,
        dedupKeys,
        mediaKeysToTrash
      ),
      trashedDedupKeys: confirmedMovedDedupKeys,
      retryAttempts
    })
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
    const dedupKeys = validateDedupKeys("restoreItems", requestId, args)
    if (!dedupKeys) return
    const total = dedupKeys.length
    const chunks = chunkArray(dedupKeys, RESTORE_BATCH_SIZE)
    console.log(
      `[GPD] restore: ${total} items, ${chunks.length} chunk(s) of ${RESTORE_BATCH_SIZE}`
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

commandHost.register({
  handlers: {
    getAllMediaItems,
    listAlbums,
    trashItems,
    restoreItems,
    healthCheck
  },
  unsupportedMessage: (command) => `Unknown command: ${command}`
})

console.log("GPD: Command handler loaded")
})();
