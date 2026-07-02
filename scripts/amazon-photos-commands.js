// MAIN world command handler for Amazon Photos pages.

(() => {
  if (window.__GPD_AMAZON_COMMAND_HANDLER_LOADED__) {
    console.log("GPD: Amazon Photos command handler already loaded")
    return
  }
  window.__GPD_AMAZON_COMMAND_HANDLER_LOADED__ = true
// Uses Amazon Photos' private web API from the signed-in page context.

const GPD_APP_ID = "GPD"
const AMAZON_PAGE_LIMIT = 200
const AMAZON_TRASH_BATCH_SIZE = 50
const AMAZON_API_TIMEOUT_MS = 45000
const AMAZON_API_RETRY_COUNT = 2
const AMAZON_SEARCH_RETRY_COUNT = 6
const AMAZON_SEARCH_PAGE_PAUSE_MS = 1000
const AMAZON_RATE_LIMIT_BACKOFF_MS = [
  15000, 30000, 60000, 90000, 120000, 180000
]

function postResult(command, requestId, data) {
  window.postMessage(
    {
      app: GPD_APP_ID,
      action: "gptkResult",
      command,
      requestId,
      success: true,
      data
    },
    "*"
  )
}

function postError(command, requestId, error, data) {
  window.postMessage(
    {
      app: GPD_APP_ID,
      action: "gptkResult",
      command,
      requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      ...(data !== undefined ? { data } : {})
    },
    "*"
  )
}

function postProgress(requestId, itemsProcessed, message, command, data) {
  window.postMessage(
    {
      app: GPD_APP_ID,
      action: "gptkProgress",
      requestId,
      itemsProcessed,
      message,
      ...(command !== undefined ? { command } : {}),
      ...(data !== undefined ? { data } : {})
    },
    "*"
  )
}

function chunkArray(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function normalizeTrashBatchSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return AMAZON_TRASH_BATCH_SIZE
  return Math.min(Math.floor(parsed), AMAZON_TRASH_BATCH_SIZE)
}

function mediaKeysForDedupKeys(movedDedupKeys, dedupKeys, mediaKeysToTrash) {
  const byDedupKey = new Map()
  dedupKeys.forEach((dedupKey, index) => {
    if (!byDedupKey.has(dedupKey)) byDedupKey.set(dedupKey, [])
    byDedupKey.get(dedupKey).push(mediaKeysToTrash[index])
  })
  return movedDedupKeys.flatMap((dedupKey) => byDedupKey.get(dedupKey) || [])
}

function validateStringArray(command, requestId, field, value) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim())
  ) {
    postError(
      command,
      requestId,
      `Amazon Photos ${field} must be a non-empty string array.`
    )
    return null
  }
  return value
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class AmazonApiError extends Error {
  constructor(message, status, retryAfterMs) {
    super(message)
    this.name = "AmazonApiError"
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

function parseRetryAfterMs(value) {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, timestamp - Date.now())
}

function retryDelayMs(error, attempt) {
  if (error?.status === 429) {
    return (
      error.retryAfterMs ||
      AMAZON_RATE_LIMIT_BACKOFF_MS[
        Math.min(attempt, AMAZON_RATE_LIMIT_BACKOFF_MS.length - 1)
      ]
    )
  }
  return 1000 * (attempt + 1)
}

function retryLimitFor(error) {
  return error?.status === 429
    ? AMAZON_SEARCH_RETRY_COUNT
    : AMAZON_API_RETRY_COUNT
}

const AMAZON_PHOTOS_HOSTS = new Set([
  "www.amazon.com",
  "www.amazon.ca",
  "www.amazon.co.uk",
  "www.amazon.de",
  "www.amazon.fr",
  "www.amazon.it",
  "www.amazon.es",
  "www.amazon.co.jp",
  "www.amazon.com.au",
  "www.amazon.in",
  "www.amazon.com.br",
  "www.amazon.com.mx",
  "www.amazon.nl",
  "www.amazon.sg",
  "www.amazon.ae",
  "www.amazon.sa",
  "www.amazon.se",
  "www.amazon.pl",
  "www.amazon.com.tr",
  "www.amazon.be",
  "www.amazon.eg"
])

function isAmazonPhotosHost(hostname = location.hostname) {
  return AMAZON_PHOTOS_HOSTS.has(hostname)
}

function amazonOrigin() {
  return `${location.protocol}//${location.host}`
}

function amazonPhotosUrl(path) {
  return new URL(path, amazonOrigin()).toString()
}

function amazonThumbnailOrigin() {
  return `${location.protocol}//${location.host.replace(
    /^www\.amazon\./,
    "thumbnails-photos.amazon."
  )}`
}

function assertSupportedRoute() {
  const route = location.href.toLowerCase()
  if (
    !isAmazonPhotosHost() ||
    !route.includes("/photos") ||
    route.includes("/trash") ||
    route.includes("deleted")
  ) {
    throw new Error(
      "Open Amazon Photos on your Amazon country site, wait for the library to load, then scan again."
    )
  }
}

function parseCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`(?:^|; )${escaped}=([^;]*)`).exec(document.cookie)
  return match ? decodeURIComponent(match[1]) : ""
}

function amazonApiHeaders() {
  const sessionId = parseCookie("session-id")
  return {
    accept: "application/json, text/plain, */*",
    ...(sessionId ? { "x-amzn-sessionid": sessionId } : {})
  }
}

function amazonSearchUrl({ offset, limit, filters }) {
  const url = new URL("/drive/v1/search", amazonOrigin())
  url.searchParams.set("asset", "ALL")
  url.searchParams.set("tempLink", "false")
  url.searchParams.set("resourceVersion", "V2")
  url.searchParams.set("ContentType", "JSON")
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("offset", String(offset))
  url.searchParams.set("filters", filters)
  url.searchParams.set("lowResThumbnail", "true")
  url.searchParams.set("searchContext", "customer")
  url.searchParams.set("sort", "['createdDate DESC']")
  return url
}

async function fetchJsonWithTimeout(url, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AMAZON_API_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: amazonApiHeaders(),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new AmazonApiError(
        `${label} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`,
        response.status,
        parseRetryAfterMs(response.headers?.get?.("retry-after"))
      )
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function patchJsonWithTimeout(url, body, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AMAZON_API_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        ...amazonApiHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(
        `${label} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`
      )
    }
    const text = await response.text().catch(() => "")
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchAmazonSearchPage(requestId, offset, filters) {
  let lastError
  let maxAttempts = AMAZON_API_RETRY_COUNT
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const pageLabel =
      offset === 0
        ? "first Amazon Photos API page"
        : `Amazon Photos API page at offset ${offset.toLocaleString()}`
    postProgress(
      requestId,
      offset,
      attempt === 0
        ? `Fetching ${pageLabel}...`
        : `Retrying ${pageLabel} (${attempt}/${maxAttempts})...`
    )
    try {
      return await fetchJsonWithTimeout(
        amazonSearchUrl({
          offset,
          limit: AMAZON_PAGE_LIMIT,
          filters
        }),
        `Fetching ${pageLabel}`
      )
    } catch (error) {
      lastError = error
      maxAttempts = Math.max(maxAttempts, retryLimitFor(error))
      if (attempt >= maxAttempts) break
      const delayMs = retryDelayMs(error, attempt)
      if (error?.status === 429) {
        postProgress(
          requestId,
          offset,
          `Amazon rate limit hit at offset ${offset.toLocaleString()}; waiting ${Math.ceil(delayMs / 1000)}s before retry ${attempt + 1} of ${maxAttempts}.`
        )
      }
      await sleep(delayMs)
    }
  }
  throw lastError
}

function parseAmazonDate(value) {
  if (!value) return Date.now()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function amazonNodeCreationTimestamp(node) {
  const content = node?.contentProperties || {}
  return parseAmazonDate(
    firstString(node?.createdDate, node?.modifiedDate, content.createdDate)
  )
}

function normalizeSinceTimestamp(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

function isNewerThanSinceTimestamp(node, sinceTimestamp) {
  return (
    sinceTimestamp === null ||
    amazonNodeCreationTimestamp(node) > sinceTimestamp
  )
}

function pageReachedSinceTimestamp(page, sinceTimestamp) {
  if (sinceTimestamp === null) return false
  const data = Array.isArray(page.data) ? page.data : []
  return data.some((node) => !isNewerThanSinceTimestamp(node, sinceTimestamp))
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value
  }
  return ""
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return undefined
}

function normalizeVideoDurationMs(...values) {
  const duration = firstNumber(...values)
  if (!duration) return undefined
  return duration < 1000 ? Math.round(duration * 1000) : Math.round(duration)
}

function nestedValue(object, path) {
  let current = object
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined
    current = current[key]
  }
  return current
}

function nodeThumbnailUrl(node) {
  const ownerId = node.ownerId || node.createdBy || node.modifiedBy
  if (node.id && ownerId) {
    const url = new URL(
      `/v1/thumbnail/${encodeURIComponent(node.id)}`,
      amazonThumbnailOrigin()
    )
    url.searchParams.set("ownerId", ownerId)
    url.searchParams.set("viewBox", "600")
    return url.toString()
  }

  const assets = Array.isArray(node.assets) ? node.assets : []
  for (const asset of assets) {
    const candidate =
      asset?.url ||
      asset?.href ||
      asset?.link ||
      asset?.downloadUrl ||
      asset?.contentUrl
    if (typeof candidate === "string" && candidate) return candidate
  }
  return ""
}

function mapAmazonNode(node, index) {
  const id = firstString(node.id, node.nodeId, node.objectId)
  if (!id) return null

  const content = node.contentProperties || {}
  const image = node.image || node.img || {}
  const video = node.video || {}
  const contentType = firstString(content.contentType, node.contentType)
  const isVideo =
    /^video\//i.test(contentType) || Boolean(video.width || video.height)
  const width =
    Number(image.width) ||
    Number(video.width) ||
    Number(nestedValue(node, ["contentProperties", "image", "width"])) ||
    Number(nestedValue(node, ["contentProperties", "video", "width"])) ||
    undefined
  const height =
    Number(image.height) ||
    Number(video.height) ||
    Number(nestedValue(node, ["contentProperties", "image", "height"])) ||
    Number(nestedValue(node, ["contentProperties", "video", "height"])) ||
    undefined
  const duration = normalizeVideoDurationMs(
    video.duration,
    video.durationMillis,
    video.durationMs,
    content.duration,
    content.durationMillis,
    content.durationMs,
    nestedValue(node, ["contentProperties", "video", "duration"]),
    nestedValue(node, ["contentProperties", "video", "durationMillis"]),
    nestedValue(node, ["contentProperties", "video", "durationMs"])
  )
  const timestamp = parseAmazonDate(
    firstString(
      content.contentDate,
      image.dateTime,
      image.dateTimeOriginal,
      image.dateTimeDigitized,
      video.dateTime,
      node.createdDate,
      node.modifiedDate
    )
  )
  const creationTimestamp = parseAmazonDate(
    firstString(node.createdDate, node.modifiedDate, content.createdDate)
  )
  const mediaKey = `amazon-${id}`
  const thumb = nodeThumbnailUrl(node)
  if (!thumb) return null

  return {
    mediaKey,
    dedupKey: id,
    exactContentHash: content.md5 ? `amazon-md5-${content.md5}` : undefined,
    thumb,
    provider: "amazon",
    productUrl: amazonPhotosUrl(
      `/photos/all/gallery/${encodeURIComponent(id)}?sf=1`
    ),
    timestamp,
    creationTimestamp,
    resWidth: width,
    resHeight: height,
    fileName:
      firstString(node.name, content.name) || `Amazon Photo ${index + 1}`,
    size: Number(content.size) || undefined,
    takesUpSpace: null,
    isOriginalQuality: null,
    duration: isVideo ? duration : undefined
  }
}

function buildFilters() {
  return "type:(PHOTOS OR VIDEOS)"
}

async function getAllMediaItems(requestId, args) {
  try {
    assertSupportedRoute()
    const filters = buildFilters(args)
    const sinceTimestamp = normalizeSinceTimestamp(args?.sinceTimestamp)
    const firstPage = await fetchAmazonSearchPage(requestId, 0, filters)
    const totalCount = Number(firstPage.count) || 0
    const pages = [firstPage]
    const maxCount = Math.min(totalCount, Number(args?.limit) || totalCount)

    for (
      let offset = AMAZON_PAGE_LIMIT;
      offset < maxCount;
      offset += AMAZON_PAGE_LIMIT
    ) {
      if (pageReachedSinceTimestamp(pages[pages.length - 1], sinceTimestamp)) {
        postProgress(
          requestId,
          offset,
          `Reached cached Amazon Photos items from ${new Date(sinceTimestamp).toISOString()}`
        )
        break
      }
      await sleep(AMAZON_SEARCH_PAGE_PAUSE_MS)
      pages.push(await fetchAmazonSearchPage(requestId, offset, filters))
      const fetched = pages.reduce(
        (sum, page) => sum + (Array.isArray(page.data) ? page.data.length : 0),
        0
      )
      postProgress(
        requestId,
        fetched,
        `Fetched ${fetched.toLocaleString()} of ${totalCount.toLocaleString()} Amazon Photos items`
      )
    }

    const seen = new Set()
    const mediaItems = []
    const nodes = pages
      .flatMap((page) => (Array.isArray(page.data) ? page.data : []))
      .filter((node) => isNewerThanSinceTimestamp(node, sinceTimestamp))
      .slice(0, maxCount)
    for (const node of nodes) {
      const item = mapAmazonNode(node, mediaItems.length)
      if (!item || seen.has(item.mediaKey)) continue
      seen.add(item.mediaKey)
      mediaItems.push(item)
    }

    postProgress(
      requestId,
      mediaItems.length,
      `Fetched ${mediaItems.length.toLocaleString()} Amazon Photos items`
    )
    postResult("getAllMediaItems", requestId, mediaItems)
  } catch (error) {
    postError("getAllMediaItems", requestId, error)
  }
}

async function trashAmazonChunk(requestId, chunk, chunkIndex, chunkCount) {
  let lastError
  for (let attempt = 0; attempt <= AMAZON_API_RETRY_COUNT; attempt++) {
    postProgress(
      requestId,
      0,
      attempt === 0
        ? `Moving Amazon trash batch ${chunkIndex + 1} of ${chunkCount}...`
        : `Retrying Amazon trash batch ${chunkIndex + 1} of ${chunkCount} (${attempt}/${AMAZON_API_RETRY_COUNT})...`,
      "trashItems"
    )
    try {
      await patchJsonWithTimeout(
        amazonPhotosUrl("/drive/v1/trash"),
        {
          recurse: "true",
          op: "add",
          filters: "",
          conflictResolution: "RENAME",
          value: chunk,
          resourceVersion: "V2",
          ContentType: "JSON"
        },
        `Moving Amazon trash batch ${chunkIndex + 1}`
      )
      return chunk
    } catch (error) {
      lastError = error
      if (attempt >= AMAZON_API_RETRY_COUNT) break
      await sleep(1000 * (attempt + 1))
    }
  }
    throw lastError
  }

  async function restoreAmazonChunk(requestId, chunk, chunkIndex, chunkCount) {
    let lastError
    for (let attempt = 0; attempt <= AMAZON_API_RETRY_COUNT; attempt++) {
      postProgress(
        requestId,
        0,
        attempt === 0
          ? `Restoring Amazon batch ${chunkIndex + 1} of ${chunkCount}...`
          : `Retrying Amazon restore batch ${chunkIndex + 1} of ${chunkCount} (${attempt}/${AMAZON_API_RETRY_COUNT})...`,
        "restoreItems"
      )
      try {
        // Recover = same /drive/v1/trash endpoint as trash, with op:"remove".
        await patchJsonWithTimeout(
          amazonPhotosUrl("/drive/v1/trash"),
          {
            op: "remove",
            conflictResolution: "RENAME",
            value: chunk
          },
          `Restoring Amazon batch ${chunkIndex + 1}`
        )
        return chunk
      } catch (error) {
        lastError = error
        if (attempt >= AMAZON_API_RETRY_COUNT) break
        await sleep(1000 * (attempt + 1))
      }
    }
    throw lastError
  }

  async function trashItems(requestId, args) {
  const dedupKeys = validateStringArray(
    "trashItems",
    requestId,
    "dedupKeys",
    args?.dedupKeys
  )
  if (!dedupKeys) return
  const mediaKeysToTrash = validateStringArray(
    "trashItems",
    requestId,
    "mediaKeysToTrash",
    args?.mediaKeysToTrash
  )
  if (!mediaKeysToTrash) return
  if (mediaKeysToTrash.length !== dedupKeys.length) {
    postError(
      "trashItems",
      requestId,
      "Amazon Photos mediaKeysToTrash length must match dedupKeys length."
    )
    return
  }

  const movedDedupKeys = []
  try {
    assertSupportedRoute()
    const batchSize = normalizeTrashBatchSize(args?.batchSize)
    const chunks = chunkArray(dedupKeys, batchSize)
    for (let index = 0; index < chunks.length; index++) {
      const movedChunk = await trashAmazonChunk(
        requestId,
        chunks[index],
        index,
        chunks.length
      )
      movedDedupKeys.push(...movedChunk)
      postProgress(
        requestId,
        movedDedupKeys.length,
        `Moved ${movedDedupKeys.length} of ${dedupKeys.length} Amazon Photos items to trash`,
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
    }

    postResult("trashItems", requestId, {
      trashedCount: movedDedupKeys.length,
      trashedKeys: mediaKeysForDedupKeys(
        movedDedupKeys,
        dedupKeys,
        mediaKeysToTrash
      ),
      trashedDedupKeys: movedDedupKeys
    })
  } catch (error) {
    postError("trashItems", requestId, error, {
      partial: movedDedupKeys.length > 0,
      trashedCount: movedDedupKeys.length,
      trashedKeys: mediaKeysForDedupKeys(
        movedDedupKeys,
        dedupKeys,
        mediaKeysToTrash
      ),
      trashedDedupKeys: movedDedupKeys
    })
  }
}

async function restoreItems(requestId, args) {
  const dedupKeys = validateStringArray(
    "restoreItems",
    requestId,
    "dedupKeys",
    args?.dedupKeys
  )
  if (!dedupKeys) return

  const restoredDedupKeys = []
  try {
    assertSupportedRoute()
    const batchSize = normalizeTrashBatchSize(args?.batchSize)
    const chunks = chunkArray(dedupKeys, batchSize)
    for (let index = 0; index < chunks.length; index++) {
      const restoredChunk = await restoreAmazonChunk(
        requestId,
        chunks[index],
        index,
        chunks.length
      )
      restoredDedupKeys.push(...restoredChunk)
      postProgress(
        requestId,
        restoredDedupKeys.length,
        `Restored ${restoredDedupKeys.length} of ${dedupKeys.length} Amazon Photos items from trash`,
        "restoreItems",
        {
          restoredDedupKeys: restoredDedupKeys.slice()
        }
      )
    }

    postResult("restoreItems", requestId, {
      restoredCount: restoredDedupKeys.length,
      restoredDedupKeys
    })
  } catch (error) {
    postError("restoreItems", requestId, error, {
      partial: restoredDedupKeys.length > 0,
      restoredCount: restoredDedupKeys.length,
      restoredDedupKeys: restoredDedupKeys.slice()
    })
  }
}

function healthCheck(requestId) {
  const onAmazonPhotos =
    isAmazonPhotosHost() &&
    location.pathname.toLowerCase().includes("/photos")
  const pageText = document.body?.innerText || ""
  const hasSignInPrompt =
    /sign in/i.test(pageText) || /email or mobile phone number/i.test(pageText)
  postResult("healthCheck", requestId, {
    hasGptk: onAmazonPhotos && !hasSignInPrompt,
    accountEmail: ""
  })
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (msg?.app !== GPD_APP_ID || msg?.action !== "gptkCommand") return

  const { command, requestId, args } = msg
  switch (command) {
    case "getAllMediaItems":
      await getAllMediaItems(requestId, args)
      break
    case "listAlbums":
      postResult("listAlbums", requestId, [])
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
      postError(
        command,
        requestId,
        `Unsupported Amazon Photos command: ${command}`
      )
  }
})

console.log("GPD: Amazon Photos command handler loaded")

})();
