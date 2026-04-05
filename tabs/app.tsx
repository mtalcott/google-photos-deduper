import { useEffect, useReducer, useCallback, useRef, useState } from "react"
import Alert from "@mui/material/Alert"
import AppBar from "@mui/material/AppBar"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import CssBaseline from "@mui/material/CssBaseline"
import IconButton from "@mui/material/IconButton"
import Snackbar from "@mui/material/Snackbar"
import Toolbar from "@mui/material/Toolbar"
import Typography from "@mui/material/Typography"
import CloseIcon from "@mui/icons-material/Close"
import { ThemeProvider } from "@mui/material/styles"
import theme from "../lib/theme"
import { APP_ID } from "../lib/types"
import { detectDuplicates } from "../lib/duplicate-detector"
import type { DetectionProgress } from "../lib/duplicate-detector"
import { appReducer } from "../lib/app-reducer"
import type { AppState, AppAction } from "../lib/app-reducer"
import type {
  AppMessage,
  GpdMediaItem,
  DuplicateGroup,
  ScanSettings,
  HealthCheckResultMessage,
  GptkResultMessage,
  GptkProgressMessage,
  StoredState,
} from "../lib/types"
import { DEFAULT_SETTINGS } from "../lib/types"
import { ScanConfig } from "../components/ScanConfig"
import { ScanProgress } from "../components/ScanProgress"
import { DuplicateGroups } from "../components/DuplicateGroups"
import { ActionBar } from "../components/ActionBar"

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

  // Selection state: which groups are selected for trash
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set()
  )

  // Original overrides: groupId -> mediaKey the user marked as "original"
  const [originalOverrides, setOriginalOverrides] = useState<
    Record<string, string>
  >({})

  // Undo trash state: stored after a successful trash operation
  const [undoData, setUndoData] = useState<{
    dedupKeys: string[]
    count: number
    snapshot: {
      mediaItems: Record<string, GpdMediaItem>
      groups: DuplicateGroup[]
      totalItems: number
    }
  } | null>(null)

  // Refs to capture pre-trash data for undo
  const preTrashSnapshotRef = useRef<{
    mediaItems: Record<string, GpdMediaItem>
    groups: DuplicateGroup[]
    totalItems: number
  } | null>(null)
  const pendingDedupKeysRef = useRef<string[] | null>(null)

  // Sync selectedGroupIds when groups change (e.g. after scan or trash)
  const groups =
    state.status === "results" || state.status === "trashing"
      ? state.groups
      : []
  useEffect(() => {
    setSelectedGroupIds(new Set(groups.map((g) => g.id)))
    setOriginalOverrides({})
  }, [groups])

  const getOriginal = useCallback(
    (group: DuplicateGroup) =>
      originalOverrides[group.id] || group.originalMediaKey,
    [originalOverrides]
  )

  const handleSetOriginal = useCallback(
    (groupId: string, mediaKey: string) => {
      setOriginalOverrides((prev) => ({ ...prev, [groupId]: mediaKey }))
    },
    []
  )

  const handleToggleGroup = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedGroupIds(new Set(groups.map((g) => g.id)))
  }, [groups])

  const handleDeselectAll = useCallback(() => {
    setSelectedGroupIds(new Set())
  }, [])

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
              runDuplicateDetection(items)
            } else {
              dispatch({
                type: "SCAN_ERROR",
                error: result.error || "Scan failed",
              })
            }
          } else if (result.command === "trashItems") {
            if (result.success) {
              const data = result.data as { trashedKeys: string[] }
              const trashedKeys = data.trashedKeys || []
              dispatch({ type: "TRASH_COMPLETE", trashedKeys })
              // Set undo data from the snapshot captured before trash
              if (preTrashSnapshotRef.current && pendingDedupKeysRef.current) {
                setUndoData({
                  dedupKeys: pendingDedupKeysRef.current,
                  count: pendingDedupKeysRef.current.length,
                  snapshot: preTrashSnapshotRef.current,
                })
                preTrashSnapshotRef.current = null
                pendingDedupKeysRef.current = null
              }
            } else {
              dispatch({
                type: "TRASH_ERROR",
                error: result.error || "Trash failed",
              })
            }
          } else if (result.command === "restoreItems") {
            if (!result.success) {
              // Optimistic restore already happened in UI; show a non-blocking alert
              console.error("GPD: Restore failed:", result.error)
            }
          }
          break
        }
        case "gptkLog":
          if ((message as { level?: string }).level === "error") {
            dispatch({ type: "GP_TAB_CLOSED" })
          }
          break
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
  const runDuplicateDetection = useCallback(
    async (items: GpdMediaItem[]) => {
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
      } catch (error) {
        dispatch({
          type: "SCAN_ERROR",
          error: `Duplicate detection failed: ${error}`,
        })
      }
    },
    []
  )

  // Health check on mount
  useEffect(() => {
    sendToServiceWorker({ app: APP_ID, action: "healthCheck" })
  }, [])

  // Load saved settings and results on mount
  useEffect(() => {
    chrome.storage.local.get(
      ["settings", "scanResults"],
      (result: Partial<StoredState>) => {
        if (result.settings) {
          setSettings(result.settings)
        }
        if (result.scanResults?.groups?.length) {
          dispatch({
            type: "LOAD_SAVED_RESULTS",
            mediaItems: result.scanResults.mediaItems,
            groups: result.scanResults.groups,
            totalItems: result.scanResults.totalItems,
          })
        }
      }
    )
  }, [])

  // Persist scan results when they change (after scan or trash)
  const mediaItems = state.status === "results" ? state.mediaItems : null
  const totalItems = state.status === "results" ? state.totalItems : 0
  useEffect(() => {
    if (groups.length > 0 && mediaItems) {
      chrome.storage.local.set({
        scanResults: {
          mediaItems,
          groups,
          scanDate: Date.now(),
          totalItems,
        },
      })
    }
  }, [groups, mediaItems, totalItems])

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

  const handleTrash = useCallback(() => {
    if (state.status !== "results") return

    const dedupKeys: string[] = []
    const mediaKeysToTrash: string[] = []
    for (const group of state.groups) {
      if (!selectedGroupIds.has(group.id)) continue
      const original = getOriginal(group)
      for (const key of group.mediaKeys) {
        if (key === original) continue
        const item = state.mediaItems[key]
        if (item?.dedupKey) {
          dedupKeys.push(item.dedupKey)
          mediaKeysToTrash.push(key)
        }
      }
    }

    if (dedupKeys.length === 0) return

    if (!confirm(`Move ${dedupKeys.length} duplicate${dedupKeys.length !== 1 ? "s" : ""} to trash? This can be undone from the Google Photos trash.`)) {
      return
    }

    const requestId = generateRequestId()

    // Capture snapshot for undo
    preTrashSnapshotRef.current = {
      mediaItems: state.mediaItems,
      groups: state.groups,
      totalItems: state.totalItems,
    }
    pendingDedupKeysRef.current = dedupKeys

    dispatch({
      type: "TRASH_STARTED",
      totalToTrash: dedupKeys.length,
      mediaItems: state.mediaItems,
      groups: state.groups,
      totalItems: state.totalItems,
    })

    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "trashItems",
      requestId,
      args: { dedupKeys, mediaKeysToTrash },
    })
  }, [state, selectedGroupIds, getOriginal])

  const handleRetry = useCallback(() => {
    dispatch({ type: "RESET" })
    sendToServiceWorker({ app: APP_ID, action: "healthCheck" })
  }, [])

  const handleUndo = useCallback(() => {
    if (!undoData) return
    // Optimistically restore the UI to the pre-trash state
    dispatch({
      type: "RESTORE_SNAPSHOT",
      mediaItems: undoData.snapshot.mediaItems,
      groups: undoData.snapshot.groups,
      totalItems: undoData.snapshot.totalItems,
    })
    // Call GPTK to restore from trash
    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "restoreItems",
      requestId: generateRequestId(),
      args: { dedupKeys: undoData.dedupKeys },
    })
    setUndoData(null)
  }, [undoData])

  const handleUndoClose = useCallback(() => {
    setUndoData(null)
  }, [])

  // Compute duplicate count for ActionBar
  const duplicateCount =
    state.status === "results"
      ? groups.reduce((sum, group) => {
          if (!selectedGroupIds.has(group.id)) return sum
          const original = getOriginal(group)
          return (
            sum + group.mediaKeys.filter((k) => k !== original).length
          )
        }, 0)
      : 0

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Sticky header */}
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" fontWeight={600}>
            Google Photos Deduper
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main content */}
      <Box
        component="main"
        sx={{ maxWidth: 1200, mx: "auto", px: 3, minHeight: "60vh" }}>

        {state.status === "connecting" && (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
            <CircularProgress />
          </Box>
        )}

        {state.status === "disconnected" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: 8,
              gap: 2,
            }}>
            <Alert severity="error" sx={{ maxWidth: 480, width: "100%" }}>
              {state.error}
            </Alert>
            <Button variant="contained" onClick={handleRetry}>
              Retry Connection
            </Button>
          </Box>
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

        {state.status === "results" && groups.length === 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: 8,
              gap: 2,
            }}>
            <Typography variant="h6" color="text.secondary">
              No duplicates found in your library.
            </Typography>
            <Button variant="contained" onClick={handleStartScan}>
              Re-scan
            </Button>
          </Box>
        )}

        {state.status === "results" && groups.length > 0 && (
          <>
            <ActionBar
              totalItems={state.totalItems}
              groupCount={groups.length}
              duplicateCount={duplicateCount}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onTrash={handleTrash}
              onRescan={handleStartScan}
            />
            <DuplicateGroups
              groups={state.groups}
              mediaItems={state.mediaItems}
              selectedGroupIds={selectedGroupIds}
              onToggleGroup={handleToggleGroup}
              getOriginal={getOriginal}
              onSetOriginal={handleSetOriginal}
            />
          </>
        )}

        {state.status === "trashing" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: 8,
              gap: 2,
            }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              Moving items to trash… {state.trashedCount}/{state.totalToTrash}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Undo trash snackbar */}
      <Snackbar
        open={!!undoData}
        autoHideDuration={8000}
        onClose={handleUndoClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={undoData ? `${undoData.count} item${undoData.count !== 1 ? "s" : ""} moved to trash` : ""}
        action={
          <>
            <Button color="secondary" size="small" onClick={handleUndo}>
              Undo
            </Button>
            <IconButton size="small" color="inherit" onClick={handleUndoClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      />
    </ThemeProvider>
  )
}
