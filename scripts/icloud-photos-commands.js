// MAIN world command handler for iCloud Photos pages.

(() => {
  if (window.__GPD_ICLOUD_COMMAND_HANDLER_LOADED__) {
    console.log("GPD: iCloud command handler already loaded")
    return
  }
  window.__GPD_ICLOUD_COMMAND_HANDLER_LOADED__ = true

const commandHost = window.__GPD_COMMAND_HOST__
if (!commandHost) {
  console.error("GPD: Shared command host is not loaded")
  return
}
const { postResult, postError, postProgress } = commandHost

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function bestImageSource(image) {
  const current = image.currentSrc || image.src
  if (current) return current
  const srcset = image.getAttribute("srcset")
  if (!srcset) return ""
  return (
    srcset
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .pop() || ""
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ICLOUD_PAGE_SIZE = 100
const ICLOUD_API_TIMEOUT_MS = 30000
const ICLOUD_LIST_RECORD_TYPE =
  "CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted"
const ICLOUD_DESIRED_KEYS = [
  "recordName",
  "recordType",
  "recordChangeTag",
  "masterRef",
  "assetDate",
  "addedDate",
  "itemType",
  "filenameEnc",
  "resJPEGThumbWidth",
  "resJPEGThumbHeight",
  "resJPEGThumbFingerprint",
  "resJPEGThumbRes",
  "resJPEGMedWidth",
  "resJPEGMedHeight",
  "resJPEGMedFingerprint",
  "resJPEGMedRes",
  "resOriginalWidth",
  "resOriginalHeight",
  "resOriginalFingerprint",
  "resOriginalRes",
  "resVidSmallWidth",
  "resVidSmallHeight",
  "resVidSmallFingerprint",
  "resVidSmallRes",
  "resVidMedWidth",
  "resVidMedHeight",
  "resVidMedFingerprint",
  "resVidMedRes",
  "duration",
  "vidComplDurValue",
  "vidComplDurScale"
]

function cloudKitQueryUrl() {
  const entries = performance.getEntriesByType("resource")
  for (let index = entries.length - 1; index >= 0; index--) {
    const url = entries[index]?.name || ""
    if (/ckdatabasews\.icloud\.com\/database\/.+\/records\/query\?/.test(url)) {
      return url
    }
  }
  return ""
}

function cloudKitBatchUrl(queryUrl) {
  return queryUrl.replace("/records/query?", "/internal/records/query/batch?")
}

function cloudKitModifyUrl(queryUrl) {
  return queryUrl.replace("/records/query?", "/records/modify?")
}

const ICLOUD_MODIFY_BATCH_SIZE = 50

function chunkArray(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function cloudKitErrorMessage(entity) {
  return (
    entity?.errorMessage ||
    entity?.reason ||
    entity?.serverErrorCode ||
    entity?.error?.errorMessage ||
    "iCloud rejected the request. The photo may have changed since scan — rescan and retry."
  )
}

// CloudKit records/modify returns one entry per operation. With atomic:true the
// whole batch is transactional: any per-record failure rejects the entire batch
// (nothing is deleted). On success each entry carries the updated recordChangeTag
// and zoneID, which we capture so a subsequent recover can reuse a fresh tag.
function evaluateModifyResponse(data) {
  if (data && (data.serverErrorCode || data.error)) {
    return { success: false, error: cloudKitErrorMessage(data) }
  }
  const records = Array.isArray(data?.records) ? data.records : []
  const failed = records.find(
    (record) => record && (record.serverErrorCode || record.error || record.reason)
  )
  if (failed) {
    return { success: false, error: cloudKitErrorMessage(failed) }
  }
  const refsByRecordName = {}
  for (const record of records) {
    if (!record?.recordName) continue
    const zone = record.zoneID || {}
    refsByRecordName[record.recordName] = {
      recordName: record.recordName,
      changeTag: record.recordChangeTag || "",
      zoneName: zone.zoneName || "",
      ownerRecordName: zone.ownerRecordName || ""
    }
  }
  return { success: true, refsByRecordName }
}

function mergeUpdatedAssetRef(originalRef, updatedRef) {
  if (!updatedRef) return originalRef
  return {
    recordName: updatedRef.recordName || originalRef.recordName,
    changeTag: updatedRef.changeTag || originalRef.changeTag,
    zoneName: updatedRef.zoneName || originalRef.zoneName || "PrimarySync",
    ownerRecordName: updatedRef.ownerRecordName || originalRef.ownerRecordName
  }
}

async function postCloudKitModify(queryUrl, operations, zoneId, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ICLOUD_API_TIMEOUT_MS)
  try {
    const response = await fetch(cloudKitModifyUrl(queryUrl), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({
        atomic: true,
        operations,
        zoneID: zoneId
      }),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(
        `${label} failed with HTTP ${response.status}${
          text ? `: ${text.slice(0, 240)}` : ""
        }`
      )
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function fieldValue(record, name) {
  return record?.fields?.[name]?.value
}

function decodeBase64Text(value) {
  if (typeof value !== "string" || !value) return ""
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ""
  }
}

function resourceUrl(resource, fallbackFileName = "public.jpeg") {
  const template = resource?.downloadURL
  if (typeof template !== "string" || !template) return ""
  return template.replace("${f}", encodeURIComponent(fallbackFileName))
}

function resourceSize(resource) {
  const size = Number(resource?.size)
  return Number.isFinite(size) && size > 0 ? size : undefined
}

function normalizeDurationMs(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) {
      return number < 1000 ? Math.round(number * 1000) : Math.round(number)
    }
  }
  return undefined
}

function isInDateRange(item, dateRange) {
  const from = dateRange?.from
    ? Date.parse(`${dateRange.from}T00:00:00.000Z`)
    : Number.NEGATIVE_INFINITY
  const to = dateRange?.to
    ? Date.parse(`${dateRange.to}T23:59:59.999Z`)
    : Number.POSITIVE_INFINITY
  return item.timestamp >= from && item.timestamp <= to
}

function iCloudQueryBody(offset) {
  return {
    query: {
      filterBy: [
        {
          fieldName: "startRank",
          fieldValue: { type: "INT64", value: offset },
          comparator: "EQUALS"
        },
        {
          fieldName: "direction",
          fieldValue: { type: "STRING", value: "ASCENDING" },
          comparator: "EQUALS"
        }
      ],
      recordType: ICLOUD_LIST_RECORD_TYPE
    },
    resultsLimit: ICLOUD_PAGE_SIZE * 2,
    desiredKeys: ICLOUD_DESIRED_KEYS,
    zoneID: { zoneName: "PrimarySync" }
  }
}

async function fetchCloudKitPage(requestId, queryUrl, offset) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ICLOUD_API_TIMEOUT_MS)
  postProgress(
    requestId,
    offset,
    offset === 0
      ? "Fetching first iCloud Photos API page..."
      : `Fetching iCloud Photos API page at offset ${offset.toLocaleString()}...`
  )
  try {
    const response = await fetch(queryUrl, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(iCloudQueryBody(offset)),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(
        `iCloud Photos API page at offset ${offset.toLocaleString()} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`
      )
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchCloudKitItemCount(queryUrl) {
  const batchUrl = cloudKitBatchUrl(queryUrl)
  if (batchUrl === queryUrl) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ICLOUD_API_TIMEOUT_MS)
  try {
    const response = await fetch(batchUrl, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({
        batch: [
          {
            resultsLimit: 1,
            query: {
              filterBy: {
                fieldName: "indexCountID",
                fieldValue: {
                  type: "STRING_LIST",
                  value: ["CPLAssetByAssetDateWithoutHiddenOrDeleted"]
                },
                comparator: "IN"
              },
              recordType: "HyperionIndexCountLookup"
            },
            zoneWide: true,
            zoneID: { zoneName: "PrimarySync" }
          }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return null
    const json = await response.json()
    const count = Number(json?.batch?.[0]?.records?.[0]?.fields?.itemCount?.value)
    return Number.isFinite(count) && count > 0 ? count : null
  } finally {
    clearTimeout(timeout)
  }
}

function mapCloudKitItem(master, asset, index) {
  const itemType =
    fieldValue(master, "itemType") || fieldValue(asset, "itemType") || ""
  const isVideo =
    /^public\.(mpeg-4|movie|video|quicktime)/i.test(itemType) ||
    Boolean(
      fieldValue(master, "resVidMedRes") || fieldValue(asset, "resVidMedRes")
    )
  const thumbResource =
    fieldValue(master, "resJPEGThumbRes") ||
    fieldValue(asset, "resJPEGThumbRes") ||
    fieldValue(master, "resVidSmallRes") ||
    fieldValue(asset, "resVidSmallRes") ||
    fieldValue(master, "resJPEGMedRes") ||
    fieldValue(asset, "resJPEGMedRes") ||
    fieldValue(master, "resVidMedRes") ||
    fieldValue(asset, "resVidMedRes") ||
    fieldValue(master, "resOriginalRes") ||
    fieldValue(asset, "resOriginalRes")
  const originalResource =
    fieldValue(master, "resOriginalRes") ||
    fieldValue(master, "resVidMedRes") ||
    fieldValue(asset, "resVidMedRes") ||
    fieldValue(master, "resJPEGMedRes") ||
    fieldValue(asset, "resJPEGMedRes")
  const width =
    Number(fieldValue(master, "resOriginalWidth")) ||
    Number(fieldValue(master, "resVidMedWidth")) ||
    Number(fieldValue(master, "resJPEGMedWidth")) ||
    Number(fieldValue(asset, "resVidMedWidth")) ||
    Number(fieldValue(asset, "resJPEGMedWidth")) ||
    undefined
  const height =
    Number(fieldValue(master, "resOriginalHeight")) ||
    Number(fieldValue(master, "resVidMedHeight")) ||
    Number(fieldValue(master, "resJPEGMedHeight")) ||
    Number(fieldValue(asset, "resVidMedHeight")) ||
    Number(fieldValue(asset, "resJPEGMedHeight")) ||
    undefined
  const timestamp =
    Number(fieldValue(asset, "assetDate")) ||
    Number(fieldValue(asset, "addedDate")) ||
    Number(asset.created?.timestamp) ||
    Number(master.created?.timestamp) ||
    Date.now()
  const creationTimestamp =
    Number(fieldValue(asset, "addedDate")) ||
    Number(asset.created?.timestamp) ||
    Number(master.created?.timestamp) ||
    timestamp
  const thumb = resourceUrl(thumbResource, "public.jpeg")
  if (!thumb) return null
  const exactContentHash =
    fieldValue(master, "resOriginalFingerprint") ||
    originalResource?.fileChecksum ||
    fieldValue(master, "resJPEGMedFingerprint") ||
    fieldValue(asset, "resJPEGMedFingerprint")
  const duration = normalizeDurationMs(
    fieldValue(asset, "duration"),
    fieldValue(master, "duration"),
    fieldValue(asset, "vidComplDurValue"),
    fieldValue(master, "vidComplDurValue")
  )
  const assetRecordName = asset.recordName || master.recordName
  const recordName = master.recordName || assetRecordName
  const mediaKey = `icloud-${recordName}`
  const productUrl = assetRecordName
    ? `${location.origin}/photos/#/i,pz,${encodeURIComponent(assetRecordName)}/`
    : window.location.href
  // CPLAsset ref captured at scan time so trash/recover can issue a CloudKit
  // records/modify (operationType "update", isDeleted 1/0). Requires the asset
  // recordName + a changeTag + the record's zoneID.
  const assetZone = asset.zoneID || master.zoneID || {}
  const assetChangeTag = asset.recordChangeTag || master.recordChangeTag || ""
  const icloudAsset =
    assetRecordName && assetChangeTag
      ? {
          recordName: assetRecordName,
          changeTag: assetChangeTag,
          zoneName: assetZone.zoneName || "PrimarySync",
          ownerRecordName: assetZone.ownerRecordName || ""
        }
      : undefined
  return {
    mediaKey,
    dedupKey: recordName,
    exactContentHash: exactContentHash
      ? `icloud-fingerprint-${exactContentHash}`
      : undefined,
    thumb,
    provider: "icloud",
    productUrl,
    sequenceIndex: index,
    timestamp,
    creationTimestamp,
    resWidth: width,
    resHeight: height,
    fileName:
      decodeBase64Text(fieldValue(master, "filenameEnc")) ||
      decodeBase64Text(fieldValue(asset, "filenameEnc")) ||
      `iCloud Photo ${index + 1}`,
    size: resourceSize(originalResource),
    takesUpSpace: null,
    isOriginalQuality: null,
    duration: isVideo ? duration : undefined,
    ...(icloudAsset ? { icloudAsset } : {})
  }
}

function mapCloudKitRecords(records, offset = 0) {
  const assetsByMaster = new Map()
  const assetsWithoutMaster = []
  const masters = []
  for (const record of records) {
    if (record?.recordType === "CPLAsset") {
      const masterName = fieldValue(record, "masterRef")?.recordName
      if (masterName) assetsByMaster.set(masterName, record)
      else assetsWithoutMaster.push(record)
    } else if (record?.recordType === "CPLMaster") {
      masters.push(record)
    }
  }

  const mapped = []
  const mappedMasterNames = new Set()
  for (const master of masters) {
    const asset = assetsByMaster.get(master.recordName)
    if (!asset) continue
    mappedMasterNames.add(master.recordName)
    const item = mapCloudKitItem(master, asset, offset + mapped.length)
    if (item) mapped.push(item)
  }
  for (const [masterName, asset] of assetsByMaster) {
    if (mappedMasterNames.has(masterName)) continue
    const item = mapCloudKitItem(asset, asset, offset + mapped.length)
    if (item) mapped.push(item)
  }
  for (const asset of assetsWithoutMaster) {
    const item = mapCloudKitItem(asset, asset, offset + mapped.length)
    if (item) mapped.push(item)
  }
  return mapped
}

async function getCloudKitMediaItems(requestId, args) {
  const queryUrl = cloudKitQueryUrl()
  if (!queryUrl) return null

  const limit =
    typeof args?.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.floor(args.limit))
      : Number.POSITIVE_INFINITY
  const mediaItems = []
  const seen = new Set()
  let offset = 0
  const totalCount = await fetchCloudKitItemCount(queryUrl).catch(() => null)
  const targetCount = totalCount === null ? limit : Math.min(totalCount, limit)
  let emptyPages = 0

  while (mediaItems.length < limit && offset < targetCount) {
    const page = await fetchCloudKitPage(requestId, queryUrl, offset)
    const records = Array.isArray(page.records) ? page.records : []
    const mapped = mapCloudKitRecords(records, offset)
    if (mapped.length === 0) {
      emptyPages++
      if (emptyPages >= 3 || totalCount === null) break
      offset += ICLOUD_PAGE_SIZE
      continue
    }
    emptyPages = 0
    for (const item of mapped) {
      if (seen.has(item.mediaKey)) continue
      seen.add(item.mediaKey)
      if (isInDateRange(item, args?.dateRange)) mediaItems.push(item)
      if (mediaItems.length >= limit) break
    }
    offset += ICLOUD_PAGE_SIZE
    postProgress(
      requestId,
      mediaItems.length,
      totalCount
        ? `Fetched ${mediaItems.length.toLocaleString()} of ${targetCount.toLocaleString()} iCloud Photos items`
        : `Fetched ${mediaItems.length.toLocaleString()} iCloud Photos items`
    )
    if (totalCount === null && records.length < ICLOUD_PAGE_SIZE * 2) break
    await sleep(250)
  }

  return mediaItems
}

function allElements(root = document) {
  const result = []
  const visit = (node) => {
    if (!node) return
    if (node.nodeType === Node.ELEMENT_NODE) {
      result.push(node)
      if (node.shadowRoot) visit(node.shadowRoot)
      if (node.tagName === "IFRAME") {
        try {
          if (node.contentDocument?.documentElement) {
            visit(node.contentDocument.documentElement)
          }
        } catch {
          // Cross-origin iframes are not inspectable; same-origin iCloud app
          // frames are traversed so the photo grid can be scanned.
        }
      }
    }
    const children = node.children || []
    for (const child of children) visit(child)
  }
  visit(root.documentElement || root)
  return result
}

function cssUrl(value) {
  const match = /url\((['"]?)(.*?)\1\)/.exec(value || "")
  return match?.[2] || ""
}

function mediaCandidates() {
  const elements = allElements()
  const candidates = []
  for (const element of elements) {
    if (element.tagName === "IMG") {
      const source = bestImageSource(element)
      if (source) {
        candidates.push({
          element,
          source,
          width: element.naturalWidth || element.width,
          height: element.naturalHeight || element.height
        })
      }
      continue
    }

    const style =
      element.ownerDocument?.defaultView?.getComputedStyle(element) ??
      getComputedStyle(element)
    const source = cssUrl(style.backgroundImage)
    if (!source) continue
    const rect = element.getBoundingClientRect()
    candidates.push({
      element,
      source,
      width: rect.width,
      height: rect.height
    })
  }

  return candidates.filter((candidate) => {
    if (!candidate.source) return false
    if (/^data:image\/svg/i.test(candidate.source)) return false
    return candidate.width >= 40 && candidate.height >= 40
  })
}

async function waitForMediaCandidates(requestId) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidates = mediaCandidates()
    if (candidates.length > 0) return candidates
    postProgress(
      requestId,
      0,
      attempt === 0
        ? "Waiting for iCloud Photos thumbnails..."
        : "Still waiting for loaded iCloud Photos thumbnails..."
    )
    await sleep(500)
  }
  return mediaCandidates()
}

function nearbyLabel(element) {
  const labelledBy = element.getAttribute("aria-labelledby")
  if (labelledBy) {
    const label = document.getElementById(labelledBy)
    if (label?.textContent?.trim()) return label.textContent.trim()
  }
  const direct =
    element.getAttribute("aria-label") ||
    element.getAttribute("alt") ||
    element.getAttribute("title")
  if (direct) return direct.trim()
  const parentText = element
    .closest("[aria-label], [title]")
    ?.getAttribute("aria-label")
  return parentText?.trim() || ""
}

function parseTimestamp(label) {
  const parsed = Date.parse(label)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function assertSupportedRoute() {
  const route = location.href.toLowerCase()
  if (route.includes("recentlydeleted")) {
    throw new Error(
      "iCloud scan is disabled while Recently Deleted is open. Open iCloud Photos Library or Recents, then scan again."
    )
  }
  if (route.includes("/hidden") || route.includes("#/hidden")) {
    throw new Error(
      "iCloud scan is disabled while Hidden is open. Open iCloud Photos Library or Recents, then scan again."
    )
  }
}

function isTopIcloudShellWithAppFrame() {
  return (
    window.top === window &&
    Array.from(document.querySelectorAll("iframe")).some((frame) =>
      frame.src.includes("/applications/photos")
    )
  )
}

async function blobUrlToDataUrl(url, element = document.documentElement) {
  if (!url.startsWith("blob:")) return url
  const ownerWindow = element.ownerDocument?.defaultView ?? window
  try {
    const response = await ownerWindow.fetch(url)
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new ownerWindow.FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error || new Error("Read failed"))
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    if (element.tagName !== "IMG") throw error
    const canvas = element.ownerDocument.createElement("canvas")
    canvas.width = element.naturalWidth || Math.round(element.width)
    canvas.height = element.naturalHeight || Math.round(element.height)
    const context = canvas.getContext("2d")
    if (!context || canvas.width <= 0 || canvas.height <= 0) throw error
    context.drawImage(element, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.85)
  }
}

async function mapCandidate(candidate, index) {
  const { element, source } = candidate
  if (!source) return null
  const label = nearbyLabel(element)
  const stable = `${source}|${label}|${index}`
  const mediaKey = `icloud-${hashString(stable)}`
  let thumb = source
  try {
    thumb = await blobUrlToDataUrl(source, element)
  } catch {
    thumb = source
  }

  return {
    mediaKey,
    dedupKey: mediaKey,
    thumb,
    provider: "icloud",
    productUrl: window.location.href,
    timestamp: parseTimestamp(label),
    creationTimestamp: Date.now(),
    resWidth: Math.round(candidate.width) || undefined,
    resHeight: Math.round(candidate.height) || undefined,
    fileName: label || `iCloud Photo ${index + 1}`,
    takesUpSpace: null,
    isOriginalQuality: null
  }
}

async function getAllMediaItems(requestId, args) {
  try {
    assertSupportedRoute()
    if (isTopIcloudShellWithAppFrame()) return
    const cloudKitItems = await getCloudKitMediaItems(requestId, args)
    if (cloudKitItems) {
      postProgress(
        requestId,
        cloudKitItems.length,
        `Fetched ${cloudKitItems.length.toLocaleString()} iCloud Photos API items`
      )
      postResult("getAllMediaItems", requestId, cloudKitItems)
      return
    }

    const candidates = await waitForMediaCandidates(requestId)
    const seen = new Set()
    const mediaItems = []
    for (let index = 0; index < candidates.length; index++) {
      const item = await mapCandidate(candidates[index], index)
      if (!item || seen.has(item.thumb)) continue
      seen.add(item.thumb)
      mediaItems.push(item)
      if (index % 25 === 0) {
        postProgress(
          requestId,
          mediaItems.length,
          `Collected ${mediaItems.length} loaded iCloud photos`
        )
      }
    }

    const from = args?.dateRange?.from
      ? Date.parse(`${args.dateRange.from}T00:00:00.000Z`)
      : Number.NEGATIVE_INFINITY
    const to = args?.dateRange?.to
      ? Date.parse(`${args.dateRange.to}T23:59:59.999Z`)
      : Number.POSITIVE_INFINITY
    const filtered = mediaItems.filter(
      (item) => item.timestamp >= from && item.timestamp <= to
    )
    postProgress(
      requestId,
      filtered.length,
      `Fetched ${filtered.length} loaded iCloud photos`
    )
    postResult("getAllMediaItems", requestId, filtered)
  } catch (error) {
    postError("getAllMediaItems", requestId, error)
  }
}

async function trashItems(requestId, args) {
  const dedupKeys = Array.isArray(args?.dedupKeys) ? args.dedupKeys : []
  const mediaKeysToTrash = Array.isArray(args?.mediaKeysToTrash)
    ? args.mediaKeysToTrash
    : []
  if (dedupKeys.length === 0 || mediaKeysToTrash.length === 0) {
    postError(
      "trashItems",
      requestId,
      "iCloud trash requires selected duplicate media keys."
    )
    return
  }

  // Explicit dry-run (test mode): report without deleting anything.
  if (args?.dryRun) {
    postProgress(
      requestId,
      mediaKeysToTrash.length,
      `Dry-run checked ${mediaKeysToTrash.length} iCloud item${
        mediaKeysToTrash.length === 1 ? "" : "s"
      }. Nothing was deleted.`
    )
    postResult("trashItems", requestId, {
      dryRun: true,
      trashedCount: 0,
      requestedCount: mediaKeysToTrash.length,
      trashedKeys: [],
      trashedDedupKeys: [],
      message: "iCloud delete dry-run completed. Nothing was deleted."
    })
    return
  }

  // Real path: CloudKit records/modify on each CPLAsset (isDeleted: 1).
  // Requires per-item asset refs (recordName + changeTag + zone) captured at
  // scan time. If any are missing/stale we fail closed — nothing is deleted.
  const refs = Array.isArray(args?.icloudAssetRefs) ? args.icloudAssetRefs : []
  if (refs.length !== dedupKeys.length) {
    postError(
      "trashItems",
      requestId,
      "iCloud trash metadata is missing or stale. Rescan to refresh item metadata, then retry."
    )
    return
  }
  const targets = dedupKeys.map((dedupKey, index) => ({
    dedupKey,
    mediaKey: mediaKeysToTrash[index],
    ref: refs[index]
  }))
  for (const target of targets) {
    const ref = target.ref
    if (!ref || !ref.recordName || !ref.changeTag || !ref.ownerRecordName) {
      postError(
        "trashItems",
        requestId,
        `iCloud item ${target.dedupKey} is missing trash metadata (record name, change tag, or zone). Rescan to refresh, then retry.`
      )
      return
    }
  }

  const queryUrl = cloudKitQueryUrl()
  if (!queryUrl) {
    postError(
      "trashItems",
      requestId,
      "Cannot reach the iCloud Photos metadata service. Open iCloud Photos, wait for the library to load, and retry."
    )
    return
  }

  const zoneId = {
    zoneName: targets[0].ref.zoneName || "PrimarySync",
    ownerRecordName: targets[0].ref.ownerRecordName
  }
  const trashedDedupKeys = []
  const trashedKeys = []
  // Post-trash refs (with fresh changeTags from the modify response) so a
  // subsequent recover can reuse them instead of needing a re-scan.
  const postTrashRefs = []

  try {
    const chunks = chunkArray(targets, ICLOUD_MODIFY_BATCH_SIZE)
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      postProgress(
        requestId,
        trashedDedupKeys.length,
        `Moving iCloud batch ${index + 1} of ${chunks.length}...`,
        "trashItems"
      )
      const operations = chunk.map((target) => ({
        operationType: "update",
        record: {
          recordName: target.ref.recordName,
          recordChangeTag: target.ref.changeTag,
          recordType: "CPLAsset",
          fields: { isDeleted: { value: 1 } }
        }
      }))
      const data = await postCloudKitModify(
        queryUrl,
        operations,
        zoneId,
        `Moving iCloud batch ${index + 1}`
      )
      const outcome = evaluateModifyResponse(data)
      if (!outcome.success) {
        throw new Error(outcome.error)
      }
      for (const target of chunk) {
        const updated = mergeUpdatedAssetRef(
          target.ref,
          outcome.refsByRecordName[target.ref.recordName]
        )
        trashedDedupKeys.push(target.dedupKey)
        trashedKeys.push(target.mediaKey)
        postTrashRefs.push(updated)
      }
      postProgress(
        requestId,
        trashedDedupKeys.length,
        `Moved ${trashedDedupKeys.length} of ${dedupKeys.length} iCloud items to trash`,
        "trashItems",
        {
          trashedKeys: trashedKeys.slice(),
          trashedDedupKeys: trashedDedupKeys.slice()
        }
      )
    }

    postResult("trashItems", requestId, {
      trashedCount: trashedDedupKeys.length,
      trashedKeys,
      trashedDedupKeys,
      icloudAssetRefs: postTrashRefs
    })
  } catch (error) {
    postError("trashItems", requestId, error, {
      partial: trashedDedupKeys.length > 0,
      trashedCount: trashedDedupKeys.length,
      trashedKeys: trashedKeys.slice(),
      trashedDedupKeys: trashedDedupKeys.slice(),
      icloudAssetRefs: postTrashRefs.slice()
    })
  }
}

// Recover = same records/modify with isDeleted: 0, reusing the post-trash asset
// refs returned by trashItems (changeTags are fresh as of the trash operation).
async function restoreItems(requestId, args) {
  const dedupKeys = Array.isArray(args?.dedupKeys) ? args.dedupKeys : []
  if (dedupKeys.length === 0) {
    postError("restoreItems", requestId, "iCloud restore requires dedupKeys.")
    return
  }
  const refs = Array.isArray(args?.icloudAssetRefs) ? args.icloudAssetRefs : []
  if (refs.length !== dedupKeys.length) {
    postError(
      "restoreItems",
      requestId,
      "iCloud restore metadata is missing. Recover the items manually from Recently Deleted in iCloud Photos."
    )
    return
  }
  for (let index = 0; index < refs.length; index++) {
    const ref = refs[index]
    if (!ref || !ref.recordName || !ref.changeTag || !ref.ownerRecordName) {
      postError(
        "restoreItems",
        requestId,
        `iCloud restore metadata for ${dedupKeys[index]} is missing. Recover the item manually from Recently Deleted in iCloud Photos.`
      )
      return
    }
  }

  const queryUrl = cloudKitQueryUrl()
  if (!queryUrl) {
    postError(
      "restoreItems",
      requestId,
      "Cannot reach the iCloud Photos metadata service. Open iCloud Photos, wait for the library to load, and retry. Items can also be recovered from Recently Deleted."
    )
    return
  }

  const zoneId = {
    zoneName: refs[0].zoneName || "PrimarySync",
    ownerRecordName: refs[0].ownerRecordName
  }
  const restoredDedupKeys = []
  try {
    const chunks = chunkArray(refs, ICLOUD_MODIFY_BATCH_SIZE)
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      postProgress(
        requestId,
        restoredDedupKeys.length,
        `Restoring iCloud batch ${index + 1} of ${chunks.length}...`,
        "restoreItems"
      )
      const operations = chunk.map((ref) => ({
        operationType: "update",
        record: {
          recordName: ref.recordName,
          recordChangeTag: ref.changeTag,
          recordType: "CPLAsset",
          fields: { isDeleted: { value: 0 } }
        }
      }))
      const data = await postCloudKitModify(
        queryUrl,
        operations,
        zoneId,
        `Restoring iCloud batch ${index + 1}`
      )
      const outcome = evaluateModifyResponse(data)
      if (!outcome.success) {
        throw new Error(outcome.error)
      }
      restoredDedupKeys.push(
        ...dedupKeys.slice(
          index * ICLOUD_MODIFY_BATCH_SIZE,
          index * ICLOUD_MODIFY_BATCH_SIZE + chunk.length
        )
      )
      postProgress(
        requestId,
        restoredDedupKeys.length,
        `Restored ${restoredDedupKeys.length} of ${dedupKeys.length} iCloud items from trash`,
        "restoreItems"
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
  const onIcloudPhotos =
    ["www.icloud.com", "www.icloud.com.cn"].includes(location.hostname) &&
    (location.pathname.startsWith("/photos") ||
      location.pathname.includes("/applications/photos"))
  const pageText = document.body?.innerText || ""
  const hasPublicSignInPrompt = Array.from(
    document.querySelectorAll("button, a")
  ).some((element) => /sign in/i.test(element.textContent || ""))
  const isPublicLandingPage =
    /Easily view and share your photos and videos stored in iCloud/i.test(
      pageText
    )
  postResult("healthCheck", requestId, {
    hasGptk: onIcloudPhotos && !hasPublicSignInPrompt && !isPublicLandingPage,
    accountEmail: ""
  })
}

commandHost.register({
  handlers: {
    getAllMediaItems,
    listAlbums: (requestId) => postResult("listAlbums", requestId, []),
    trashItems,
    restoreItems,
    healthCheck
  },
  unsupportedMessage: (command) => `Unsupported iCloud command: ${command}`
})

console.log("GPD: iCloud command handler loaded")

})();
