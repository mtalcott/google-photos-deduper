// Shared message types for communication between extension components.
// All messages include `app: "GPD"` to filter out unrelated messages.

export const APP_ID = "GPD" as const;

// ============================================================
// Base message type
// ============================================================

interface BaseMessage {
  app: typeof APP_ID;
}

// ============================================================
// Service worker <-> App tab messages
// ============================================================

export interface LaunchAppMessage extends BaseMessage {
  action: "launchApp";
}

export interface HealthCheckMessage extends BaseMessage {
  action: "healthCheck";
}

export interface HealthCheckResultMessage extends BaseMessage {
  action: "healthCheck.result";
  success: boolean;
  hasGptk: boolean;
  accountEmail?: string;
}

// ============================================================
// Scan workflow messages
// ============================================================

export interface ScanLibraryMessage extends BaseMessage {
  action: "scanLibrary";
  options: ScanOptions;
}

export type ScanMode = "smart" | "full"

export interface ScanOptions {
  similarityThreshold: number; // 0.90 - 1.00
  scanMode: ScanMode;
  dateRange?: {
    from?: string; // ISO date string
    to?: string;
  };
}

export interface ScanProgressMessage extends BaseMessage {
  action: "scanLibrary.progress";
  phase: ScanPhase;
  itemsProcessed: number;
  totalEstimate: number;
  message?: string;
}

export type ScanPhase =
  | "fetching"
  | "downloading_thumbnails"
  | "computing_embeddings"
  | "detecting_duplicates"
  | "complete";

export interface ScanResultMessage extends BaseMessage {
  action: "scanLibrary.result";
  success: boolean;
  error?: string;
  mediaItems?: GpdMediaItem[];
  groups?: DuplicateGroup[];
}

export interface CancelScanMessage extends BaseMessage {
  action: "cancelScan";
}

// ============================================================
// Trash workflow messages
// ============================================================

export interface TrashItemsMessage extends BaseMessage {
  action: "trashItems";
  dedupKeys: string[];
}

export interface TrashItemsResultMessage extends BaseMessage {
  action: "trashItems.result";
  success: boolean;
  trashedCount: number;
  error?: string;
}

// ============================================================
// GPTK command messages (service worker <-> GP tab via bridge)
// ============================================================

export interface GptkCommandMessage extends BaseMessage {
  action: "gptkCommand";
  command: string;
  args?: unknown;
  requestId: string;
}

export interface GptkResultMessage extends BaseMessage {
  action: "gptkResult";
  command: string;
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface GptkProgressMessage extends BaseMessage {
  action: "gptkProgress";
  requestId: string;
  itemsProcessed: number;
  message?: string;
  /** Set by batch operations (e.g. "trashItems") so the app can route progress correctly. */
  command?: string;
}

export interface GptkLogMessage extends BaseMessage {
  action: "gptkLog";
  level: "info" | "error" | "success";
  message: string;
}

// ============================================================
// Union types
// ============================================================

export type AppMessage =
  | LaunchAppMessage
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
  | GptkLogMessage;

// ============================================================
// Data types
// ============================================================

/** Simplified media item for our UI (derived from GPTK's MediaItem) */
export interface GpdMediaItem {
  mediaKey: string;
  dedupKey: string;
  thumb: string; // thumbnail URL (append =w200-h200 for thumbnails; use bare for full-res)
  productUrl?: string; // link to item in Google Photos web app
  timestamp: number; // taken date
  creationTimestamp: number; // upload date
  resWidth?: number;
  resHeight?: number;
  fileName?: string;
  size?: number;
  isOwned?: boolean;
  duration?: number; // video duration (undefined for photos)
}

export interface DuplicateGroup {
  id: string;
  mediaKeys: string[]; // media keys of items in this group
  originalMediaKey: string; // user-selected "keep" item
  similarity: number; // average pairwise similarity in the group
}

// ============================================================
// Stored state (chrome.storage.local)
// ============================================================

export interface StoredState {
  scanResults?: {
    mediaItems: Record<string, GpdMediaItem>;
    groups: DuplicateGroup[];
    scanDate: number;
    totalItems: number;
    newestCreationTimestamp?: number; // for incremental fetch on next scan
  };
  selections?: {
    selectedGroupIds: string[];
    keptOverrides: Record<string, string[]>;
  };
  settings: ScanSettings;
}

export interface ScanSettings {
  similarityThreshold: number;
  scanMode: ScanMode;
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export const DEFAULT_SETTINGS: ScanSettings = {
  similarityThreshold: 0.99,
  scanMode: "smart",
};
