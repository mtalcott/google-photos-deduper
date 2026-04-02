import { useEffect, useReducer, useCallback, useRef } from "react"
import { APP_ID } from "../lib/types"
import { detectDuplicates } from "../lib/duplicate-detector"
import type { DetectionProgress } from "../lib/duplicate-detector"
import type {
  AppMessage,
  GpdMediaItem,
  DuplicateGroup,
  ScanSettings,
  HealthCheckResultMessage,
  GptkResultMessage,
  GptkProgressMessage,
  ScanPhase,
} from "../lib/types"
import { DEFAULT_SETTINGS } from "../lib/types"
import { ScanConfig } from "../components/ScanConfig"
import { ScanProgress } from "../components/ScanProgress"
import { DuplicateGroups } from "../components/DuplicateGroups"
import { ActionBar } from "../components/ActionBar"

// ============================================================
// State management
// ============================================================

type AppState =
  | { status: "connecting" }
  | { status: "connected"; hasGptk: boolean }
  | { status: "disconnected"; error: string }
  | {
      status: "scanning"
      phase: ScanPhase
      itemsProcessed: number
      totalEstimate: number
      message: string
      requestId: string
    }
  | {
      status: "results"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
    }
  | {
      status: "trashing"
      trashedCount: number
      totalToTrash: number
    }

type AppAction =
  | { type: "HEALTH_CHECK_RESULT"; payload: HealthCheckResultMessage }
  | { type: "SCAN_STARTED"; requestId: string }
  | { type: "SCAN_PROGRESS"; payload: GptkProgressMessage }
  | { type: "SCAN_MEDIA_FETCHED"; mediaItems: GpdMediaItem[] }
  | {
      type: "SCAN_COMPLETE"
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
    }
  | { type: "SCAN_ERROR"; error: string }
  | { type: "TRASH_STARTED"; totalToTrash: number }
  | { type: "TRASH_COMPLETE"; trashedCount: number }
  | { type: "TRASH_ERROR"; error: string }
  | { type: "RESET" }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "HEALTH_CHECK_RESULT":
      if (action.payload.success) {
        return { status: "connected", hasGptk: action.payload.hasGptk }
      }
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
      }

    case "SCAN_PROGRESS":
      if (state.status !== "scanning") return state
      return {
        ...state,
        itemsProcessed: action.payload.itemsProcessed,
        message: action.payload.message || state.message,
      }

    case "SCAN_MEDIA_FETCHED":
      if (state.status !== "scanning") return state
      return {
        ...state,
        phase: "computing_embeddings",
        totalEstimate: action.mediaItems.length,
        message: `Fetched ${action.mediaItems.length} items. Computing embeddings...`,
      }

    case "SCAN_COMPLETE":
      return {
        status: "results",
        mediaItems: action.mediaItems,
        groups: action.groups,
        totalItems: Object.keys(action.mediaItems).length,
      }

    case "SCAN_ERROR":
      return { status: "disconnected", error: action.error }

    case "TRASH_STARTED":
      return { status: "trashing", trashedCount: 0, totalToTrash: action.totalToTrash }

    case "TRASH_COMPLETE":
      return state // Will be handled by parent to go back to results
    case "TRASH_ERROR":
      return { status: "disconnected", error: action.error }

    case "RESET":
      return { status: "connecting" }

    default:
      return state
  }
}

// ============================================================
// Helpers
// ============================================================

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sendToServiceWorker(message: AppMessage): void {
  chrome.runtime.sendMessage(message)
}

// ============================================================
// App component
// ============================================================

export default function App() {
  const [state, dispatch] = useReducer(appReducer, { status: "connecting" })
  const [settings, setSettings] = useReducer(
    (prev: ScanSettings, next: Partial<ScanSettings>) => ({ ...prev, ...next }),
    DEFAULT_SETTINGS
  )

  // Listen for messages from service worker
  useEffect(() => {
    const listener = (message: AppMessage) => {
      if (message?.app !== APP_ID) return

      switch (message.action) {
        case "healthCheck.result":
          dispatch({
            type: "HEALTH_CHECK_RESULT",
            payload: message as HealthCheckResultMessage,
          })
          break
        case "gptkResult": {
          const result = message as GptkResultMessage
          if (result.command === "getAllMediaItems") {
            if (result.success) {
              const items = result.data as GpdMediaItem[]
              dispatch({
                type: "SCAN_MEDIA_FETCHED",
                mediaItems: items,
              })
              // Run MediaPipe duplicate detection in the app tab
              runDuplicateDetection(items)
            } else {
              dispatch({ type: "SCAN_ERROR", error: result.error || "Scan failed" })
            }
          } else if (result.command === "trashItems") {
            if (result.success) {
              const data = result.data as { trashedCount: number }
              dispatch({ type: "TRASH_COMPLETE", trashedCount: data.trashedCount })
            } else {
              dispatch({ type: "TRASH_ERROR", error: result.error || "Trash failed" })
            }
          }
          break
        }
        case "gptkProgress":
          dispatch({
            type: "SCAN_PROGRESS",
            payload: message as GptkProgressMessage,
          })
          break
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // Keep a ref to settings so async callbacks see latest values
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Run MediaPipe duplicate detection on fetched media items
  const runDuplicateDetection = useCallback(async (items: GpdMediaItem[]) => {
    try {
      const groups = await detectDuplicates(
        items,
        settingsRef.current.similarityThreshold,
        (progress: DetectionProgress) => {
          dispatch({
            type: "SCAN_PROGRESS",
            payload: {
              app: APP_ID,
              action: "gptkProgress",
              requestId: "",
              itemsProcessed: progress.current,
              message: `${progress.phase}: ${progress.current}/${progress.total}`,
            },
          })
        }
      )

      const mediaItemMap: Record<string, GpdMediaItem> = {}
      for (const item of items) {
        mediaItemMap[item.mediaKey] = item
      }

      dispatch({
        type: "SCAN_COMPLETE",
        mediaItems: mediaItemMap,
        groups,
      })

      // Persist results
      chrome.storage.local.set({
        scanResults: {
          mediaItems: mediaItemMap,
          groups,
          scanDate: Date.now(),
          totalItems: items.length,
        },
      })
    } catch (error) {
      dispatch({
        type: "SCAN_ERROR",
        error: `Duplicate detection failed: ${error}`,
      })
    }
  }, [])

  // Health check on mount
  useEffect(() => {
    sendToServiceWorker({ app: APP_ID, action: "healthCheck" })
  }, [])

  // Load saved settings
  useEffect(() => {
    chrome.storage.local.get("settings", (result) => {
      if (result.settings) {
        setSettings(result.settings)
      }
    })
  }, [])

  // Save settings on change
  useEffect(() => {
    chrome.storage.local.set({ settings })
  }, [settings])

  const handleStartScan = useCallback(() => {
    const requestId = generateRequestId()
    dispatch({ type: "SCAN_STARTED", requestId })

    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "getAllMediaItems",
      requestId,
      args: {
        dateRange: settings.dateRange,
      },
    })
  }, [settings])

  const handleTrash = useCallback(
    (dedupKeys: string[]) => {
      const requestId = generateRequestId()
      dispatch({ type: "TRASH_STARTED", totalToTrash: dedupKeys.length })

      sendToServiceWorker({
        app: APP_ID,
        action: "gptkCommand",
        command: "trashItems",
        requestId,
        args: { dedupKeys },
      })
    },
    []
  )

  const handleRetry = useCallback(() => {
    dispatch({ type: "RESET" })
    sendToServiceWorker({ app: APP_ID, action: "healthCheck" })
  }, [])

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Google Photos Deduper</h1>
      </header>

      <main style={styles.main}>
        {state.status === "connecting" && (
          <div style={styles.center}>
            <p>Connecting to Google Photos...</p>
          </div>
        )}

        {state.status === "disconnected" && (
          <div style={styles.center}>
            <p style={styles.error}>{state.error}</p>
            <button style={styles.button} onClick={handleRetry}>
              Retry Connection
            </button>
          </div>
        )}

        {state.status === "connected" && (
          <ScanConfig
            settings={settings}
            onSettingsChange={setSettings}
            onStartScan={handleStartScan}
            hasGptk={state.hasGptk}
          />
        )}

        {state.status === "scanning" && (
          <ScanProgress
            phase={state.phase}
            itemsProcessed={state.itemsProcessed}
            totalEstimate={state.totalEstimate}
            message={state.message}
          />
        )}

        {state.status === "results" && (
          <>
            <ActionBar
              groups={state.groups}
              mediaItems={state.mediaItems}
              onTrash={handleTrash}
              totalItems={state.totalItems}
            />
            <DuplicateGroups
              groups={state.groups}
              mediaItems={state.mediaItems}
            />
          </>
        )}

        {state.status === "trashing" && (
          <div style={styles.center}>
            <p>
              Moving items to trash... {state.trashedCount}/{state.totalToTrash}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

// ============================================================
// Inline styles (will move to CSS later if needed)
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 24px",
  },
  header: {
    borderBottom: "1px solid #e0e0e0",
    paddingBottom: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    margin: "16px 0",
  },
  main: {
    minHeight: "60vh",
  },
  center: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    gap: 16,
  },
  error: {
    color: "#c62828",
  },
  button: {
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 500,
    backgroundColor: "#1a73e8",
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
}
