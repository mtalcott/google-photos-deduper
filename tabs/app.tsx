import CloseIcon from "@mui/icons-material/Close"
import Alert from "@mui/material/Alert"
import AppBar from "@mui/material/AppBar"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import CssBaseline from "@mui/material/CssBaseline"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogContentText from "@mui/material/DialogContentText"
import DialogTitle from "@mui/material/DialogTitle"
import IconButton from "@mui/material/IconButton"
import Snackbar from "@mui/material/Snackbar"
import { ThemeProvider } from "@mui/material/styles"
import Toolbar from "@mui/material/Toolbar"
import Typography from "@mui/material/Typography"
import confetti from "canvas-confetti"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"

import { ActionBar } from "../components/ActionBar"
import { DuplicateGroups } from "../components/DuplicateGroups"
import { ScanConfig } from "../components/ScanConfig"
import { ScanProgress } from "../components/ScanProgress"
import { appReducer } from "../lib/app-reducer"
import type { AppAction, AppState } from "../lib/app-reducer"
import { debug } from "../lib/debug"
import {
  fullDetectDuplicates,
  smartDetectDuplicates
} from "../lib/duplicate-detector"
import type { DetectionProgress } from "../lib/duplicate-detector"
import { ScanLogger } from "../lib/scan-log"
import theme from "../lib/theme"
import { APP_ID, DEFAULT_SETTINGS } from "../lib/types"
import type {
  AppMessage,
  DuplicateGroup,
  GpdMediaItem,
  GptkProgressMessage,
  GptkResultMessage,
  HealthCheckResultMessage,
  ScanSettings,
  StoredState
} from "../lib/types"

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
  const [storageChecked, setStorageChecked] = useState(false)
  const [settings, setSettings] = useReducer(
    (prev: ScanSettings, next: Partial<ScanSettings>) => ({ ...prev, ...next }),
    DEFAULT_SETTINGS
  )

  // Selection state: which groups are selected for trash
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set()
  )

  // Kept overrides: groupId -> Set of mediaKeys the user marked as "Keep"
  const [keptOverrides, setKeptOverrides] = useState<
    Record<string, Set<string>>
  >({})

  // Confirm dialog state
  const [trashConfirm, setTrashConfirm] = useState<{
    dedupKeys: string[]
    mediaKeysToTrash: string[]
  } | null>(null)

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

  // AbortController for the current scan (cancelled on user request or new scan)
  const scanAbortRef = useRef<AbortController | null>(null)

  // Persisted scan performance logger — survives page reloads via chrome.storage.local
  const scanLoggerRef = useRef(new ScanLogger())

  // Cached media items from previous scan, used to merge with incremental fetch
  const cachedMediaItemsRef = useRef<Record<string, GpdMediaItem> | null>(null)

  // Tracks the requestId of the active scan so stale results from previous
  // scans killed by reload can be dropped (they arrive late from the GP tab)
  const currentScanRequestIdRef = useRef<string | null>(null)

  // Sync selectedGroupIds when groups change (e.g. after scan or trash)
  const stateGroups =
    state.status === "results" || state.status === "trashing"
      ? state.groups
      : null
  const groups = useMemo(() => stateGroups ?? [], [stateGroups])
  useEffect(() => {
    setSelectedGroupIds(new Set(groups.map((g) => g.id)))
    setKeptOverrides({})
  }, [groups])

  const getKept = useCallback(
    (group: DuplicateGroup): Set<string> =>
      keptOverrides[group.id] ?? new Set([group.originalMediaKey]),
    [keptOverrides]
  )

  const handleToggleKept = useCallback(
    (group: DuplicateGroup, mediaKey: string) => {
      setKeptOverrides((prev) => {
        const current = prev[group.id] ?? new Set([group.originalMediaKey])
        // Prevent removing the last kept item
        if (current.has(mediaKey) && current.size === 1) return prev
        const next = new Set(current)
        if (next.has(mediaKey)) {
          next.delete(mediaKey)
        } else {
          next.add(mediaKey)
        }
        return { ...prev, [group.id]: next }
      })
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
            payload: message as HealthCheckResultMessage
          })
          break
        case "gptkResult": {
          const result = message as GptkResultMessage
          if (result.command === "getAllMediaItems") {
            // Drop stale results from scans that were killed/cancelled — their
            // GPTK request may have still been in-flight and arrives late
            if (result.requestId !== currentScanRequestIdRef.current) {
              console.warn(
                `[GPD] Dropping stale getAllMediaItems result for requestId ${result.requestId} (active: ${currentScanRequestIdRef.current})`
              )
              break
            }
            if (result.success) {
              let items = result.data as GpdMediaItem[]
              const cached = cachedMediaItemsRef.current
              if (cached && Object.keys(cached).length > 0) {
                // Merge: new items take precedence over cached (handles field updates)
                const newItemKeys = new Set(items.map((i) => i.mediaKey))
                const cachedOnly = Object.values(cached).filter(
                  (i) => !newItemKeys.has(i.mediaKey)
                )
                items = [...items, ...cachedOnly]
                console.log(
                  `[GPD] media items: ${(result.data as GpdMediaItem[]).length} new + ${cachedOnly.length} cached = ${items.length} total`
                )
                cachedMediaItemsRef.current = null
              }
              dispatch({
                type: "SCAN_MEDIA_FETCHED",
                mediaItems: items
              })
              runDuplicateDetection(
                items,
                scanAbortRef.current?.signal ?? new AbortController().signal
              )
            } else {
              dispatch({
                type: "SCAN_ERROR",
                error: result.error || "Scan failed"
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
                  snapshot: preTrashSnapshotRef.current
                })
                preTrashSnapshotRef.current = null
                pendingDedupKeysRef.current = null
              }
            } else {
              dispatch({
                type: "TRASH_ERROR",
                error: result.error || "Trash failed"
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
        case "gptkProgress": {
          const progress = message as GptkProgressMessage
          if (progress.command === "trashItems") {
            console.log(`[GPD] trash progress: ${progress.itemsProcessed}`)
            dispatch({ type: "TRASH_PROGRESS", trashedSoFar: progress.itemsProcessed })
          } else if (progress.command === "restoreItems") {
            console.log(`[GPD] restore progress: ${progress.itemsProcessed}`)
          } else {
            dispatch({ type: "SCAN_PROGRESS", payload: progress })
          }
          break
        }
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
    async (items: GpdMediaItem[], signal: AbortSignal) => {
      const logger = scanLoggerRef.current
      await logger.start(items.length)
      try {
        const onProgressCallback = (progress: DetectionProgress) => {
          dispatch({
            type: "SCAN_PROGRESS",
            phase: progress.phase,
            payload: {
              app: APP_ID,
              action: "gptkProgress",
              requestId: "",
              itemsProcessed: progress.current,
              message: `${progress.phase}: ${progress.current}/${progress.total}`
            }
          })
        }

        console.log(
          `[GPD] starting scan: mode=${settingsRef.current.scanMode}, threshold=${settingsRef.current.similarityThreshold}`
        )

        const groups =
          settingsRef.current.scanMode === "smart"
            ? await smartDetectDuplicates(
                items,
                settingsRef.current.similarityThreshold,
                1000,
                onProgressCallback,
                signal,
                logger
              )
            : await (async () => {
                const result = await fullDetectDuplicates(
                  items,
                  settingsRef.current.similarityThreshold,
                  onProgressCallback,
                  signal,
                  logger
                )
                return result.groups
              })()

        await logger.finalize("complete", { groupsFound: groups.length })
        currentScanRequestIdRef.current = null

        const mediaItemMap: Record<string, GpdMediaItem> = {}
        for (const item of items) {
          mediaItemMap[item.mediaKey] = item
        }

        dispatch({
          type: "SCAN_COMPLETE",
          mediaItems: mediaItemMap,
          groups
        })
      } catch (error) {
        currentScanRequestIdRef.current = null
        if (error instanceof DOMException && error.name === "AbortError") {
          await logger.finalize("cancelled")
          dispatch({ type: "SCAN_CANCELLED" })
        } else {
          await logger.finalize("error", { error: String(error) })
          dispatch({
            type: "SCAN_ERROR",
            error: `Duplicate detection failed: ${error}`
          })
        }
      }
    },
    []
  )

  // Health check on mount + recover any scan log entry orphaned by a page reload
  useEffect(() => {
    sendToServiceWorker({ app: APP_ID, action: "healthCheck" })
    scanLoggerRef.current.recoverStale()
  }, [])

  // Load saved settings and results on mount
  useEffect(() => {
    chrome.storage.local.get(
      ["settings", "scanResults"],
      (result: Partial<StoredState>) => {
        if (result.settings) {
          setSettings(result.settings)
        }
        if (result.scanResults?.totalItems && Array.isArray(result.scanResults.groups)) {
          dispatch({
            type: "LOAD_SAVED_RESULTS",
            mediaItems: result.scanResults.mediaItems,
            groups: result.scanResults.groups,
            totalItems: result.scanResults.totalItems
          })
        }
        setStorageChecked(true)
      }
    )
  }, [])

  // Persist scan results when they change (after scan or trash)
  const mediaItems = state.status === "results" ? state.mediaItems : null
  const totalItems = state.status === "results" ? state.totalItems : 0
  useEffect(() => {
    if (!mediaItems) return
    if (groups.length > 0) {
      const newestCreationTimestamp = Object.values(mediaItems).reduce(
        (max, item) => Math.max(max, item.creationTimestamp ?? 0),
        0
      )
      chrome.storage.local.set({
        scanResults: {
          mediaItems,
          groups,
          scanDate: Date.now(),
          totalItems,
          newestCreationTimestamp
        }
      })
    } else {
      // All duplicates removed — clear saved results so next open starts fresh
      chrome.storage.local.remove("scanResults")
    }
  }, [groups, mediaItems, totalItems])

  // Save settings on change
  useEffect(() => {
    chrome.storage.local.set({ settings })
  }, [settings])

  const handleStartScan = useCallback(async () => {
    // Cancel any in-progress scan
    scanAbortRef.current?.abort()
    scanAbortRef.current = new AbortController()

    const requestId = generateRequestId()
    currentScanRequestIdRef.current = requestId
    const hasGptk = state.status === "connected" ? state.hasGptk : true
    const accountEmail =
      state.status === "connected" || state.status === "results"
        ? state.accountEmail
        : undefined
    dispatch({ type: "SCAN_STARTED", requestId, hasGptk, accountEmail })

    // Load cached media items for incremental fetch. On a repeat scan we only
    // fetch items newer than the most-recently-seen upload timestamp.
    cachedMediaItemsRef.current = null
    let sinceTimestamp: number | undefined
    try {
      const stored = (await chrome.storage.local.get(
        "scanResults"
      )) as Partial<StoredState>
      const prev = stored.scanResults
      if (prev?.mediaItems && Object.keys(prev.mediaItems).length > 0) {
        cachedMediaItemsRef.current = prev.mediaItems
        // Compute watermark if not stored (migration: first run after this deploy)
        sinceTimestamp =
          prev.newestCreationTimestamp ??
          Object.values(prev.mediaItems).reduce(
            (max, item) => Math.max(max, item.creationTimestamp ?? 0),
            0
          )
        console.log(
          `[GPD] media items cache: ${Object.keys(prev.mediaItems).length} items, fetching since ${new Date(sinceTimestamp).toISOString()}`
        )
      }
    } catch {
      // Cache unavailable — do full fetch
    }

    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "getAllMediaItems",
      requestId,
      args: {
        dateRange: settings.dateRange,
        sinceTimestamp
      }
    })
  }, [settings])

  const handleTrash = useCallback(() => {
    if (state.status !== "results") return

    const dedupKeys: string[] = []
    const mediaKeysToTrash: string[] = []
    for (const group of state.groups) {
      if (!selectedGroupIds.has(group.id)) continue
      const keptSet = getKept(group)
      for (const key of group.mediaKeys) {
        if (keptSet.has(key)) continue
        const item = state.mediaItems[key]
        if (item?.dedupKey) {
          dedupKeys.push(item.dedupKey)
          mediaKeysToTrash.push(key)
        }
      }
    }

    if (dedupKeys.length === 0) return
    setTrashConfirm({ dedupKeys, mediaKeysToTrash })
  }, [state, selectedGroupIds, getKept])

  const handleTrashConfirmed = useCallback(() => {
    if (!trashConfirm || state.status !== "results") return
    const { dedupKeys, mediaKeysToTrash } = trashConfirm
    setTrashConfirm(null)

    const requestId = generateRequestId()

    // Capture snapshot for undo
    preTrashSnapshotRef.current = {
      mediaItems: state.mediaItems,
      groups: state.groups,
      totalItems: state.totalItems
    }
    pendingDedupKeysRef.current = dedupKeys

    dispatch({
      type: "TRASH_STARTED",
      totalToTrash: dedupKeys.length,
      mediaItems: state.mediaItems,
      groups: state.groups,
      totalItems: state.totalItems
    })

    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "trashItems",
      requestId,
      args: { dedupKeys, mediaKeysToTrash }
    })
  }, [trashConfirm, state])

  const handleCancelScan = useCallback(() => {
    scanAbortRef.current?.abort()
    currentScanRequestIdRef.current = null
    dispatch({ type: "SCAN_CANCELLED" })
  }, [])

  const handleReset = useCallback(() => {
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
      totalItems: undoData.snapshot.totalItems
    })
    // Call GPTK to restore from trash
    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "restoreItems",
      requestId: generateRequestId(),
      args: { dedupKeys: undoData.dedupKeys }
    })
    setUndoData(null)
  }, [undoData])

  const handleUndoClose = useCallback(() => {
    setUndoData(null)
  }, [])

  // Fire confetti when trash completes
  useEffect(() => {
    if (!undoData) return
    confetti({
      particleCount: 200,
      spread: 100,
      origin: { y: 0.7 }
    })
  }, [undoData])

  // Compute duplicate count for ActionBar
  const duplicateCount =
    state.status === "results"
      ? groups.reduce((sum, group) => {
          if (!selectedGroupIds.has(group.id)) return sum
          const keptSet = getKept(group)
          return sum + group.mediaKeys.filter((k) => !keptSet.has(k)).length
        }, 0)
      : 0

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Sticky header */}
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>
            Google Photos Deduper
          </Typography>
          {"accountEmail" in state && state.accountEmail && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Signed in as {state.accountEmail}
            </Typography>
          )}
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
              gap: 2
            }}>
            <Alert severity="error" sx={{ maxWidth: 480, width: "100%" }}>
              {state.error}
            </Alert>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                href="https://photos.google.com/login"
                target="_blank"
                rel="noopener noreferrer">
                Open Google Photos
              </Button>
              <Button variant="outlined" onClick={handleReset}>
                Retry Connection
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Return here once Google Photos is open and you're signed in.
            </Typography>
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
            onCancel={handleCancelScan}
          />
        )}

        {state.status === "results" && groups.length === 0 && storageChecked && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: 8,
              gap: 2
            }}>
            <Typography variant="h6" color="text.secondary">
              No duplicates found in your library.
            </Typography>
            <Button variant="contained" onClick={handleReset}>
              Back to Scan
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
              onRescan={handleReset}
            />
            <DuplicateGroups
              groups={state.groups}
              mediaItems={state.mediaItems}
              selectedGroupIds={selectedGroupIds}
              onToggleGroup={handleToggleGroup}
              getKept={getKept}
              onToggleKept={handleToggleKept}
            />
          </>
        )}

        {state.status === "trashing" && (
          <Box sx={{ maxWidth: 480, mx: "auto", p: 4 }}>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              Moving to Trash
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <CircularProgress size={14} thickness={5} />
              <Typography variant="body2" color="text.secondary">
                {state.trashedSoFar > 0
                  ? `${state.trashedSoFar.toLocaleString()} of ${state.totalToTrash.toLocaleString()} moved`
                  : "Starting…"}
              </Typography>
            </Box>
            <LinearProgress
              variant={state.trashedSoFar > 0 ? "determinate" : "indeterminate"}
              value={Math.round((state.trashedSoFar / state.totalToTrash) * 100)}
            />
          </Box>
        )}
      </Box>

      {/* Trash confirm dialog */}
      <Dialog open={!!trashConfirm} onClose={() => setTrashConfirm(null)}>
        <DialogTitle>Move to Trash</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Move {trashConfirm?.dedupKeys.length} duplicate
            {trashConfirm?.dedupKeys.length !== 1 ? "s" : ""} to trash? You can
            restore them from the Google Photos trash.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrashConfirm(null)}>Cancel</Button>
          <Button
            onClick={handleTrashConfirmed}
            variant="contained"
            color="error">
            Move to Trash
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo trash snackbar */}
      <Snackbar
        open={!!undoData}
        autoHideDuration={null}
        onClose={handleUndoClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={
          undoData
            ? `${undoData.count} item${undoData.count !== 1 ? "s" : ""} moved to trash`
            : ""
        }
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
