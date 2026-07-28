// Shared message types for communication between extension components.
// All messages include `app: "GPD"` to filter out unrelated messages.

export const APP_ID = "GPD" as const

// ============================================================
// Base message type
// ============================================================

interface BaseMessage {
  app: typeof APP_ID
  clientId?: string
}

// ============================================================
// Service worker <-> App tab messages
// ============================================================

export interface LaunchAppMessage extends BaseMessage {
  action: "launchApp"
}

export interface LaunchProviderMessage extends BaseMessage {
  action: "launchProvider"
  provider?: PhotoProvider
  hostTabId?: number
}

export interface LaunchProviderResult {
  success: boolean
  provider: PhotoProvider
  tabId?: number
  alreadyOpen?: boolean
  error?: string
}

export interface HealthCheckMessage extends BaseMessage {
  action: "healthCheck"
  provider?: PhotoProvider
}

export interface HealthCheckResultMessage extends BaseMessage {
  action: "healthCheck.result"
  success: boolean
  hasGptk: boolean
  provider?: PhotoProvider
  accountEmail?: string
  error?: string
}

// ============================================================
// Scan workflow messages
// ============================================================

export interface ScanLibraryMessage extends BaseMessage {
  action: "scanLibrary"
  options: ScanOptions
}

export type ScanMode = "smart" | "full"
export type PhotoProvider = "google" | "icloud" | "amazon"

export interface ScanOptions {
  similarityThreshold: number // 0.80 - 1.00
  scanMode: ScanMode
  dateRange?: {
    from?: string // ISO date string
    to?: string
  }
  albumScope?: ScanAlbumScope
}

export interface ScanProgressMessage extends BaseMessage {
  action: "scanLibrary.progress"
  phase: ScanPhase
  itemsProcessed: number
  totalEstimate: number
  message?: string
}

export type ScanPhase =
  | "fetching"
  | "downloading_thumbnails"
  | "computing_embeddings"
  | "detecting_duplicates"
  | "complete"

export interface ScanResultMessage extends BaseMessage {
  action: "scanLibrary.result"
  success: boolean
  error?: string
  mediaItems?: GpdMediaItem[]
  groups?: DuplicateGroup[]
}

export interface CancelScanMessage extends BaseMessage {
  action: "cancelScan"
}

// ============================================================
// Trash workflow messages
// ============================================================

export interface TrashItemsMessage extends BaseMessage {
  action: "trashItems"
  dedupKeys: string[]
}

export interface TrashItemsResultMessage extends BaseMessage {
  action: "trashItems.result"
  success: boolean
  trashedCount: number
  error?: string
}

// ============================================================
// GPTK command messages (service worker <-> GP tab via bridge)
// ============================================================

export interface GptkCommandMessage extends BaseMessage {
  action: "gptkCommand"
  command: string
  args?: unknown
  requestId: string
  provider?: PhotoProvider
}

export interface GptkResultMessage extends BaseMessage {
  action: "gptkResult"
  command: string
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

export interface GptkProgressMessage extends BaseMessage {
  action: "gptkProgress"
  requestId: string
  itemsProcessed: number
  message?: string
  /** Set by batch operations (e.g. "trashItems") so the app can route progress correctly. */
  command?: string
  data?: unknown
}

export interface GptkLogMessage extends BaseMessage {
  action: "gptkLog"
  level: "info" | "error" | "success"
  message: string
}

// ============================================================
// Union types
// ============================================================

export type AppMessage =
  | LaunchAppMessage
  | LaunchProviderMessage
  | HealthCheckMessage
  | HealthCheckResultMessage
  | ScanLibraryMessage
  | ScanProgressMessage
  | ScanResultMessage
  | CancelScanMessage
  | TrashItemsMessage
  | TrashItemsResultMessage
  | GptkCommandMessage
  | GptkResultMessage
  | GptkProgressMessage
  | GptkLogMessage

// ============================================================
// Data types
// ============================================================

/** Simplified media item for our UI (derived from GPTK's MediaItem) */
export interface GpdMediaItem {
  mediaKey: string
  dedupKey: string
  exactContentHash?: string
  thumb: string // thumbnail URL (append =w200-h200 for thumbnails; use bare for full-res)
  productUrl?: string // link to item in the provider's web app
  provider?: PhotoProvider
  sequenceIndex?: number // provider list order, used as a smart-scan neighbor hint
  timestamp: number // taken date
  creationTimestamp: number // upload date
  resWidth?: number
  resHeight?: number
  fileName?: string
  size?: number
  takesUpSpace?: boolean | null
  spaceTaken?: number
  isOwned?: boolean
  isFavorite?: boolean
  isOriginalQuality?: boolean | null
  duration?: number // video duration (undefined for photos)
  // iCloud only: the CPLAsset record ref needed to trash/recover via CloudKit
  // records/modify. changeTag is captured at scan time; if it goes stale before
  // trash (rare: the asset was edited elsewhere), the modify fails closed and
  // nothing is deleted.
  icloudAsset?: {
    recordName: string
    changeTag: string
    zoneName: string
    ownerRecordName: string
  }
}

export interface GpdAlbum {
  mediaKey: string
  title: string
  itemCount?: number
  isShared?: boolean
  thumb?: string
}

export interface DuplicateGroup {
  id: string
  mediaKeys: string[] // media keys of items in this group
  originalMediaKey: string // user-selected "keep" item
  similarity: number // average pairwise similarity in the group
  duplicateKind?: "exact" | "similar"
  matchReasons?: string[]
}

// ============================================================
// Stored state (chrome.storage.local)
// ============================================================

export interface StoredState {
  scanResults?: {
    mediaItems: Record<string, GpdMediaItem>
    groups: DuplicateGroup[]
    scanDate: number
    totalItems: number
    newestCreationTimestamp?: number // for incremental fetch on next scan
    mediaItemsAreComplete?: boolean
    accountEmail?: string
    sourceProvider?: PhotoProvider
    dateRange?: ScanSettings["dateRange"]
    albumScope?: ScanSettings["albumScope"]
  }
  selections?: {
    selectedGroupIds: string[]
    reviewedGroupIds: string[]
    keptOverrides: Record<string, string[]>
  }
  settings: ScanSettings
  scanCheckpoint?: import("./scan-checkpoint").ScanCheckpoint
}

export interface ScanSettings {
  sourceProvider?: PhotoProvider
  similarityThreshold: number
  scanMode: ScanMode
  /**
   * Smart-mode timestamp bucket window in seconds. Items with `taken` dates
   * within this window are compared against each other. Default is 1 second
   * (matches the legacy hardcoded value). Widen to catch re-saved videos /
   * photos whose EXIF timestamp was rewritten — at the cost of more pairs to
   * compare.
   */
  smartWindowSec?: number
  dateRange?: {
    from?: string
    to?: string
  }
  albumScope?: ScanAlbumScope
  amazonBatchLimit?: number
  icloudBatchLimit?: number
  exactOnly?: boolean
  protectFavorites?: boolean
}

export interface ScanAlbumScope {
  mediaKey: string
  title?: string
  itemCount?: number
  isShared?: boolean
}

export const DEFAULT_SETTINGS: ScanSettings = {
  sourceProvider: "google",
  similarityThreshold: 0.95,
  scanMode: "smart",
  smartWindowSec: 1
}
