// App state machine for Google Photos Deduper.
// Extracted from tabs/app.tsx so it can be unit-tested independently.

import type {
  GpdMediaItem,
  DuplicateGroup,
  HealthCheckResultMessage,
  GptkProgressMessage,
  ScanPhase,
} from "./types"

// ============================================================
// Types
// ============================================================

export type AppState =
  | { status: "connecting" }
  | { status: "connected"; hasGptk: boolean; accountEmail?: string }
  | { status: "disconnected"; error: string }
  | {
      status: "scanning"
      phase: ScanPhase
      itemsProcessed: number
      totalEstimate: number
      message: string
      requestId: string
      hasGptk: boolean
      accountEmail?: string
    }
  | {
      status: "results"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
      accountEmail?: string
    }
  | {
      status: "trashing"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
      totalToTrash: number
      accountEmail?: string
    }

export type AppAction =
  | { type: "HEALTH_CHECK_RESULT"; payload: HealthCheckResultMessage }
  | { type: "SCAN_STARTED"; requestId: string; hasGptk: boolean; accountEmail?: string }
  | { type: "SCAN_PROGRESS"; payload: GptkProgressMessage; phase?: ScanPhase }
  | { type: "SCAN_MEDIA_FETCHED"; mediaItems: GpdMediaItem[] }
  | {
      type: "SCAN_COMPLETE"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
    }
  | { type: "SCAN_ERROR"; error: string }
  | { type: "SCAN_CANCELLED" }
  | {
      type: "TRASH_STARTED"
      totalToTrash: number
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
    }
  | { type: "TRASH_COMPLETE"; trashedKeys: string[] }
  | { type: "TRASH_ERROR"; error: string }
  | {
      type: "LOAD_SAVED_RESULTS"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
    }
  | {
      type: "RESTORE_SNAPSHOT"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
    }
  | { type: "GP_TAB_CLOSED" }
  | { type: "RESET" }

// ============================================================
// Reducer
// ============================================================

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "HEALTH_CHECK_RESULT":
      if (action.payload.success) {
        // Don't downgrade from results — just confirm GP is still available
        if (state.status === "results") {
          const email = action.payload.accountEmail ?? state.accountEmail
          if (email === state.accountEmail) return state
          return { ...state, accountEmail: email }
        }
        return { status: "connected", hasGptk: action.payload.hasGptk, accountEmail: action.payload.accountEmail }
      }
      // Don't disconnect if already showing results — user can still view them
      // and GP tab will be required again only when they start a new scan/trash
      if (state.status === "results") return state
      return {
        status: "disconnected",
        error:
          "Cannot connect to Google Photos. Please open photos.google.com in another tab.",
      }

    case "SCAN_STARTED":
      return {
        status: "scanning",
        phase: "fetching",
        itemsProcessed: 0,
        totalEstimate: 0,
        message: "Starting scan...",
        requestId: action.requestId,
        hasGptk: action.hasGptk,
        accountEmail: action.accountEmail,
      }

    case "SCAN_PROGRESS":
      if (state.status !== "scanning") return state
      return {
        ...state,
        ...(action.phase !== undefined ? { phase: action.phase } : {}),
        itemsProcessed: action.payload.itemsProcessed,
        message: action.payload.message || state.message,
      }

    case "SCAN_MEDIA_FETCHED":
      if (state.status !== "scanning") return state
      return {
        ...state,
        phase: "downloading_thumbnails",
        itemsProcessed: 0,
        totalEstimate: action.mediaItems.length,
        message: `Fetched ${action.mediaItems.length} items. Downloading thumbnails...`,
      }

    case "SCAN_COMPLETE":
      return {
        status: "results",
        mediaItems: action.mediaItems,
        groups: action.groups,
        totalItems: Object.keys(action.mediaItems).length,
        accountEmail: "accountEmail" in state ? state.accountEmail : undefined,
      }

    case "SCAN_ERROR":
      return { status: "disconnected", error: action.error }

    case "SCAN_CANCELLED":
      if (state.status !== "scanning") return state
      return { status: "connected", hasGptk: state.hasGptk, accountEmail: state.accountEmail }

    case "TRASH_STARTED":
      return {
        status: "trashing",
        mediaItems: action.mediaItems,
        groups: action.groups,
        totalItems: action.totalItems,
        totalToTrash: action.totalToTrash,
        accountEmail: "accountEmail" in state ? state.accountEmail : undefined,
      }

    case "TRASH_COMPLETE": {
      if (state.status !== "trashing") return state
      const trashedSet = new Set(action.trashedKeys)
      const newGroups = state.groups
        .map((g) => ({
          ...g,
          mediaKeys: g.mediaKeys.filter((k) => !trashedSet.has(k)),
        }))
        .filter((g) => g.mediaKeys.length >= 2)

      const newMediaItems = { ...state.mediaItems }
      for (const key of action.trashedKeys) {
        delete newMediaItems[key]
      }

      return {
        status: "results",
        mediaItems: newMediaItems,
        groups: newGroups,
        totalItems: state.totalItems,
        accountEmail: state.accountEmail,
      }
    }

    case "TRASH_ERROR":
      return { status: "disconnected", error: action.error }

    case "LOAD_SAVED_RESULTS":
      return {
        status: "results",
        mediaItems: action.mediaItems,
        groups: action.groups,
        totalItems: action.totalItems,
      }

    case "RESTORE_SNAPSHOT":
      return {
        status: "results",
        mediaItems: action.mediaItems,
        groups: action.groups,
        totalItems: action.totalItems,
        accountEmail: "accountEmail" in state ? state.accountEmail : undefined,
      }

    case "GP_TAB_CLOSED":
      return {
        status: "disconnected",
        error: "Google Photos tab was closed. Please reopen photos.google.com and retry.",
      }

    case "RESET":
      return { status: "connecting" }

    default:
      return state
  }
}
