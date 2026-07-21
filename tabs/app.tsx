import "@fontsource/dm-sans/400.css"
import "@fontsource/dm-sans/500.css"
import "@fontsource/dm-sans/700.css"

import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded"
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded"
import CloseIcon from "@mui/icons-material/Close"
import CollectionsRoundedIcon from "@mui/icons-material/CollectionsRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import LockOutlinedIcon from "@mui/icons-material/LockOutlined"
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded"
import PhotoLibraryRoundedIcon from "@mui/icons-material/PhotoLibraryRounded"
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded"
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import Alert from "@mui/material/Alert"
import AppBar from "@mui/material/AppBar"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import CssBaseline from "@mui/material/CssBaseline"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogContentText from "@mui/material/DialogContentText"
import DialogTitle from "@mui/material/DialogTitle"
import GlobalStyles from "@mui/material/GlobalStyles"
import IconButton from "@mui/material/IconButton"
import LinearProgress from "@mui/material/LinearProgress"
import MenuItem from "@mui/material/MenuItem"
import Snackbar from "@mui/material/Snackbar"
import { ThemeProvider } from "@mui/material/styles"
import TextField from "@mui/material/TextField"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import confetti from "canvas-confetti"
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from "react"

import { ActionBar } from "../components/ActionBar"
import type { ReviewFilter } from "../components/ActionBar"
import { DuplicateGroups } from "../components/DuplicateGroups"
import { RatingPromptDialog } from "../components/RatingPromptDialog"
import { ScanConfig } from "../components/ScanConfig"
import { ScanProgress } from "../components/ScanProgress"
import {
  UpgradeDialog,
  type UpgradeReason
} from "../components/UpgradeDialog"
import { appReducer } from "../lib/app-reducer"
import type { AppAction, AppState } from "../lib/app-reducer"
import { debug } from "../lib/debug"
import { usePrefersReducedMotion } from "../lib/use-prefers-reduced-motion"
import { buildDeleteReport, type DeleteReport } from "../lib/delete-report"
import { classifyDuplicateGroup } from "../lib/duplicate-classifier"
import {
  fullDetectDuplicates,
  selectDefaultKeep,
  smartDetectDuplicates
} from "../lib/duplicate-detector"
import type { DetectionProgress } from "../lib/duplicate-detector"
import { EmbeddingCache } from "../lib/embedding-cache"
import {
  canExportFullReport,
  canResumeCheckpoint,
  canTrashCount,
  getEffectivePlanId,
  getEstimatedScanCount,
  getLockedGroupCount,
  getPlanLimits,
  getScanGate,
  getVisibleGroups,
  isFreeIcloudPlan,
  limitScanItems,
  PLAN_LABELS,
  scanSettingsForEntitlement,
  type Entitlement,
  type PlanId
} from "../lib/entitlement"
import { chooseKeepKeyForGroup, type KeepStrategy } from "../lib/keep-strategy"
import {
  getEffectiveLicenseApiBaseUrl,
  LICENSE_API_BASE_STORAGE_KEY,
  LicenseClient,
  loadStoredEntitlement,
  saveVerifiedEntitlementToken
} from "../lib/license-client"
import {
  countBucket,
  sendPrivacySafeAnalyticsEvent,
  type PrivacySafeAnalyticsEvent
} from "../lib/privacy-analytics"
import {
  chromeWebStoreReviewUrl,
  completeRatingPrompt,
  deferRatingPrompt,
  recordSuccessfulScan
} from "../lib/rating-prompt"
import { buildReviewReport, reviewReportToCsv } from "../lib/review-report"
import {
  canResumeScanCheckpoint,
  createScanCheckpoint,
  MAX_CHECKPOINT_MEDIA_ITEMS,
  SCAN_CHECKPOINT_KEY,
  shouldOfferResume,
  summarizeScanCheckpoint,
  updateScanCheckpoint,
  type ScanCheckpoint
} from "../lib/scan-checkpoint"
import { ScanLogger } from "../lib/scan-log"
import { areScanResultsValid } from "../lib/scan-results"
import { buildSupportDiagnosticsReport } from "../lib/support-diagnostics"
import theme, { photoSweepColors } from "../lib/theme"
import {
  buildTrashResultReport,
  type TrashResultReport
} from "../lib/trash-result-report"
import { APP_ID, DEFAULT_SETTINGS } from "../lib/types"
import type {
  AppMessage,
  DuplicateGroup,
  GpdAlbum,
  GpdMediaItem,
  GptkProgressMessage,
  GptkResultMessage,
  HealthCheckResultMessage,
  LaunchProviderResult,
  PhotoProvider,
  ScanSettings,
  StoredState
} from "../lib/types"

// ============================================================
// Helpers
// ============================================================

// Initial healthCheck retries. The first probe often fails on a freshly
// opened app tab because the bridge content script on photos.google.com has
// not finished loading yet, or because the MV3 service worker is still
// spinning up from idle. Backoff: 400ms, 800ms, 1600ms, 3200ms (5 attempts).
const HEALTH_CHECK_MAX_ATTEMPTS = 2
const TRASH_BATCH_SIZE = 25
const TRASH_BATCH_PAUSE_MS = 1000
const TRASH_RETRY_COUNT = 2
const TRASH_RETRY_BACKOFF_MS = 1000
const DELETE_REPORTS_KEY = "deleteReports"
const TRASH_RESULT_REPORTS_KEY = "trashResultReports"
const APP_CLIENT_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

function WorkflowRail({
  stage,
  totalItems,
  totalGroupCount,
  exactGroupCount,
  similarGroupCount,
  duplicateCount,
  scanDetail,
  onRescan,
  compact = false
}: {
  stage: "setup" | "scan" | "review" | "trash" | "done"
  totalItems: number
  totalGroupCount: number
  exactGroupCount: number
  similarGroupCount: number
  duplicateCount: number
  scanDetail?: string
  onRescan: () => void
  compact?: boolean
}) {
  const stageIndex = {
    setup: 0,
    scan: 1,
    review: 2,
    trash: 3,
    done: 3
  }[stage]
  const headline =
    stage === "setup"
      ? "Choose what to check"
      : stage === "scan"
        ? "Finding duplicates"
        : stage === "trash"
          ? "Moving to trash"
          : stage === "done"
            ? "Nothing to clean up"
            : "Choose what stays"
  const helper =
    stage === "setup"
      ? "Pick the library area and match sensitivity, then start the scan."
      : stage === "scan"
        ? "The extension is checking photos and videos and building review sets."
        : stage === "trash"
          ? "Included duplicates are moved in batches. Undo remains available after completion."
          : stage === "done"
            ? "No duplicate sets are waiting. Try different settings if needed."
            : "Pick the copy to keep in each set, then trash the rest safely."
  const steps = [
    {
      icon: <PhotoLibraryRoundedIcon fontSize="small" />,
      label: "Choose",
      value: stageIndex === 0 ? "Current" : "Done"
    },
    {
      icon: <RefreshRoundedIcon fontSize="small" />,
      label: "Find",
      value:
        stage === "scan"
          ? scanDetail || "Working"
          : stageIndex > 1
            ? "Done"
            : "Next"
    },
    {
      icon: <CollectionsRoundedIcon fontSize="small" />,
      label: "Review",
      value:
        stage === "review"
          ? `${totalGroupCount.toLocaleString()} sets`
          : stageIndex > 2
            ? "Done"
            : "Next"
    },
    {
      icon: <DeleteOutlineRoundedIcon fontSize="small" />,
      label: compact ? "Trash" : "Trash safely",
      value:
        stage === "trash"
          ? `${duplicateCount.toLocaleString()} moving`
          : stage === "review"
            ? `${duplicateCount.toLocaleString()} selected`
            : stage === "done"
              ? "Done"
              : "Final"
    }
  ]

  return (
    <Box
      component="aside"
      sx={{
        position: compact ? "static" : { md: "sticky" },
        top: compact ? "auto" : { md: 88 },
        alignSelf: "flex-start",
        width: compact ? "100%" : { xs: "100%", md: 272 },
        flexShrink: 0,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: compact ? 2 : 3,
        bgcolor: compact ? photoSweepColors.surface : "rgba(255,255,255,0.72)",
        backdropFilter: compact ? "none" : "saturate(180%) blur(22px)",
        overflow: "hidden",
        boxShadow: compact ? "none" : `0 20px 56px ${photoSweepColors.shadow}`
      }}>
      <Box
        sx={{
          p: compact ? 1.25 : 2.25,
          borderBottom: "1px solid",
          borderColor: "divider"
        }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          {stage === "scan" ? (
            <CircularProgress size={16} thickness={5} />
          ) : (
            <DoneAllRoundedIcon color="success" fontSize="small" />
          )}
          <Typography variant="subtitle2" fontWeight={700}>
            {headline}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 2 }}>
          {helper}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: compact
              ? "repeat(4, minmax(0, 1fr))"
              : "1fr 1fr",
            gap: compact ? 0.75 : 1.5
          }}>
          <Box>
            <Typography variant={compact ? "subtitle1" : "h6"} fontWeight={800}>
              {totalGroupCount.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              sets
            </Typography>
          </Box>
          <Box>
            <Typography variant={compact ? "subtitle1" : "h6"} fontWeight={800}>
              {totalItems.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              checked
            </Typography>
          </Box>
          <Box>
            <Typography variant={compact ? "subtitle1" : "h6"} fontWeight={800}>
              {exactGroupCount.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              identical
            </Typography>
          </Box>
          <Box>
            <Typography variant={compact ? "subtitle1" : "h6"} fontWeight={800}>
              {similarGroupCount.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              similar
            </Typography>
          </Box>
        </Box>
        {!compact && (
          <Button
            fullWidth
            variant="contained"
            startIcon={<PlayArrowRoundedIcon />}
            onClick={onRescan}
            sx={{ mt: 2, borderRadius: 999 }}>
            Start over
          </Button>
        )}
      </Box>

      <Box
        sx={{
          p: compact ? 0.75 : 1,
          display: compact ? "grid" : "block",
          gridTemplateColumns: compact
            ? "repeat(4, minmax(0, 1fr))"
            : undefined,
          gap: compact ? 0.5 : undefined
        }}>
        {steps.map((item, index) => (
          <Box
            key={item.label}
            sx={{
              display: "flex",
              flexDirection: compact ? "column" : "row",
              alignItems: "center",
              justifyContent: compact ? "center" : undefined,
              textAlign: compact ? "center" : "left",
              gap: compact ? 0.35 : 1.25,
              px: compact ? 0.5 : 1.25,
              py: compact ? 0.75 : 1.1,
              borderRadius: 2,
              color: index === stageIndex ? "primary.main" : "text.secondary",
              bgcolor: index === stageIndex ? "primary.light" : "transparent"
            }}>
            {item.icon}
            <Typography
              variant="body2"
              fontWeight={700}
              sx={{
                flex: compact ? "initial" : 1,
                fontSize: compact ? 11 : undefined,
                lineHeight: compact ? 1.1 : undefined
              }}>
              {item.label}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: compact ? "none" : "block" }}>
              {item.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sendToServiceWorker<T = unknown>(
  message: AppMessage
): Promise<T | undefined> {
  return Promise.resolve(
    chrome.runtime.sendMessage({ ...message, clientId: APP_CLIENT_ID })
  ) as Promise<T | undefined>
}

function activeDateRange(
  dateRange: ScanSettings["dateRange"]
): ScanSettings["dateRange"] | undefined {
  if (!dateRange?.from && !dateRange?.to) return undefined
  return dateRange
}

function activeAlbumScope(
  albumScope: ScanSettings["albumScope"]
): ScanSettings["albumScope"] | undefined {
  return albumScope?.mediaKey ? albumScope : undefined
}

function fullScanSettingsPatch(
  scanSettings: ScanSettings
): Partial<ScanSettings> {
  return {
    sourceProvider: scanSettings.sourceProvider ?? "google",
    similarityThreshold: scanSettings.similarityThreshold,
    scanMode: scanSettings.scanMode,
    smartWindowSec: scanSettings.smartWindowSec,
    dateRange: scanSettings.dateRange,
    albumScope: scanSettings.albumScope,
    amazonBatchLimit: scanSettings.amazonBatchLimit,
    icloudBatchLimit: scanSettings.icloudBatchLimit
  }
}

function providerLabel(provider: ScanSettings["sourceProvider"]): string {
  if (provider === "icloud") return "iCloud Photos"
  if (provider === "amazon") return "Amazon Photos"
  return "Google Photos"
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

function providerFromTabUrl(url: string | undefined): PhotoProvider | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (["www.icloud.com", "www.icloud.com.cn"].includes(parsed.hostname)) {
      return "icloud"
    }
    if (AMAZON_PHOTOS_HOSTS.has(parsed.hostname)) return "amazon"
    if (parsed.hostname === "photos.google.com") return "google"
  } catch {
    return null
  }
  return null
}

function providerBatchLimit(
  settings: ScanSettings,
  entitlement?: Entitlement | null
): number | undefined {
  const effectiveSettings = scanSettingsForEntitlement(settings, entitlement)
  const provider = effectiveSettings.sourceProvider ?? "google"
  const limit =
    provider === "amazon"
      ? effectiveSettings.amazonBatchLimit
      : provider === "icloud"
        ? effectiveSettings.icloudBatchLimit
        : undefined
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : undefined
}

function SidePanelConnectionSetup({
  selectedProvider,
  onOpenProvider,
  onRetry,
  error,
  connectionStatus = "Checking the open photo library tab..."
}: {
  selectedProvider: PhotoProvider
  onOpenProvider: (provider: PhotoProvider) => void
  onRetry: () => void
  error?: string
  connectionStatus?: string
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        maxWidth: "100%",
        mx: "auto",
        gap: 1.25
      }}>
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: photoSweepColors.surface,
          p: 1.25
        }}>
        <Typography variant="overline" color="text.secondary">
          Step 1
        </Typography>
        <Typography variant="subtitle1" fontWeight={800} gutterBottom>
          Choose photo source
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Pick one library. The main tab will open that provider.
        </Typography>
        <TextField
          select
          label="Photo source"
          size="small"
          fullWidth
          value={selectedProvider}
          sx={{ mb: 1 }}
          onChange={(event) =>
            onOpenProvider(event.target.value as PhotoProvider)
          }>
          <MenuItem value="google">Google Photos</MenuItem>
          <MenuItem value="icloud">iCloud Photos</MenuItem>
          <MenuItem value="amazon">Amazon Photos</MenuItem>
        </TextField>
        <Box
          sx={{
            border: "1px solid",
            borderColor: photoSweepColors.border,
            borderRadius: 2,
            p: 0.5,
            bgcolor: photoSweepColors.surfaceSoft
          }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={onRetry}
            fullWidth
            sx={{ fontWeight: 800 }}>
            Retry connection
          </Button>
        </Box>
      </Box>
      {error ? (
        <Alert severity="warning">{error}</Alert>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            border: "1px solid",
            borderColor: photoSweepColors.primaryBorder,
            borderRadius: 2,
            bgcolor: photoSweepColors.primarySoft,
            px: 1.25,
            py: 1
          }}>
          <CircularProgress size={16} thickness={5} />
          <Typography variant="body2" color="text.secondary">
            {connectionStatus}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

type TimelineStepStatus = "complete" | "active" | "locked"

type SidePanelStepItem = {
  index: number
  title: string
  description: string
  status: TimelineStepStatus
  icon: ReactNode
  summary?: string
}

function SidePanelTimelineProgress({ steps }: { steps: SidePanelStepItem[] }) {
  return (
    <Box
      component="ol"
      aria-label="Setup progress"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0.8,
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 0.35,
        border: "1px solid",
        borderColor: photoSweepColors.border,
        borderRadius: 2,
        bgcolor: photoSweepColors.surface,
        boxShadow: `0 4px 14px ${photoSweepColors.shadow}`,
        overflow: "hidden"
      }}>
      {steps.map((step, position) => {
        const isActive = step.status === "active"
        const isComplete = step.status === "complete"
        const markerColor = isComplete
          ? photoSweepColors.success
          : isActive
            ? photoSweepColors.primary
            : photoSweepColors.muted
        const statusLabel = isComplete
          ? "Done"
          : isActive
            ? "Current"
            : "Locked"
        const tooltip = `${step.title}: ${statusLabel}${
          step.summary ? `, ${step.summary}` : ""
        }`

        return (
          <Tooltip key={step.title} title={tooltip} arrow>
            <Box
              component="li"
              aria-current={isActive ? "step" : undefined}
              aria-label={tooltip}
              sx={{
                minWidth: 0,
                position: "relative",
                display: "grid",
                justifyItems: "center",
                alignContent: "start",
                gap: 0.45,
                px: 0.2,
                py: 0.2,
                color: markerColor,
                opacity: step.status === "locked" ? 0.62 : 1,
                "&::before":
                  position === 0
                    ? undefined
                    : {
                        content: '""',
                        position: "absolute",
                        top: 15,
                        right: "50%",
                        width: "100%",
                        height: 2,
                        bgcolor:
                          steps[position - 1]?.status === "complete"
                            ? photoSweepColors.success
                            : photoSweepColors.border,
                        zIndex: 0
                      }
              }}>
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  border: "2px solid",
                  borderColor: markerColor,
                  bgcolor: isComplete
                    ? photoSweepColors.successSoft
                    : isActive
                      ? photoSweepColors.primarySoft
                      : photoSweepColors.surfaceSoft,
                  boxShadow: isActive
                    ? `0 0 0 3px ${photoSweepColors.primaryShadow}`
                    : "none",
                  zIndex: 1,
                  "& svg": {
                    fontSize: 15
                  }
                }}>
                {isComplete ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 15 }} />
                ) : isActive ? (
                  step.index
                ) : (
                  step.icon
                )}
              </Box>
              <Typography
                variant="caption"
                noWrap
                sx={{
                  maxWidth: "100%",
                  fontSize: 10.75,
                  lineHeight: 1.1,
                  fontWeight: isActive ? 850 : 750,
                  color: isActive ? photoSweepColors.ink : markerColor,
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}>
                {step.title}
              </Typography>
            </Box>
          </Tooltip>
        )
      })}
    </Box>
  )
}

function SidePanelTimelineStep({
  title,
  description,
  status,
  summary,
  children
}: SidePanelStepItem & {
  children?: ReactNode
}) {
  const isActive = status === "active"
  if (!isActive || !children) return null

  return (
    <Box
      sx={{
        minWidth: 0,
        border: "1px solid",
        borderColor: photoSweepColors.primaryBorder,
        borderRadius: 2.25,
        bgcolor: photoSweepColors.surface,
        boxShadow: `0 14px 36px ${photoSweepColors.shadow}`,
        overflow: "hidden"
      }}>
      <Box
        sx={{
          px: 1.15,
          pt: 1,
          pb: 0.85,
          minWidth: 0,
          borderBottom: "1px solid",
          borderColor: photoSweepColors.border
        }}>
        <Typography
          variant="subtitle2"
          fontWeight={850}
          sx={{ lineHeight: 1.15, fontSize: 14, letterSpacing: 0 }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.2, lineHeight: 1.3 }}>
          {summary || description}
        </Typography>
      </Box>
      <Box
        sx={{
          px: 0.95,
          pt: 0.95,
          pb: 0.95,
          display: "grid",
          gap: 0.85,
          minWidth: 0,
          overflow: "hidden",
          "& > *": {
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box"
          }
        }}>
        {children}
      </Box>
    </Box>
  )
}

function SidePanelSourceBar({
  provider,
  connected,
  onProviderChange
}: {
  provider: PhotoProvider
  connected: boolean
  onProviderChange: (provider: PhotoProvider) => void
}) {
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 3,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) max-content",
        alignItems: "center",
        gap: 0.75,
        border: "1px solid",
        borderColor: photoSweepColors.border,
        borderRadius: 2,
        bgcolor: photoSweepColors.surface,
        boxShadow: `0 4px 14px ${photoSweepColors.shadow}`,
        p: 0.6
      }}>
      <TextField
        select
        size="small"
        fullWidth
        value={provider}
        aria-label="Photo source"
        sx={{
          minWidth: 0,
          "& .MuiInputBase-root": {
            height: 42,
            borderRadius: 1.5,
            bgcolor: photoSweepColors.surface
          },
          "& .MuiSelect-select": {
            py: 1,
            pr: "32px !important",
            fontSize: 15,
            fontWeight: 750,
            lineHeight: 1.2
          },
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: photoSweepColors.borderStrong
          }
        }}
        onChange={(event) =>
          onProviderChange(event.target.value as PhotoProvider)
        }>
        <MenuItem value="google">Google Photos</MenuItem>
        <MenuItem value="icloud">iCloud Photos</MenuItem>
        <MenuItem value="amazon">Amazon Photos</MenuItem>
      </TextField>
      <Typography
        variant="caption"
        noWrap
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.45,
          px: 0.9,
          py: 0.65,
          borderRadius: 999,
          bgcolor: connected
            ? photoSweepColors.successSoft
            : photoSweepColors.surfaceSoft,
          border: "1px solid",
          borderColor: connected
            ? "rgba(36, 138, 75, 0.18)"
            : photoSweepColors.border,
          color: connected ? photoSweepColors.success : photoSweepColors.muted,
          fontWeight: 850,
          fontSize: 11,
          lineHeight: 1
        }}>
        <Box
          component="span"
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: connected
              ? photoSweepColors.success
              : photoSweepColors.muted,
            flexShrink: 0
          }}
        />
        {connected ? "Connected" : "Not connected"}
      </Typography>
    </Box>
  )
}

function SidePanelBrandHeader() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.85,
        px: 0.35,
        py: 0.2
      }}>
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: photoSweepColors.surface,
          bgcolor: photoSweepColors.primary,
          boxShadow: `0 8px 18px ${photoSweepColors.primaryShadow}`
        }}>
        <AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
      <Typography
        variant="subtitle1"
        fontWeight={850}
        sx={{ letterSpacing: 0, color: photoSweepColors.ink, lineHeight: 1 }}>
        PhotoSweep
      </Typography>
    </Box>
  )
}

function SidePanelSafetyFooter() {
  return (
    <Box
      sx={{
        mt: 0,
        px: 1.2,
        py: 1.1,
        border: "1px solid",
        borderColor: photoSweepColors.border,
        borderRadius: 1.75,
        bgcolor: photoSweepColors.surfaceSoft,
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr)",
        gap: 1,
        alignItems: "center"
      }}>
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1.25,
          bgcolor: photoSweepColors.successSoft,
          color: photoSweepColors.success,
          display: "grid",
          placeItems: "center"
        }}>
        <LockOutlinedIcon sx={{ fontSize: 17 }} />
      </Box>
      <Box>
        <Typography variant="body2" fontWeight={850} sx={{ lineHeight: 1.2 }}>
          Your photos stay safe
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.35, mt: 0.2 }}>
          The extension reads metadata for matching. Nothing moves to trash
          until you review and confirm.
        </Typography>
      </Box>
    </Box>
  )
}

function dateToUtcMs(value: string, endOfDay = false): number {
  return Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
}

function filterMediaItemsByDateRange(
  items: GpdMediaItem[],
  dateRange: ScanSettings["dateRange"]
): GpdMediaItem[] {
  const range = activeDateRange(dateRange)
  if (!range) return items

  const fromMs = range.from ? dateToUtcMs(range.from) : Number.NEGATIVE_INFINITY
  const toMs = range.to ? dateToUtcMs(range.to, true) : Number.POSITIVE_INFINITY

  return items.filter((item) => {
    if (!Number.isFinite(item.timestamp)) return false
    return item.timestamp >= fromMs && item.timestamp <= toMs
  })
}

async function persistDeleteReport(report: DeleteReport): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(DELETE_REPORTS_KEY)
    const reports =
      (stored[DELETE_REPORTS_KEY] as DeleteReport[] | undefined) ?? []
    reports.push(report)
    if (reports.length > 20) reports.splice(0, reports.length - 20)
    await chrome.storage.local.set({ [DELETE_REPORTS_KEY]: reports })
  } catch (error) {
    console.warn("[GPD] failed to persist delete report", error)
    throw error
  }
}

function downloadDeleteReport(report: DeleteReport): void {
  downloadTextFile({
    filename: `${report.reportId}.json`,
    contents: JSON.stringify(report, null, 2),
    type: "application/json"
  })
}

async function persistTrashResultReport(
  report: TrashResultReport
): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(TRASH_RESULT_REPORTS_KEY)
    const reports =
      (stored[TRASH_RESULT_REPORTS_KEY] as TrashResultReport[] | undefined) ??
      []
    reports.push(report)
    if (reports.length > 20) reports.splice(0, reports.length - 20)
    await chrome.storage.local.set({ [TRASH_RESULT_REPORTS_KEY]: reports })
  } catch (error) {
    console.warn("[GPD] failed to persist trash result report", error)
    throw error
  }
}

function downloadTrashResultReport(report: TrashResultReport): void {
  downloadTextFile({
    filename: `${report.reportId}.json`,
    contents: JSON.stringify(report, null, 2),
    type: "application/json"
  })
}

function downloadTextFile(params: {
  filename: string
  contents: string
  type: string
}): void {
  const blob = new Blob([params.contents], { type: params.type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = params.filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function normalizeStoredSettings(settings: ScanSettings): ScanSettings {
  const isOldUntouchedDefault =
    settings.scanMode === "smart" &&
    settings.similarityThreshold === 0.99 &&
    (settings.smartWindowSec ?? 1) === 1 &&
    !activeDateRange(settings.dateRange) &&
    !activeAlbumScope(settings.albumScope)

  if (isOldUntouchedDefault) {
    return DEFAULT_SETTINGS
  }

  return {
    ...settings,
    sourceProvider: settings.sourceProvider ?? "google",
    exactOnly: settings.exactOnly ?? false,
    protectFavorites: settings.protectFavorites ?? true
  }
}

async function persistScanCheckpoint(
  checkpoint: ScanCheckpoint
): Promise<void> {
  await chrome.storage.local
    .set({ [SCAN_CHECKPOINT_KEY]: checkpoint })
    .catch(() => {})
}

async function clearScanCheckpoint(): Promise<void> {
  await chrome.storage.local.remove(SCAN_CHECKPOINT_KEY).catch(() => {})
}

function clearResumeCheckpointState(params: {
  checkpointRef: MutableRefObject<ScanCheckpoint | null>
  setResumeCheckpoint: Dispatch<SetStateAction<ScanCheckpoint | null>>
}): void {
  params.checkpointRef.current = null
  params.setResumeCheckpoint(null)
  void clearScanCheckpoint()
}

function isFavoriteProtected(
  item: GpdMediaItem | undefined,
  settings: ScanSettings
): boolean {
  return settings.protectFavorites !== false && item?.isFavorite === true
}

function protectedKeepKeysForGroup(
  group: DuplicateGroup,
  mediaItems: Record<string, GpdMediaItem>,
  settings: ScanSettings
): Set<string> {
  const protectedKeys = group.mediaKeys.filter((key) =>
    isFavoriteProtected(mediaItems[key], settings)
  )
  return new Set(protectedKeys)
}

function filterGroupsForSafety(
  groups: DuplicateGroup[],
  mediaItems: Record<string, GpdMediaItem>,
  settings: ScanSettings
): DuplicateGroup[] {
  if (!settings.exactOnly) return groups
  return groups.filter((group) => {
    const kind =
      group.duplicateKind ?? classifyDuplicateGroup(group, mediaItems).duplicateKind
    return kind === "exact"
  })
}

function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit <= 1 || value >= 10 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

type PendingSelections = {
  selectedGroupIds: Set<string>
  keptOverrides: Record<string, Set<string>>
}

function deserializeStoredSelections(value: unknown): PendingSelections | null {
  if (!value || typeof value !== "object") return null
  const raw = value as {
    selectedGroupIds?: unknown
    keptOverrides?: unknown
  }
  const selectedGroupIds = Array.isArray(raw.selectedGroupIds)
    ? raw.selectedGroupIds.filter((id): id is string => typeof id === "string")
    : []
  const keptOverrides: Record<string, Set<string>> = {}
  if (raw.keptOverrides && typeof raw.keptOverrides === "object") {
    for (const [groupId, mediaKeys] of Object.entries(
      raw.keptOverrides as Record<string, unknown>
    )) {
      if (!Array.isArray(mediaKeys)) continue
      const validMediaKeys = mediaKeys.filter(
        (key): key is string => typeof key === "string"
      )
      keptOverrides[groupId] = new Set(validMediaKeys)
    }
  }
  return {
    selectedGroupIds: new Set(selectedGroupIds),
    keptOverrides
  }
}

type IcloudAssetRef = {
  recordName: string
  changeTag: string
  zoneName: string
  ownerRecordName: string
}

type UndoData = {
  provider: PhotoProvider
  dedupKeys: string[]
  count: number
  snapshot: {
    mediaItems: Record<string, GpdMediaItem>
    groups: DuplicateGroup[]
    totalItems: number
  }
  // iCloud only: post-trash asset refs (fresh changeTags) so the Undo recover
  // can issue records/modify without a re-scan.
  icloudAssetRefs?: IcloudAssetRef[]
}

// ============================================================
// App component
// ============================================================

export default function App() {
  const isSidePanel =
    typeof window !== "undefined" &&
    (window.location.pathname.includes("sidepanel") ||
      window.location.pathname.includes("scanner-panel"))
  const [state, dispatch] = useReducer(appReducer, { status: "connecting" })
  const [sidePanelSourceConfirmed, setSidePanelSourceConfirmed] =
    useState(false)
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
  const [trashConfirmCount, setTrashConfirmCount] = useState("")
  const [trashWarning, setTrashWarning] = useState<string | null>(null)
  const [trashMovesThisSession, setTrashMovesThisSession] = useState(0)
  const [reportError, setReportError] = useState<string | null>(null)
  const [cacheEntryCount, setCacheEntryCount] = useState<number | null>(null)
  const [cacheStatus, setCacheStatus] = useState<string | undefined>()
  const [cacheBusy, setCacheBusy] = useState(false)
  const [resumeCheckpoint, setResumeCheckpoint] =
    useState<ScanCheckpoint | null>(null)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all")
  const [albums, setAlbums] = useState<GpdAlbum[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(false)
  const [albumsError, setAlbumsError] = useState<string | null>(null)
  const [accountValidationComplete, setAccountValidationComplete] =
    useState(false)
  const [entitlement, setEntitlement] = useState<Entitlement>({
    planId: "free",
    active: true,
    source: "none"
  })
  const [entitlementLoaded, setEntitlementLoaded] = useState(false)
  const [upgradePrompt, setUpgradePrompt] = useState<{
    reason: UpgradeReason
    detail?: string
  } | null>(null)
  const [ratingPromptOpen, setRatingPromptOpen] = useState(false)
  const [licenseApiBaseUrl, setLicenseApiBaseUrl] = useState<
    string | undefined
  >()
  const appOpenedTrackedRef = useRef(false)

  // Undo trash state: stored after a successful trash operation
  const [undoData, setUndoData] = useState<UndoData | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadStoredEntitlement(),
      chrome.storage.local.get(LICENSE_API_BASE_STORAGE_KEY)
    ])
      .then(([stored, licenseConfig]) => {
        if (cancelled) return
        setEntitlement(stored.entitlement)
        setLicenseApiBaseUrl(
          getEffectiveLicenseApiBaseUrl(
            licenseConfig[LICENSE_API_BASE_STORAGE_KEY] as string | undefined
          )
        )
        setEntitlementLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setEntitlement({ planId: "free", active: true, source: "none" })
          setLicenseApiBaseUrl(getEffectiveLicenseApiBaseUrl())
          setEntitlementLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openUpgradePrompt = useCallback(
    (reason: UpgradeReason, detail?: string) => {
      setUpgradePrompt({ reason, detail })
    },
    []
  )

  const trackEvent = useCallback(
    (event: PrivacySafeAnalyticsEvent) => {
      const safeEvent = {
        ...event,
        provider: event.provider ?? settingsRef.current.sourceProvider ?? "google",
        scanMode: event.scanMode ?? settingsRef.current.scanMode,
        planId: event.planId ?? getEffectivePlanId(entitlement)
      }
      void sendPrivacySafeAnalyticsEvent(licenseApiBaseUrl, safeEvent).catch(() => {
        // Analytics is optional; never interrupt scan, report, or Trash flows.
      })
    },
    [entitlement, licenseApiBaseUrl]
  )

  useEffect(() => {
    if (!entitlementLoaded) return
    if (appOpenedTrackedRef.current) return
    appOpenedTrackedRef.current = true
    trackEvent({ name: "app_opened" })
  }, [entitlementLoaded, trackEvent])

  const openTrackedUpgradePrompt = useCallback(
    (reason: UpgradeReason, detail?: string) => {
      trackEvent({ name: "upgrade_prompt_shown" })
      openUpgradePrompt(reason, detail)
    },
    [openUpgradePrompt, trackEvent]
  )

  const handleRefreshEntitlement = useCallback(async () => {
    const client = new LicenseClient({ apiBaseUrl: licenseApiBaseUrl })
    if (!client.isConfigured()) {
      setTrashWarning(
        "License refresh is not configured yet. Paid access will unlock once the Stripe license API is connected."
      )
      return
    }
    try {
      const token = await client.fetchEntitlementToken()
      const stored = await saveVerifiedEntitlementToken(token)
      setEntitlement(stored.entitlement)
      setEntitlementLoaded(true)
      trackEvent({
        name: "entitlement_refreshed",
        planId: getEffectivePlanId(stored.entitlement)
      })
      const refreshedPlanId = getEffectivePlanId(stored.entitlement)
      setTrashWarning(
        refreshedPlanId === "free"
          ? "No active paid license was found for this browser session."
          : `${PLAN_LABELS[refreshedPlanId]} is active.`
      )
      setUpgradePrompt(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTrashWarning(`Could not refresh license: ${message}`)
    }
  }, [licenseApiBaseUrl, trackEvent])

  const refreshTimeLimitedEntitlementForAction = useCallback(async () => {
    if (getEffectivePlanId(entitlement) !== "cleanup_pass") return entitlement
    const client = new LicenseClient({ apiBaseUrl: licenseApiBaseUrl })
    if (!client.isConfigured()) {
      setTrashWarning(
        "Cleanup Pass needs an online license refresh before paid actions. Connect to the internet and refresh your license."
      )
      return null
    }
    try {
      const token = await client.fetchEntitlementToken()
      const stored = await saveVerifiedEntitlementToken(token)
      setEntitlement(stored.entitlement)
      setEntitlementLoaded(true)
      return stored.entitlement
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTrashWarning(`Could not refresh Cleanup Pass: ${message}`)
      return null
    }
  }, [entitlement, licenseApiBaseUrl])

  const handleChooseUpgradePlan = useCallback(
    async (planId: Exclude<PlanId, "free">) => {
      const client = new LicenseClient({ apiBaseUrl: licenseApiBaseUrl })
      if (!client.isConfigured()) {
        setTrashWarning(
          `${PLAN_LABELS[planId]} checkout is not configured yet. The extension is enforcing free limits until the Stripe license API is connected.`
        )
        setUpgradePrompt(null)
        return
      }
      try {
        const checkout = await client.createCheckout(planId)
        trackEvent({ name: "checkout_started", planId })
        await chrome.tabs.create({ url: checkout.url })
        setTrashWarning(
          "Checkout opened in a new tab. After payment, return here and refresh your license."
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setTrashWarning(`Could not start checkout: ${message}`)
      }
    },
    [licenseApiBaseUrl, trackEvent]
  )

  const handleRecoverLicense = useCallback(
    async (email: string) => {
      const client = new LicenseClient({ apiBaseUrl: licenseApiBaseUrl })
      if (!client.isConfigured()) {
        throw new Error(
          "License recovery is not configured until the Stripe license API is connected."
        )
      }
      await client.recoverLicense(email)
      trackEvent({ name: "entitlement_refreshed" })
    },
    [licenseApiBaseUrl, trackEvent]
  )

  // Refs to capture pre-trash data for undo
  const preTrashSnapshotRef = useRef<{
    mediaItems: Record<string, GpdMediaItem>
    groups: DuplicateGroup[]
    totalItems: number
  } | null>(null)
  const pendingDedupKeysRef = useRef<string[] | null>(null)
  const pendingMediaKeysToTrashRef = useRef<string[] | null>(null)
  const pendingRestoreUndoRef = useRef<UndoData | null>(null)
  const pendingRestoreRequestIdRef = useRef<string | null>(null)

  // AbortController for the current scan (cancelled on user request or new scan)
  const scanAbortRef = useRef<AbortController | null>(null)

  // Persisted scan performance logger — survives page reloads via chrome.storage.local
  const scanLoggerRef = useRef(new ScanLogger())

  // Cached media items from previous scan, used to merge with incremental fetch
  const cachedMediaItemsRef = useRef<Record<string, GpdMediaItem> | null>(null)

  // Tracks the requestId of the active scan so stale results from previous
  // scans killed by reload can be dropped (they arrive late from the GP tab)
  const currentScanRequestIdRef = useRef<string | null>(null)
  const scanCheckpointRef = useRef<ScanCheckpoint | null>(null)

  // Counts failed healthCheck attempts during initial connect so we can retry
  // silently before showing a disconnected error.
  const healthCheckAttemptsRef = useRef(0)
  const albumsRequestedForAccountRef = useRef<string | null>(null)
  const currentAccountEmailRef = useRef<string | undefined>(undefined)
  const currentHasGptkRef = useRef(false)
  const sidePanelHostProviderRef = useRef<PhotoProvider | null>(null)
  const sidePanelHostTabIdRef = useRef<number | null>(null)

  // Holds selections loaded from storage; applied once when groups first load.
  const pendingSelectionsRef = useRef<PendingSelections | null>(null)
  // Fresh scans may auto-select all found groups for quick review. Mutations
  // like trash/undo must not auto-select newly remaining groups, because that
  // can turn a safe dummy-only action into a dangerous real-photo selection.
  const autoSelectNextResultsRef = useRef(false)

  const refreshEmbeddingCacheCount = useCallback(async () => {
    let cache: EmbeddingCache | null = null
    try {
      cache = await EmbeddingCache.open()
      setCacheEntryCount(await cache.count())
    } catch {
      setCacheEntryCount(null)
    } finally {
      cache?.close()
    }
  }, [])

  const requestAlbums = useCallback((accountEmail?: string) => {
    if ((settingsRef.current.sourceProvider ?? "google") !== "google") {
      setAlbums([])
      setAlbumsLoading(false)
      setAlbumsError(null)
      albumsRequestedForAccountRef.current = null
      return
    }
    const key = accountEmail || "__unknown__"
    albumsRequestedForAccountRef.current = key
    setAlbumsLoading(true)
    setAlbumsError(null)
    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "listAlbums",
      requestId: generateRequestId(),
      provider: "google"
    })
  }, [])

  const saveTrashResultReport = useCallback((report: TrashResultReport) => {
    try {
      downloadTrashResultReport(report)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setReportError(`Could not download the trash result report: ${message}`)
    }

    void persistTrashResultReport(report).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      setReportError(`Could not save the trash result report: ${message}`)
    })
  }, [])

  const patchScanCheckpoint = useCallback(
    (patch: Parameters<typeof updateScanCheckpoint>[1]) => {
      if (!scanCheckpointRef.current) return
      const next = updateScanCheckpoint(scanCheckpointRef.current, patch)
      scanCheckpointRef.current = next
      void persistScanCheckpoint(next)
    },
    []
  )

  // Sync selectedGroupIds when groups change (e.g. after scan or trash)
  const stateGroups =
    state.status === "results" || state.status === "trashing"
      ? state.groups
      : state.status === "scanning"
        ? state.partialGroups ?? null
        : null
  const groups = useMemo(() => stateGroups ?? [], [stateGroups])
  const displayMediaItems =
    state.status === "results" || state.status === "trashing"
      ? state.mediaItems
      : state.status === "scanning"
        ? state.partialMediaItems ?? {}
        : {}

  useEffect(() => {
    if (!isSidePanel || !chrome.runtime.connect) return

    const port = chrome.runtime.connect({ name: "gpd-side-panel" })
    let disposed = false
    const postReady = async () => {
      let activeTabId: number | undefined
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        })
        if (
          activeTab?.id !== undefined &&
          !activeTab.url?.startsWith("chrome-extension://")
        ) {
          activeTabId = activeTab.id
          sidePanelHostTabIdRef.current = activeTab.id
        }
        const hostProvider = providerFromTabUrl(activeTab?.url)
        if (hostProvider) {
          sidePanelHostProviderRef.current = hostProvider
          setSidePanelSourceConfirmed(true)
          if (
            (settingsRef.current.sourceProvider ?? "google") !== hostProvider
          ) {
            scanAbortRef.current?.abort()
            scanAbortRef.current = null
            currentScanRequestIdRef.current = null
            scanCheckpointRef.current = null
            cachedMediaItemsRef.current = null
            pendingSelectionsRef.current = null
            setResumeCheckpoint(null)
            setSelectedGroupIds(new Set())
            setKeptOverrides({})
            void chrome.storage.local.remove([
              "scanResults",
              "selections",
              SCAN_CHECKPOINT_KEY
            ])
            dispatch({ type: "RESET" })
            healthCheckAttemptsRef.current = 0
            const nextSettings = {
              ...settingsRef.current,
              sourceProvider: hostProvider,
              albumScope:
                hostProvider === "google"
                  ? settingsRef.current.albumScope
                  : undefined
            }
            settingsRef.current = nextSettings
            setSettings({
              sourceProvider: hostProvider,
              albumScope: nextSettings.albumScope
            })
            void chrome.storage.local.set({ settings: nextSettings })
            sendToServiceWorker({
              app: APP_ID,
              action: "healthCheck",
              provider: hostProvider
            })
          }
        }
      } catch {
        // Best effort: older browsers can still use the action-click tab id.
      }
      if (disposed) return
      port.postMessage({
        app: APP_ID,
        action: "sidePanel.ready",
        clientId: APP_CLIENT_ID,
        activeTabId
      })
    }
    void postReady()

    return () => {
      disposed = true
      port.disconnect()
    }
  }, [isSidePanel])

  useEffect(() => {
    if (pendingSelectionsRef.current) {
      const saved = pendingSelectionsRef.current
      pendingSelectionsRef.current = null
      const validGroups = new Map(groups.map((group) => [group.id, group]))
      // Restore saved selection, filtered to groups that still exist
      const next = new Set(
        [...saved.selectedGroupIds].filter((id) => validGroups.has(id))
      )
      setSelectedGroupIds(next)
      // Restore kept overrides, filtered to keys that still exist in the group.
      // If every saved key is stale, fall back to the current default keep choice.
      const filteredKept: Record<string, Set<string>> = {}
      for (const [id, keys] of Object.entries(saved.keptOverrides)) {
        const group = validGroups.get(id)
        if (!group) continue
        const validKeys = new Set(group.mediaKeys)
        const filteredKeys = [...keys].filter((key) => validKeys.has(key))
        if (keys.size === 0 || filteredKeys.length > 0) {
          filteredKept[id] = new Set(filteredKeys)
        }
      }
      setKeptOverrides(filteredKept)
      const canWriteSanitizedSelections =
        state.status === "results" && !state.accountEmail
      if (canWriteSanitizedSelections) {
        chrome.storage.local.set({
          selections: {
            selectedGroupIds: [...next],
            keptOverrides: Object.fromEntries(
              Object.entries(filteredKept).map(([id, keys]) => [id, [...keys]])
            )
          }
        })
      }
    } else if (autoSelectNextResultsRef.current) {
      autoSelectNextResultsRef.current = false
      setSelectedGroupIds(new Set(groups.map((g) => g.id)))
      setKeptOverrides({})
    } else {
      const validGroups = new Map(groups.map((group) => [group.id, group]))
      setSelectedGroupIds((prev) =>
        new Set([...prev].filter((id) => validGroups.has(id)))
      )
      setKeptOverrides((prev) => {
        const filtered: Record<string, Set<string>> = {}
        for (const [id, keys] of Object.entries(prev)) {
          const group = validGroups.get(id)
          if (!group) continue
          const validKeys = new Set(group.mediaKeys)
          const kept = [...keys].filter((key) => validKeys.has(key))
          if (keys.size === 0 || kept.length > 0) filtered[id] = new Set(kept)
        }
        return filtered
      })
    }
  }, [groups])

  useEffect(() => {
    if (!accountValidationComplete || state.status !== "results") return
    const currentAccountEmail = currentAccountEmailRef.current
    if (
      !currentAccountEmail ||
      areScanResultsValid(
        {
          accountEmail: state.accountEmail,
          sourceProvider: settingsRef.current.sourceProvider
        },
        {
          accountEmail: currentAccountEmail,
          sourceProvider: settingsRef.current.sourceProvider
        }
      )
    ) {
      return
    }
    pendingSelectionsRef.current = null
    setSelectedGroupIds(new Set())
    setKeptOverrides({})
    chrome.storage.local.remove(["scanResults", "selections"])
    dispatch({
      type: "HEALTH_CHECK_RESULT",
      payload: {
        app: APP_ID,
        action: "healthCheck.result",
        success: true,
        hasGptk: currentHasGptkRef.current,
        accountEmail: currentAccountEmail
      }
    })
  }, [accountValidationComplete, state])

  const handleToggleGroup = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  // Listen for messages from service worker
  useEffect(() => {
    const listener = (
      message: AppMessage,
      sender: chrome.runtime.MessageSender
    ) => {
      if (message?.app !== APP_ID) return
      if (message.clientId && message.clientId !== APP_CLIENT_ID) return
      // The bridge content script sends GPTK results via chrome.runtime.sendMessage,
      // which broadcasts to ALL extension contexts — so this listener fires twice:
      // once directly from the bridge (sender.tab set) and once via the service
      // worker relay (no sender.tab). Ignore direct bridge deliveries to avoid
      // processing each result twice.
      if (sender.tab) return

      switch (message.action) {
        case "healthCheck.result": {
          const msg = message as HealthCheckResultMessage
          if (
            !msg.success &&
            healthCheckAttemptsRef.current < HEALTH_CHECK_MAX_ATTEMPTS - 1
          ) {
            healthCheckAttemptsRef.current++
            const delay = 400 * Math.pow(2, healthCheckAttemptsRef.current - 1)
            dispatch({
              type: "HEALTH_CHECK_RESULT",
              payload: {
                ...msg,
                error:
                  msg.error ??
                  `Still trying to connect to ${providerLabel(settingsRef.current.sourceProvider ?? "google")}. If this does not recover, reload the photo tab and click Retry.`
              }
            })
            window.setTimeout(() => {
              sendToServiceWorker({
                app: APP_ID,
                action: "healthCheck",
                provider: settingsRef.current.sourceProvider ?? "google"
              })
            }, delay)
            return
          }
          if (msg.success) {
            healthCheckAttemptsRef.current = 0
            currentAccountEmailRef.current = msg.accountEmail
            currentHasGptkRef.current = msg.hasGptk
          }
          const currentState = stateRef.current
          const checkpoint = scanCheckpointRef.current
          if (
            msg.success &&
            checkpoint &&
            !areScanResultsValid(
              {
                accountEmail: checkpoint.accountEmail,
                sourceProvider: settingsRef.current.sourceProvider
              },
              {
                accountEmail: msg.accountEmail,
                sourceProvider: settingsRef.current.sourceProvider
              }
            )
          ) {
            clearResumeCheckpointState({
              checkpointRef: scanCheckpointRef,
              setResumeCheckpoint
            })
          }
          if (
            msg.success &&
            currentState.status === "results" &&
            !areScanResultsValid(
              {
                accountEmail: currentState.accountEmail,
                sourceProvider: settingsRef.current.sourceProvider
              },
              {
                accountEmail: msg.accountEmail,
                sourceProvider: settingsRef.current.sourceProvider
              }
            )
          ) {
            pendingSelectionsRef.current = null
            setSelectedGroupIds(new Set())
            setKeptOverrides({})
            chrome.storage.local.remove(["scanResults", "selections"])
          }
          setAccountValidationComplete(true)
          dispatch({
            type: "HEALTH_CHECK_RESULT",
            payload: msg
          })
          if (
            msg.success &&
            msg.hasGptk &&
            (settingsRef.current.sourceProvider ?? "google") === "google"
          ) {
            const key = msg.accountEmail || "__unknown__"
            if (albumsRequestedForAccountRef.current !== key) {
              requestAlbums(msg.accountEmail)
            }
          }
          break
        }
        case "gptkResult": {
          const result = message as GptkResultMessage
          if (result.command === "listAlbums") {
            setAlbumsLoading(false)
            if (result.success) {
              const nextAlbums = (result.data as GpdAlbum[]).filter(
                (album) => album.mediaKey
              )
              setAlbums(nextAlbums)
              setAlbumsError(null)
              const activeAlbum = activeAlbumScope(
                settingsRef.current.albumScope
              )
              if (
                activeAlbum &&
                !nextAlbums.some(
                  (album) => album.mediaKey === activeAlbum.mediaKey
                )
              ) {
                setSettings({ albumScope: undefined })
              }
            } else {
              setAlbumsError(result.error || "Could not load albums.")
            }
          } else if (result.command === "getAllMediaItems") {
            // Drop stale results from scans that were killed/cancelled — their
            // GPTK request may have still been in-flight and arrives late
            if (result.requestId !== currentScanRequestIdRef.current) {
              console.debug(
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
              if (activeDateRange(settingsRef.current.dateRange)) {
                items = filterMediaItemsByDateRange(
                  items,
                  settingsRef.current.dateRange
                )
              }
              if (
                items.length === 0 &&
                (settingsRef.current.sourceProvider ?? "google") !== "google"
              ) {
                const sourceProvider =
                  settingsRef.current.sourceProvider ?? "google"
                const providerName = providerLabel(sourceProvider)
                const error =
                  sourceProvider === "amazon"
                    ? `No ${providerName} items were found. Open Amazon Photos on your Amazon country site, sign in, leave the tab open, then scan again.`
                    : `No loaded ${providerName} items were found. Open ${providerName}, wait for thumbnails to appear, scroll the library to load photos, then scan again.`
                patchScanCheckpoint({
                  status: "error",
                  error,
                  message: error
                })
                setResumeCheckpoint(scanCheckpointRef.current)
                dispatch({
                  type: "SCAN_ERROR",
                  error
                })
                trackEvent({ name: "error", errorCategory: "scan" })
                break
              }
              const limited = limitScanItems(items, entitlement)
              if (limited.lockedItemCount > 0) {
                const effectivePlanId = getEffectivePlanId(entitlement)
                openTrackedUpgradePrompt(
                  "scan",
                  `Scanned the first ${limited.items.length.toLocaleString()} items for ${PLAN_LABELS[effectivePlanId]}. Upgrade to check the remaining ${limited.lockedItemCount.toLocaleString()} items.`
                )
                items = limited.items
              }
              dispatch({
                type: "SCAN_MEDIA_FETCHED",
                mediaItems: items
              })
              patchScanCheckpoint({
                phase: "downloading_thumbnails",
                itemsProcessed: 0,
                totalEstimate: items.length,
                message: `Found ${items.length} photos and videos. Loading previews...`,
                mediaItems:
                  items.length <= MAX_CHECKPOINT_MEDIA_ITEMS ? items : undefined
              })
              runDuplicateDetection(
                items,
                scanAbortRef.current?.signal ?? new AbortController().signal,
                result.requestId
              )
            } else {
              patchScanCheckpoint({
                status: "error",
                error: result.error || "Scan failed",
                message: result.error || "Scan failed"
              })
              trackEvent({ name: "error", errorCategory: "scan" })
              setResumeCheckpoint(scanCheckpointRef.current)
              dispatch({
                type: "SCAN_ERROR",
                error: result.error || "Scan failed"
              })
            }
          } else if (result.command === "trashItems") {
            const data = result.data as
              | {
                  trashedKeys?: string[]
                  trashedDedupKeys?: string[]
                  trashedCount?: number
                  requestedCount?: number
                  icloudAssetRefs?: IcloudAssetRef[]
                  dryRun?: boolean
                  message?: string
                  partial?: boolean
                  retryAttempts?: number
                }
              | undefined
            if (result.success) {
              const attemptedMediaKeys =
                pendingMediaKeysToTrashRef.current ?? data?.trashedKeys ?? []
              const attemptedDedupKeys =
                pendingDedupKeysRef.current ?? data?.trashedDedupKeys ?? []
              const trashedKeys = data?.trashedKeys ?? attemptedMediaKeys
              const trashedDedupKeys =
                data?.trashedDedupKeys ?? attemptedDedupKeys
              saveTrashResultReport(
                buildTrashResultReport({
                  attemptedMediaKeys,
                  attemptedDedupKeys,
                  movedMediaKeys: trashedKeys,
                  movedDedupKeys: trashedDedupKeys,
                  retryAttempts: data?.retryAttempts
                })
              )
              if (data?.dryRun) {
                dispatch({ type: "TRASH_COMPLETE", trashedKeys: [] })
                trackEvent({
                  name: "trash_completed",
                  photoCountBucket: countBucket(0)
                })
                setTrashWarning(
                  data.message ||
                    `iCloud delete dry-run completed for ${(
                      data.requestedCount ?? attemptedMediaKeys.length
                    ).toLocaleString()} item${
                      (data.requestedCount ?? attemptedMediaKeys.length) === 1
                        ? ""
                        : "s"
                    }. Nothing was deleted.`
                )
                preTrashSnapshotRef.current = null
                pendingDedupKeysRef.current = null
                pendingMediaKeysToTrashRef.current = null
                break
              }
              dispatch({ type: "TRASH_COMPLETE", trashedKeys })
              setTrashMovesThisSession(
                (count) => count + (trashedKeys.length || trashedDedupKeys.length)
              )
              trackEvent({
                name: "trash_completed",
                photoCountBucket: countBucket(
                  trashedKeys.length || trashedDedupKeys.length
                )
              })
              // Set undo data from the snapshot captured before trash
              if (preTrashSnapshotRef.current && pendingDedupKeysRef.current) {
                setUndoData({
                  dedupKeys: trashedDedupKeys,
                  provider:
                    preTrashSnapshotRef.current.mediaItems[trashedKeys[0]]?.provider ??
                    settingsRef.current.sourceProvider ??
                    "google",
                  count:
                    trashedKeys.length || pendingDedupKeysRef.current.length,
                  snapshot: preTrashSnapshotRef.current,
                  icloudAssetRefs: data?.icloudAssetRefs
                })
              }
              preTrashSnapshotRef.current = null
              pendingDedupKeysRef.current = null
              pendingMediaKeysToTrashRef.current = null
            } else {
              const attemptedMediaKeys =
                pendingMediaKeysToTrashRef.current ?? data?.trashedKeys ?? []
              const attemptedDedupKeys =
                pendingDedupKeysRef.current ?? data?.trashedDedupKeys ?? []
              const trashedKeys = data?.trashedKeys ?? []
              const trashedDedupKeys = data?.trashedDedupKeys ?? []
              saveTrashResultReport(
                buildTrashResultReport({
                  attemptedMediaKeys,
                  attemptedDedupKeys,
                  movedMediaKeys: trashedKeys,
                  movedDedupKeys: trashedDedupKeys,
                  retryAttempts: data?.retryAttempts,
                  error: result.error || "Trash failed"
                })
              )
              if (data?.partial && trashedKeys.length > 0) {
                dispatch({ type: "TRASH_COMPLETE", trashedKeys })
                setTrashMovesThisSession(
                  (count) =>
                    count + (trashedKeys.length || trashedDedupKeys.length)
                )
                trackEvent({
                  name: "trash_completed",
                  photoCountBucket: countBucket(
                    trashedKeys.length || trashedDedupKeys.length
                  ),
                  errorCategory: "trash_partial"
                })
                if (preTrashSnapshotRef.current && trashedDedupKeys.length) {
                  setUndoData({
                    dedupKeys: trashedDedupKeys,
                    provider:
                      preTrashSnapshotRef.current.mediaItems[trashedKeys[0]]?.provider ??
                      settingsRef.current.sourceProvider ??
                      "google",
                    count: trashedDedupKeys.length,
                    snapshot: preTrashSnapshotRef.current,
                    icloudAssetRefs: data?.icloudAssetRefs
                  })
                }
                setTrashWarning(
                  `Moved ${trashedKeys.length.toLocaleString()} item${
                    trashedKeys.length !== 1 ? "s" : ""
                  } before trash failed: ${result.error || "Trash failed"}`
                )
                preTrashSnapshotRef.current = null
                pendingDedupKeysRef.current = null
                pendingMediaKeysToTrashRef.current = null
                break
              }
              preTrashSnapshotRef.current = null
              pendingDedupKeysRef.current = null
              pendingMediaKeysToTrashRef.current = null
              trackEvent({ name: "error", errorCategory: "trash" })
              dispatch({
                type: "TRASH_ERROR",
                error: result.error || "Trash failed"
              })
            }
          } else if (result.command === "restoreItems") {
            if (result.requestId !== pendingRestoreRequestIdRef.current) {
              break
            }
            const pendingUndo = pendingRestoreUndoRef.current
            pendingRestoreUndoRef.current = null
            pendingRestoreRequestIdRef.current = null
            if (!result.success) {
              console.error("GPD: Restore failed:", result.error)
              if (pendingUndo) {
                setUndoData(pendingUndo)
                setTrashWarning(
                  `Restore failed: ${result.error || "Google Photos could not restore the moved items."}`
                )
              }
            }
          }
          break
        }
        case "gptkLog":
          if ((message as { level?: string }).level === "error") {
            dispatch({
              type: "GP_TAB_CLOSED",
              provider: settingsRef.current.sourceProvider ?? "google"
            })
          }
          break
        case "gptkProgress": {
          const progress = message as GptkProgressMessage
          if (progress.command === "trashItems") {
            const data = progress.data as
              | {
                  trashedKeys?: string[]
                  trashedDedupKeys?: string[]
                }
              | undefined
            console.log(`[GPD] trash progress: ${progress.itemsProcessed}`)
            dispatch({
              type: "TRASH_PROGRESS",
              trashedSoFar: progress.itemsProcessed,
              trashedKeys: data?.trashedKeys
            })
          } else if (progress.command === "restoreItems") {
            console.log(`[GPD] restore progress: ${progress.itemsProcessed}`)
          } else {
            patchScanCheckpoint({
              phase: "fetching",
              itemsProcessed: progress.itemsProcessed,
              message: progress.message ?? "Reading your library..."
            })
            dispatch({ type: "SCAN_PROGRESS", payload: progress })
          }
          break
        }
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [
    entitlement,
    openUpgradePrompt,
    patchScanCheckpoint,
    saveTrashResultReport
  ])

  // Keep refs so async callbacks always see latest values
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (
      state.status === "connected" ||
      state.status === "scanning" ||
      state.status === "results" ||
      state.status === "trashing"
    ) {
      setSidePanelSourceConfirmed(true)
    }
  }, [state.status])

  useEffect(() => {
    if (!entitlementLoaded) return
    const limits = getPlanLimits(entitlement)
    if (!limits.fullScanMode && settings.scanMode === "full") {
      setSettings({ scanMode: "smart" })
    }
  }, [entitlement, entitlementLoaded, settings.scanMode])

  // Run MediaPipe duplicate detection on fetched media items
  const runDuplicateDetection = useCallback(
    async (items: GpdMediaItem[], signal: AbortSignal, requestId: string) => {
      const logger = scanLoggerRef.current
      await logger.start(items.length)
      const patchCheckpointForRequest = (
        patch: Parameters<typeof updateScanCheckpoint>[1]
      ) => {
        if (scanCheckpointRef.current?.id !== requestId) return
        patchScanCheckpoint(patch)
      }
      try {
        const onProgressCallback = (progress: DetectionProgress) => {
          if (currentScanRequestIdRef.current !== requestId) return
          patchCheckpointForRequest({
            phase: progress.phase,
            itemsProcessed: progress.current,
            totalEstimate: progress.total,
            message: `${progress.phase}: ${progress.current}/${progress.total}`
          })
          dispatch({
            type: "SCAN_PROGRESS",
            phase: progress.phase,
            totalItems: progress.total,
            payload: {
              app: APP_ID,
              action: "gptkProgress",
              requestId: "",
              itemsProcessed: progress.current,
              message: `${progress.phase}: ${progress.current}/${progress.total}`
            }
          })
        }
        const onPartialGroupsCallback = (partialGroups: DuplicateGroup[]) => {
          if (currentScanRequestIdRef.current !== requestId) return
          const partialKeys = new Set(
            partialGroups.flatMap((group) => group.mediaKeys)
          )
          const partialMediaItems: Record<string, GpdMediaItem> = {}
          for (const item of items) {
            if (partialKeys.has(item.mediaKey)) {
              partialMediaItems[item.mediaKey] = item
            }
          }
          dispatch({
            type: "SCAN_PARTIAL_RESULTS",
            mediaItems: partialMediaItems,
            groups: partialGroups,
            totalItems: items.length
          })
        }

        const groups =
          settingsRef.current.scanMode === "smart"
            ? await smartDetectDuplicates(
                items,
                settingsRef.current.similarityThreshold,
                (settingsRef.current.smartWindowSec ?? 1) * 1000,
                onProgressCallback,
                signal,
                logger,
                onPartialGroupsCallback
              )
            : await (async () => {
                const result = await fullDetectDuplicates(
                  items,
                  settingsRef.current.similarityThreshold,
                  onProgressCallback,
                  signal,
                  logger,
                  onPartialGroupsCallback
                )
                return result.groups
              })()

        await logger.finalize("complete", { groupsFound: groups.length })
        if (currentScanRequestIdRef.current !== requestId) return
        await clearScanCheckpoint()
        scanCheckpointRef.current = null
        setResumeCheckpoint(null)
        currentScanRequestIdRef.current = null

        const groupMediaKeys = new Set(groups.flatMap((g) => g.mediaKeys))
        const mediaItemMap: Record<string, GpdMediaItem> = {}
        for (const item of items) {
          if (groupMediaKeys.has(item.mediaKey)) {
            mediaItemMap[item.mediaKey] = item
          }
        }

        autoSelectNextResultsRef.current = true
        dispatch({
          type: "SCAN_COMPLETE",
          mediaItems: mediaItemMap,
          groups,
          totalItems: items.length
        })
        trackEvent({
          name: "scan_completed",
          photoCountBucket: countBucket(items.length),
          duplicateGroupCountBucket: countBucket(groups.length)
        })
        void recordSuccessfulScan()
          .then((shouldPrompt) => {
            if (shouldPrompt) setRatingPromptOpen(true)
          })
          .catch(() => {
            // A storage failure must never interfere with scan results.
          })
        refreshEmbeddingCacheCount()
        // Refresh account email after scan — the email in state may be stale
        // if the user switched accounts since the last health check.
        sendToServiceWorker({
          app: APP_ID,
          action: "healthCheck",
          provider: settingsRef.current.sourceProvider ?? "google"
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          await logger.finalize("paused")
          if (
            scanCheckpointRef.current?.id === requestId &&
            scanCheckpointRef.current.status === "active"
          ) {
            patchCheckpointForRequest({
              status: "interrupted",
              message:
                "Scan paused. Resume to reuse completed cached embeddings."
            })
            setResumeCheckpoint(scanCheckpointRef.current)
          }
          if (currentScanRequestIdRef.current === requestId) {
            currentScanRequestIdRef.current = null
            dispatch({ type: "SCAN_CANCELLED" })
          }
        } else {
          await logger.finalize("error", { error: String(error) })
          if (currentScanRequestIdRef.current !== requestId) return
          currentScanRequestIdRef.current = null
          patchCheckpointForRequest({
            status: "error",
            error: String(error),
            message: `Duplicate detection failed: ${error}`
          })
          setResumeCheckpoint(scanCheckpointRef.current)
          trackEvent({ name: "error", errorCategory: "scan" })
          dispatch({
            type: "SCAN_ERROR",
            error: `Duplicate detection failed: ${error}`
          })
        }
      }
    },
    [patchScanCheckpoint, refreshEmbeddingCacheCount, requestAlbums, trackEvent]
  )

  // Health check on mount + recover any scan log entry orphaned by a page reload
  useEffect(() => {
    sendToServiceWorker({
      app: APP_ID,
      action: "healthCheck",
      provider: settingsRef.current.sourceProvider ?? "google"
    })
    scanLoggerRef.current.recoverStale()
    refreshEmbeddingCacheCount()
  }, [refreshEmbeddingCacheCount])

  // Load saved settings and results on mount
  useEffect(() => {
    chrome.storage.local.get(
      ["settings", "scanResults", "selections", SCAN_CHECKPOINT_KEY],
      (result: Partial<StoredState>) => {
        const restoredSettings = result.settings
          ? normalizeStoredSettings(result.settings)
          : settingsRef.current
        const hostProvider = isSidePanel
          ? sidePanelHostProviderRef.current
          : null
        const storedSettings = hostProvider
          ? {
              ...restoredSettings,
              sourceProvider: hostProvider,
              albumScope:
                hostProvider === "google"
                  ? restoredSettings.albumScope
                  : undefined
            }
          : restoredSettings
        if (result.settings || hostProvider) {
          settingsRef.current = storedSettings
          setSettings(storedSettings)
        }
        const checkpoint = result.scanCheckpoint
        if (checkpoint?.status === "active") {
          const interrupted = updateScanCheckpoint(checkpoint, {
            status: "interrupted",
            message:
              "Previous scan was interrupted. Resume to reuse completed cached embeddings."
          })
          scanCheckpointRef.current = interrupted
          if (
            canResumeScanCheckpoint(interrupted, {
              sourceProvider: storedSettings.sourceProvider
            })
          ) {
            setResumeCheckpoint(interrupted)
          }
          void persistScanCheckpoint(interrupted)
        } else if (
          shouldOfferResume(checkpoint) &&
          canResumeScanCheckpoint(checkpoint, {
            sourceProvider: storedSettings.sourceProvider
          })
        ) {
          scanCheckpointRef.current = checkpoint
          setResumeCheckpoint(checkpoint)
        }
        const currentAccountEmail = currentAccountEmailRef.current
        const savedResultsAreForCurrentAccount =
          !result.scanResults ||
          currentAccountEmail === undefined ||
          areScanResultsValid(result.scanResults, {
            accountEmail: currentAccountEmail,
            sourceProvider: storedSettings.sourceProvider ?? "google"
          })
        if (!savedResultsAreForCurrentAccount) {
          pendingSelectionsRef.current = null
          chrome.storage.local.remove(["scanResults", "selections"])
          setStorageChecked(true)
          return
        }
        if (result.selections) {
          // Store deserialized selections before dispatching LOAD_SAVED_RESULTS so
          // the groups-change effect can apply them when groups first appear.
          const saved = deserializeStoredSelections(result.selections)
          if (result.scanResults?.groups) {
            const validGroups = new Map(
              result.scanResults.groups.map((group) => [group.id, group])
            )
            const selectedGroupIds = new Set(
              [...saved.selectedGroupIds].filter((id) => validGroups.has(id))
            )
            const keptOverrides: Record<string, Set<string>> = {}
            for (const [id, keys] of Object.entries(saved.keptOverrides)) {
              const group = validGroups.get(id)
              if (!group) continue
              const validKeys = new Set(group.mediaKeys)
              const filteredKeys = [...keys].filter((key) => validKeys.has(key))
              if (keys.size === 0 || filteredKeys.length > 0) {
                keptOverrides[id] = new Set(filteredKeys)
              }
            }
            pendingSelectionsRef.current = {
              selectedGroupIds,
              keptOverrides
            }
            chrome.storage.local.set({
              selections: {
                selectedGroupIds: [...selectedGroupIds],
                keptOverrides: Object.fromEntries(
                  Object.entries(keptOverrides).map(([id, keys]) => [
                    id,
                    [...keys]
                  ])
                )
              }
            })
          } else {
            pendingSelectionsRef.current = saved
          }
        }
        if (
          result.scanResults?.totalItems &&
          Array.isArray(result.scanResults.groups)
        ) {
          dispatch({
            type: "LOAD_SAVED_RESULTS",
            mediaItems: result.scanResults.mediaItems,
            groups: result.scanResults.groups,
            totalItems: result.scanResults.totalItems,
            accountEmail: result.scanResults.accountEmail
          })
        }
        setStorageChecked(true)
      }
    )
  }, [])

  // Persist scan results when they change (after scan or trash)
  const mediaItems =
    state.status === "results" || state.status === "trashing"
      ? state.mediaItems
      : null

  const groupClassificationById = useMemo(() => {
    const m = new Map<string, "exact" | "similar">()
    if (Object.keys(displayMediaItems).length === 0) return m
    for (const group of groups) {
      m.set(
        group.id,
        group.duplicateKind ??
          classifyDuplicateGroup(group, displayMediaItems).duplicateKind
      )
    }
    return m
  }, [groups, displayMediaItems])

  const exactGroupCount = useMemo(
    () =>
      groups.reduce(
        (count, group) =>
          count + (groupClassificationById.get(group.id) === "exact" ? 1 : 0),
        0
      ),
    [groups, groupClassificationById]
  )
  const similarGroupCount = groups.length - exactGroupCount
  const filteredGroups = useMemo(() => {
    if (reviewFilter === "all") return groups
    return groups.filter(
      (group) => groupClassificationById.get(group.id) === reviewFilter
    )
  }, [groups, groupClassificationById, reviewFilter])
  const visibleGroups = useMemo(
    () => getVisibleGroups(filteredGroups, entitlement),
    [filteredGroups, entitlement]
  )
  const lockedGroupCount = useMemo(
    () => getLockedGroupCount(filteredGroups, entitlement),
    [filteredGroups, entitlement]
  )
  const provisionalGroups = state.status === "scanning" ? groups : visibleGroups

  const handleSelectAll = useCallback(() => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      for (const group of visibleGroups) next.add(group.id)
      return next
    })
  }, [visibleGroups])

  const handleDeselectAll = useCallback(() => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      for (const group of visibleGroups) next.delete(group.id)
      return next
    })
  }, [visibleGroups])

  // Stable default kept sets (one per group, only changes when groups or media items change).
  // Uses smart keep selection: original quality > oldest taken date > higher resolution.
  const defaultKeptSets = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const g of groups) {
      const groupItems = g.mediaKeys
        .map((k) => displayMediaItems[k])
        .filter(Boolean)
      const defaultKey =
        groupItems.length > 0
          ? selectDefaultKeep(groupItems)
          : g.originalMediaKey
      m.set(g.id, new Set([defaultKey]))
    }
    return m
  }, [groups, displayMediaItems])

  const getKept = useCallback(
    (group: DuplicateGroup): Set<string> =>
      keptOverrides[group.id] ??
      defaultKeptSets.get(group.id) ??
      new Set([group.originalMediaKey]),
    [keptOverrides, defaultKeptSets]
  )

  const buildCurrentReviewReport = useCallback(() => {
    const currentState = stateRef.current
    if (currentState.status !== "results") return null
    return buildReviewReport({
      groups: visibleGroups,
      mediaItems: currentState.mediaItems,
      selectedGroupIds,
      getKept
    })
  }, [getKept, selectedGroupIds, visibleGroups])

  const handleExportJson = useCallback(async () => {
    const report = buildCurrentReviewReport()
    if (!report) return
    const actionEntitlement = await refreshTimeLimitedEntitlementForAction()
    if (!actionEntitlement) return
    if (!canExportFullReport(actionEntitlement) && lockedGroupCount > 0) {
      openTrackedUpgradePrompt(
        "export",
        `This free report includes ${visibleGroups.length.toLocaleString()} visible duplicate set${visibleGroups.length === 1 ? "" : "s"}. Upgrade for the full report.`
      )
    }
    trackEvent({
      name: "export_clicked",
      duplicateGroupCountBucket: countBucket(visibleGroups.length)
    })
    downloadTextFile({
      filename: `${report.reportId}.json`,
      contents: JSON.stringify(report, null, 2),
      type: "application/json"
    })
  }, [
    buildCurrentReviewReport,
    lockedGroupCount,
    openTrackedUpgradePrompt,
    refreshTimeLimitedEntitlementForAction,
    trackEvent,
    visibleGroups.length
  ])

  const handleExportCsv = useCallback(async () => {
    const report = buildCurrentReviewReport()
    if (!report) return
    const actionEntitlement = await refreshTimeLimitedEntitlementForAction()
    if (!actionEntitlement) return
    if (!canExportFullReport(actionEntitlement) && lockedGroupCount > 0) {
      openTrackedUpgradePrompt(
        "export",
        `This free spreadsheet includes ${visibleGroups.length.toLocaleString()} visible duplicate set${visibleGroups.length === 1 ? "" : "s"}. Upgrade for the full report.`
      )
    }
    trackEvent({
      name: "export_clicked",
      duplicateGroupCountBucket: countBucket(visibleGroups.length)
    })
    downloadTextFile({
      filename: `${report.reportId}.csv`,
      contents: reviewReportToCsv(report),
      type: "text/csv"
    })
  }, [
    buildCurrentReviewReport,
    lockedGroupCount,
    openTrackedUpgradePrompt,
    refreshTimeLimitedEntitlementForAction,
    trackEvent,
    visibleGroups.length
  ])

  // Per-group kept sets: overridden groups use the live override Set (changes only for
  // the toggled group); unoverridden groups reuse the stable default Set from above so
  // React.memo on DuplicateGroupRow skips re-renders for unaffected rows.
  const keptByGroupId = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const g of groups) {
      m.set(g.id, keptOverrides[g.id] ?? defaultKeptSets.get(g.id)!)
    }
    return m
  }, [groups, keptOverrides, defaultKeptSets])

  const handleToggleKept = useCallback(
    (group: DuplicateGroup, mediaKey: string) => {
      setKeptOverrides((prev) => {
        const current =
          prev[group.id] ??
          defaultKeptSets.get(group.id) ??
          new Set([group.originalMediaKey])
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
    [defaultKeptSets]
  )

  const handleTrashAllCopies = useCallback((group: DuplicateGroup) => {
    setSelectedGroupIds((prev) => {
      if (prev.has(group.id)) return prev
      const next = new Set(prev)
      next.add(group.id)
      return next
    })
    setKeptOverrides((prev) => ({ ...prev, [group.id]: new Set() }))
  }, [])

  const handleApplyKeepStrategy = useCallback(
    (strategy: KeepStrategy) => {
      if (!mediaItems) return
      setKeptOverrides((prev) => {
        const next: Record<string, Set<string>> = { ...prev }
        for (const group of visibleGroups) {
          const keepKey = chooseKeepKeyForGroup(group, mediaItems, strategy)
          if (keepKey) next[group.id] = new Set([keepKey])
        }
        return next
      })
    },
    [mediaItems, visibleGroups]
  )
  const totalItems =
    state.status === "results" || state.status === "trashing"
      ? state.totalItems
      : 0
  const accountEmailForStorage =
    state.status === "results" || state.status === "trashing"
      ? state.accountEmail
      : undefined
  useEffect(() => {
    if (!accountValidationComplete) return
    if (!mediaItems) return
    if (groups.length > 0) {
      const storedMediaItemCount = Object.keys(mediaItems).length
      const mediaItemsAreComplete =
        !providerBatchLimit(settings, entitlement) &&
        storedMediaItemCount === totalItems
      const newestCreationTimestamp = mediaItemsAreComplete
        ? Object.values(mediaItems).reduce(
            (max, item) => Math.max(max, item.creationTimestamp ?? 0),
            0
          )
        : undefined
      chrome.storage.local.set({
        scanResults: {
          mediaItems,
          groups,
          scanDate: Date.now(),
          totalItems,
          newestCreationTimestamp,
          mediaItemsAreComplete,
          accountEmail: accountEmailForStorage,
          sourceProvider: settings.sourceProvider ?? "google",
          dateRange: activeDateRange(settings.dateRange),
          albumScope:
            (settings.sourceProvider ?? "google") === "google"
              ? activeAlbumScope(settings.albumScope)
              : undefined
        }
      })
    } else {
      // All duplicates removed — clear saved results so next open starts fresh
      chrome.storage.local.remove("scanResults")
    }
  }, [
    groups,
    mediaItems,
    totalItems,
    accountEmailForStorage,
    accountValidationComplete,
    settings.dateRange,
    settings.albumScope
  ])

  // Persist selections when they change (only while results are showing)
  useEffect(() => {
    const canPersistSelections =
      accountValidationComplete ||
      (!accountEmailForStorage && currentAccountEmailRef.current === undefined)
    if (!canPersistSelections) return
    if (state.status !== "results") return
    if (groups.length === 0) {
      chrome.storage.local.remove("selections")
      return
    }
    const validGroups = new Map(groups.map((group) => [group.id, group]))
    const validSelectedGroupIds = [...selectedGroupIds].filter((id) =>
      validGroups.has(id)
    )
    const validKeptOverrides: Record<string, string[]> = {}
    for (const [id, keys] of Object.entries(keptOverrides)) {
      const group = validGroups.get(id)
      if (!group) continue
      const validKeys = new Set(group.mediaKeys)
      const filteredKeys = [...keys].filter((key) => validKeys.has(key))
      if (keys.size === 0 || filteredKeys.length > 0) {
        validKeptOverrides[id] = filteredKeys
      }
    }
    chrome.storage.local.set({
      selections: {
        selectedGroupIds: validSelectedGroupIds,
        keptOverrides: validKeptOverrides
      }
    })
  }, [
    selectedGroupIds,
    keptOverrides,
    state.status,
    groups,
    accountEmailForStorage,
    accountValidationComplete
  ])

  // Save settings on change
  useEffect(() => {
    chrome.storage.local.set({ settings })
  }, [settings])

  useEffect(() => {
    setAlbums([])
    setAlbumsError(null)
    setAlbumsLoading(false)
    albumsRequestedForAccountRef.current = null
    healthCheckAttemptsRef.current = 0
    sendToServiceWorker({
      app: APP_ID,
      action: "healthCheck",
      provider: settings.sourceProvider ?? "google"
    })
  }, [settings.sourceProvider])

  const handleStartScan = useCallback(
    async (settingsOverride?: ScanSettings) => {
      const requestedSettings = settingsOverride ?? settings
      const actionEntitlement = await refreshTimeLimitedEntitlementForAction()
      if (!actionEntitlement) return
      const scanSettings = scanSettingsForEntitlement(
        requestedSettings,
        actionEntitlement
      )
      const estimatedCount = getEstimatedScanCount(scanSettings)
      const scanGate = getScanGate(scanSettings, estimatedCount, actionEntitlement)
      if (!scanGate.allowed) {
        openTrackedUpgradePrompt(
          "scan",
          scanGate.reason === "full_scan_locked"
            ? "Full scan unlocks with Cleanup Pass or Lifetime Early Access."
            : scanGate.reason === "unscoped_scan_locked" &&
                isFreeIcloudPlan(scanSettings, actionEntitlement)
              ? "Free iCloud scans need a date range before scanning. Upgrade to use paid iCloud test batches."
              : scanGate.reason === "unscoped_scan_locked"
                ? `Your ${PLAN_LABELS[getEffectivePlanId(actionEntitlement)]} plan needs an album, date range, or smaller test batch before scanning.`
                : `This scan is above the ${scanGate.limit?.toLocaleString()} photo limit for ${PLAN_LABELS[getEffectivePlanId(actionEntitlement)]}.`
        )
        return
      }
      trackEvent({
        name: "scan_started",
        provider: scanSettings.sourceProvider ?? "google",
        scanMode: scanSettings.scanMode,
        photoCountBucket:
          estimatedCount !== undefined ? countBucket(estimatedCount) : undefined
      })
      settingsRef.current = scanSettings
      setTrashMovesThisSession(0)
      if (settingsOverride) {
        setSettings(fullScanSettingsPatch(scanSettings))
        await chrome.storage.local.set({ settings: scanSettings })
      }

      // Cancel any in-progress scan
      scanAbortRef.current?.abort()
      scanAbortRef.current = new AbortController()

      const requestId = generateRequestId()
      currentScanRequestIdRef.current = requestId
      const currentState = stateRef.current
      const hasGptk =
        currentState.status === "connected" ? currentState.hasGptk : true
      const accountEmail =
        currentState.status === "connected" || currentState.status === "results"
          ? currentState.accountEmail
          : undefined
      const checkpoint = createScanCheckpoint({
        id: requestId,
        settings: scanSettings,
        accountEmail
      })
      scanCheckpointRef.current = checkpoint
      setResumeCheckpoint(null)
      void persistScanCheckpoint(checkpoint)

      dispatch({ type: "SCAN_STARTED", requestId, hasGptk, accountEmail })

      console.log(
        `[GPD] starting scan: mode=${scanSettings.scanMode}, threshold=${scanSettings.similarityThreshold}`
      )

      // Load cached media items for incremental fetch. Scoped scans avoid the
      // incremental cache so a year/month result cannot poison a later full scan.
      cachedMediaItemsRef.current = null
      let sinceTimestamp: number | undefined
      const sourceProvider = scanSettings.sourceProvider ?? "google"
      const dateRange = activeDateRange(scanSettings.dateRange)
      const batchLimit = providerBatchLimit(scanSettings)
      const albumScope =
        sourceProvider === "google"
          ? activeAlbumScope(scanSettings.albumScope)
          : undefined
      try {
        const stored = (await chrome.storage.local.get(
          "scanResults"
        )) as Partial<StoredState>
        const prev = stored.scanResults
        if (
          !dateRange &&
          !albumScope &&
          !batchLimit &&
          (prev?.sourceProvider ?? "google") === sourceProvider &&
          !prev?.dateRange &&
          !prev?.albumScope &&
          prev?.mediaItems &&
          Object.keys(prev.mediaItems).length > 0 &&
          prev.mediaItemsAreComplete !== false &&
          Object.keys(prev.mediaItems).length === prev.totalItems &&
          areScanResultsValid(prev, { accountEmail, sourceProvider })
        ) {
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
        provider: sourceProvider,
        args: {
          dateRange,
          albumScope,
          sinceTimestamp,
          limit: batchLimit
        }
      })
    },
    [
      settings,
      refreshTimeLimitedEntitlementForAction,
      openTrackedUpgradePrompt,
      trackEvent
    ]
  )

  const clearEmbeddingCache = useCallback(async (): Promise<number | null> => {
    let cache: EmbeddingCache | null = null
    try {
      cache = await EmbeddingCache.open()
      const before = await cache.count()
      await cache.clear()
      setCacheEntryCount(0)
      return before
    } finally {
      cache?.close()
    }
  }, [])

  const handleClearCache = useCallback(async () => {
    setCacheBusy(true)
    setCacheStatus(undefined)
    try {
      const removed = await clearEmbeddingCache()
      setCacheStatus(
        `Cleared ${(removed ?? 0).toLocaleString()} cached embedding${
          removed !== 1 ? "s" : ""
        }.`
      )
    } catch (error) {
      setCacheStatus(
        `Could not clear cache: ${error instanceof Error ? error.message : String(error)}`
      )
      await refreshEmbeddingCacheCount()
    } finally {
      setCacheBusy(false)
    }
  }, [clearEmbeddingCache, refreshEmbeddingCacheCount])

  const handleRebuildCache = useCallback(async () => {
    setCacheBusy(true)
    setCacheStatus(undefined)
    try {
      const removed = await clearEmbeddingCache()
      setCacheStatus(
        `Cleared ${(removed ?? 0).toLocaleString()} cached embedding${
          removed !== 1 ? "s" : ""
        }. Rebuilding on the next scan.`
      )
    } catch (error) {
      setCacheStatus(
        `Could not rebuild cache: ${error instanceof Error ? error.message : String(error)}`
      )
      setCacheBusy(false)
      await refreshEmbeddingCacheCount()
      return
    }
    setCacheBusy(false)
    handleStartScan()
  }, [clearEmbeddingCache, handleStartScan, refreshEmbeddingCacheCount])

  const handleExportCacheDiagnostics = useCallback(async () => {
    setCacheStatus(undefined)
    const currentState = stateRef.current
    const provider = settingsRef.current.sourceProvider ?? "google"
    const photoCount =
      currentState.status === "results" || currentState.status === "trashing"
        ? currentState.totalItems
        : currentState.status === "scanning"
          ? currentState.totalEstimate
          : undefined
    const duplicateGroupCount =
      currentState.status === "results" || currentState.status === "trashing"
        ? currentState.groups.length
        : currentState.status === "scanning"
          ? currentState.partialGroups?.length
          : undefined
    const report = buildSupportDiagnosticsReport({
      version: chrome.runtime.getManifest().version,
      provider,
      scanMode: settingsRef.current.scanMode,
      entitlement,
      photoCountBucket:
        photoCount !== undefined ? countBucket(photoCount) : undefined,
      duplicateGroupCountBucket:
        duplicateGroupCount !== undefined
          ? countBucket(duplicateGroupCount)
          : undefined,
      errorCategory:
        currentState.status === "disconnected"
          ? "connection"
          : reportError
            ? "report"
            : trashWarning
              ? "trash"
              : undefined,
      recentLogs: [cacheStatus, reportError, trashWarning].filter(
        (value): value is string => Boolean(value)
      )
    })
    downloadTextFile({
      filename: `${report.reportId}.json`,
      contents: JSON.stringify(report, null, 2),
      type: "application/json"
    })
    setCacheStatus("Exported redacted support diagnostics.")
  }, [cacheStatus, entitlement, reportError, trashWarning])

  const handleResumeScan = useCallback(() => {
    if (!resumeCheckpoint) return
    const currentState = stateRef.current
    const accountEmail =
      currentState.status === "connected" || currentState.status === "results"
        ? currentState.accountEmail
        : resumeCheckpoint.accountEmail

    if (
      !canResumeScanCheckpoint(resumeCheckpoint, {
        accountEmail,
        sourceProvider: settingsRef.current.sourceProvider
      })
    ) {
      clearResumeCheckpointState({
        checkpointRef: scanCheckpointRef,
        setResumeCheckpoint
      })
      return
    }
    if (!canResumeCheckpoint(resumeCheckpoint, entitlement)) {
      openTrackedUpgradePrompt(
        "resume",
        "This saved scan is above your current resume limit. Upgrade to resume large-library scans."
      )
      return
    }

    const checkpointItems = resumeCheckpoint.mediaItems
    if (checkpointItems && checkpointItems.length > 0) {
      const scanSettings = resumeCheckpoint.settings
      settingsRef.current = scanSettings
      setSettings(fullScanSettingsPatch(scanSettings))
      void chrome.storage.local.set({ settings: scanSettings })

      scanAbortRef.current?.abort()
      scanAbortRef.current = new AbortController()

      const requestId = generateRequestId()
      currentScanRequestIdRef.current = requestId
      const hasGptk =
        currentState.status === "connected" ? currentState.hasGptk : true

      const resumedCheckpoint = updateScanCheckpoint(
        {
          ...resumeCheckpoint,
          id: requestId,
          status: "active"
        },
        {
          phase: "downloading_thumbnails",
          itemsProcessed: 0,
          totalEstimate: checkpointItems.length,
          message: `Resuming duplicate detection for ${checkpointItems.length.toLocaleString()} fetched items...`
        }
      )
      scanCheckpointRef.current = resumedCheckpoint
      setResumeCheckpoint(null)
      void persistScanCheckpoint(resumedCheckpoint)

      dispatch({ type: "SCAN_STARTED", requestId, hasGptk, accountEmail })
      dispatch({ type: "SCAN_MEDIA_FETCHED", mediaItems: checkpointItems })
      runDuplicateDetection(
        checkpointItems,
        scanAbortRef.current.signal,
        requestId
      )
      return
    }
    handleStartScan(resumeCheckpoint.settings)
  }, [
    entitlement,
    handleStartScan,
    openTrackedUpgradePrompt,
    resumeCheckpoint,
    runDuplicateDetection
  ])

  const handleDismissResume = useCallback(() => {
    setResumeCheckpoint(null)
    scanCheckpointRef.current = null
    void clearScanCheckpoint()
  }, [])

  const handleTrash = useCallback(async () => {
    if (state.status !== "results") return
    const actionEntitlement = await refreshTimeLimitedEntitlementForAction()
    if (!actionEntitlement) return
    const unsupportedProvider = Object.values(state.mediaItems).find(
      (item) =>
        item.provider &&
        item.provider !== "google" &&
        item.provider !== "icloud" &&
        item.provider !== "amazon"
    )
    if (unsupportedProvider) {
      setTrashWarning(
        `Trash is not available for ${providerLabel(unsupportedProvider.provider)} yet. Review and export the duplicate report instead.`
      )
      return
    }

    const dedupKeys: string[] = []
    const mediaKeysToTrash: string[] = []
    for (const group of visibleGroups) {
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
    if (!canTrashCount(dedupKeys.length, actionEntitlement, trashMovesThisSession)) {
      const limit = getPlanLimits(actionEntitlement).maxTrashMovesPerSession
      const remaining =
        limit === "unlimited"
          ? "unlimited"
          : Math.max(0, limit - trashMovesThisSession).toLocaleString()
      openTrackedUpgradePrompt(
        "trash",
        `Your ${PLAN_LABELS[getEffectivePlanId(actionEntitlement)]} plan can move ${
          limit === "unlimited" ? "unlimited" : limit.toLocaleString()
        } item${limit === 1 ? "" : "s"} to Trash per session. You have ${remaining} remaining and selected ${dedupKeys.length.toLocaleString()}.`
      )
      return
    }
    trackEvent({
      name: "trash_attempted",
      photoCountBucket: countBucket(dedupKeys.length)
    })
    setTrashConfirmCount("")
    setTrashConfirm({ dedupKeys, mediaKeysToTrash })
  }, [
    state,
    selectedGroupIds,
    getKept,
    visibleGroups,
    refreshTimeLimitedEntitlementForAction,
    trashMovesThisSession,
    openTrackedUpgradePrompt,
    trackEvent
  ])

  const handleCloseTrashConfirm = useCallback(() => {
    setTrashConfirm(null)
    setTrashConfirmCount("")
  }, [])

  const handleTrashConfirmed = useCallback(async () => {
    if (!trashConfirm || state.status !== "results") return
    const { dedupKeys, mediaKeysToTrash } = trashConfirm
    setReportError(null)
    const trashProvider =
      mediaKeysToTrash
        .map((key) => state.mediaItems[key]?.provider)
        .find((provider): provider is NonNullable<typeof provider> =>
          Boolean(provider)
        ) ?? "google"

    const deleteReport = buildDeleteReport({
      groups: visibleGroups,
      mediaItems: state.mediaItems,
      selectedGroupIds,
      getKept,
      mediaKeysToTrash,
      trashBatchSize: TRASH_BATCH_SIZE
    })
    try {
      await persistDeleteReport(deleteReport)
      downloadDeleteReport(deleteReport)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setReportError(`Could not save the pre-trash report: ${message}`)
      return
    }

    handleCloseTrashConfirm()
    setTrashWarning(null)

    const requestId = generateRequestId()

    // Capture snapshot for undo
    preTrashSnapshotRef.current = {
      mediaItems: state.mediaItems,
      groups: state.groups,
      totalItems: state.totalItems
    }
    pendingDedupKeysRef.current = dedupKeys
    pendingMediaKeysToTrashRef.current = mediaKeysToTrash

    dispatch({
      type: "TRASH_STARTED",
      totalToTrash: dedupKeys.length,
      mediaItems: state.mediaItems,
      groups: state.groups,
      totalItems: state.totalItems
    })

    // iCloud trash needs each item's CPLAsset ref (recordName + changeTag +
    // zone) captured at scan time. Google/Amazon ignore this field.
    const icloudAssetRefs =
      trashProvider === "icloud"
        ? mediaKeysToTrash.map((key) => state.mediaItems[key]?.icloudAsset)
        : undefined

    sendToServiceWorker({
      app: APP_ID,
      action: "gptkCommand",
      command: "trashItems",
      requestId,
      provider: trashProvider,
      args: {
        dedupKeys,
        mediaKeysToTrash,
        batchSize: TRASH_BATCH_SIZE,
        batchPauseMs: TRASH_BATCH_PAUSE_MS,
        retryCount: TRASH_RETRY_COUNT,
        retryBackoffMs: TRASH_RETRY_BACKOFF_MS,
        ...(icloudAssetRefs ? { icloudAssetRefs } : {})
      }
    })
  }, [
    trashConfirm,
    state,
    selectedGroupIds,
    getKept,
    visibleGroups,
    handleCloseTrashConfirm
  ])

  const handlePauseScan = useCallback(() => {
    const checkpoint = scanCheckpointRef.current
    if (checkpoint?.status === "active") {
      const paused = updateScanCheckpoint(checkpoint, {
        status: "interrupted",
        message: "Scan paused. Resume to reuse completed cached embeddings."
      })
      scanCheckpointRef.current = paused
      setResumeCheckpoint(paused)
      void persistScanCheckpoint(paused)
    }
    scanAbortRef.current?.abort()
    currentScanRequestIdRef.current = null
    dispatch({ type: "SCAN_CANCELLED" })
  }, [])

  const handleReset = useCallback(() => {
    scanAbortRef.current?.abort()
    scanAbortRef.current = null
    currentScanRequestIdRef.current = null
    scanCheckpointRef.current = null
    cachedMediaItemsRef.current = null
    pendingSelectionsRef.current = null
    autoSelectNextResultsRef.current = false
    preTrashSnapshotRef.current = null
    pendingDedupKeysRef.current = null
    pendingMediaKeysToTrashRef.current = null
    pendingRestoreUndoRef.current = null
    pendingRestoreRequestIdRef.current = null
    setResumeCheckpoint(null)
    setSelectedGroupIds(new Set())
    setKeptOverrides({})
    setTrashConfirm(null)
    setTrashConfirmCount("")
    setTrashWarning(null)
    setTrashMovesThisSession(0)
    setReportError(null)
    setUndoData(null)
    void chrome.storage.local.remove([
      "scanResults",
      "selections",
      SCAN_CHECKPOINT_KEY
    ])
    dispatch({ type: "RESET" })
    healthCheckAttemptsRef.current = 0
    sendToServiceWorker({
      app: APP_ID,
      action: "healthCheck",
      provider: settingsRef.current.sourceProvider ?? "google"
    })
  }, [])

  const openProviderFromSidePanel = useCallback(
    async (provider: PhotoProvider): Promise<LaunchProviderResult> => {
      let hostTabId = sidePanelHostTabIdRef.current
      try {
        if (hostTabId === null && isSidePanel && chrome.tabs?.query) {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
          })
          if (
            activeTab?.id !== undefined &&
            !activeTab.url?.startsWith("chrome-extension://")
          ) {
            hostTabId = activeTab.id
            sidePanelHostTabIdRef.current = activeTab.id
          }
        }

        const result = await sendToServiceWorker<LaunchProviderResult>({
          app: APP_ID,
          action: "launchProvider",
          provider,
          hostTabId: hostTabId ?? undefined
        })
        if (result?.success && typeof result.tabId === "number") {
          sidePanelHostTabIdRef.current = result.tabId
        }
        return (
          result ?? {
            success: false,
            provider,
            error: `Chrome did not respond while opening ${providerLabel(provider)}. Try clicking the extension on the photo tab again.`
          }
        )
      } catch (error) {
        return {
          success: false,
          provider,
          error:
            error instanceof Error
              ? error.message
              : `Unable to open ${providerLabel(provider)}.`
        }
      }
    },
    [isSidePanel]
  )

  const handleOpenProvider = useCallback(
    (provider: PhotoProvider) => {
      setSidePanelSourceConfirmed(true)
      scanAbortRef.current?.abort()
      scanAbortRef.current = null
      currentScanRequestIdRef.current = null
      scanCheckpointRef.current = null
      cachedMediaItemsRef.current = null
      pendingSelectionsRef.current = null
      setResumeCheckpoint(null)
      setSelectedGroupIds(new Set())
      setKeptOverrides({})
      setSettings({
        sourceProvider: provider,
        albumScope:
          provider === "google" ? settingsRef.current.albumScope : undefined
      })
      void chrome.storage.local.remove([
        "scanResults",
        "selections",
        SCAN_CHECKPOINT_KEY
      ])
      dispatch({ type: "RESET" })
      healthCheckAttemptsRef.current = 0
      void openProviderFromSidePanel(provider).then((result) => {
        if (!result.success) {
          dispatch({
            type: "HEALTH_CHECK_RESULT",
            payload: {
              app: APP_ID,
              action: "healthCheck.result",
              success: false,
              hasGptk: false,
              provider,
              error: result.error
            }
          })
          return
        }
        window.setTimeout(
          () => {
            sendToServiceWorker({
              app: APP_ID,
              action: "healthCheck",
              provider
            })
          },
          result.alreadyOpen ? 250 : 900
        )
      })
    },
    [openProviderFromSidePanel]
  )

  const handleUndo = useCallback(() => {
    if (!undoData) return
    const requestId = generateRequestId()
    pendingRestoreUndoRef.current = undoData
    pendingRestoreRequestIdRef.current = requestId
    autoSelectNextResultsRef.current = false
    pendingSelectionsRef.current = {
      selectedGroupIds: new Set(),
      keptOverrides: {}
    }
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
      requestId,
      provider: undoData.provider,
      args: {
        dedupKeys: undoData.dedupKeys,
        ...(undoData.icloudAssetRefs
          ? { icloudAssetRefs: undoData.icloudAssetRefs }
          : {})
      }
    })
    setUndoData(null)
    setTrashWarning(null)
  }, [undoData])

  const handleUndoClose = useCallback(() => {
    setUndoData(null)
  }, [])

  // Fire confetti when trash completes
  useEffect(() => {
    if (!undoData) return
    if (prefersReducedMotion) return
    confetti({
      particleCount: 200,
      spread: 100,
      origin: { y: 0.7 }
    })
  }, [undoData, prefersReducedMotion])

  // Compute duplicate count for ActionBar
  const duplicateCount =
    state.status === "results"
      ? visibleGroups.reduce((sum, group) => {
          if (!selectedGroupIds.has(group.id)) return sum
          const keptSet = keptByGroupId.get(group.id)!
          return sum + group.mediaKeys.filter((k) => !keptSet.has(k)).length
        }, 0)
      : 0
  const workflowStage =
    state.status === "scanning"
      ? "scan"
      : state.status === "results"
        ? groups.length > 0
          ? "review"
          : "done"
        : state.status === "trashing"
          ? "trash"
          : "setup"
  const workflowTotalItems =
    state.status === "results" || state.status === "trashing"
      ? state.totalItems
      : state.status === "scanning"
        ? state.partialTotalItems ?? state.totalEstimate
        : 0
  const workflowGroups =
    state.status === "results" || state.status === "trashing"
      ? groups
      : state.status === "scanning"
        ? state.partialGroups ?? []
        : []
  const workflowExactGroupCount = workflowGroups.filter((group) => {
    if (group.duplicateKind === "exact" || group.duplicateKind === "similar") {
      return group.duplicateKind === "exact"
    }
    return (
      Object.keys(displayMediaItems).length > 0 &&
      classifyDuplicateGroup(group, displayMediaItems).duplicateKind === "exact"
    )
  }).length
  const workflowSimilarGroupCount =
    workflowGroups.length - workflowExactGroupCount
  const workflowDuplicateCount =
    state.status === "trashing"
      ? Math.max(0, state.totalToTrash - state.trashedSoFar)
      : duplicateCount
  const workflowScanDetail =
    state.status === "scanning"
      ? state.totalEstimate > 0
        ? `${state.itemsProcessed.toLocaleString()} of ${state.totalEstimate.toLocaleString()}`
        : `${state.itemsProcessed.toLocaleString()} checked`
      : undefined
  const showWorkflowRail =
    !isSidePanel ||
    state.status === "scanning" ||
    state.status === "results" ||
    state.status === "trashing"
  const sourceProvider = settings.sourceProvider ?? "google"
  const sidePanelHasConnection =
    state.status === "connected" ||
    state.status === "scanning" ||
    state.status === "results" ||
    state.status === "trashing"
  const sourceStepComplete = sidePanelSourceConfirmed || sidePanelHasConnection
  const scopeStepComplete =
    state.status === "scanning" ||
    state.status === "results" ||
    state.status === "trashing"
  const scanStepComplete =
    state.status === "results" || state.status === "trashing"
  const sidePanelBatchLimit = providerBatchLimit(settings, entitlement)
  const sidePanelScopeSummary = settings.albumScope?.title
    ? settings.albumScope.title
    : settings.albumScope?.mediaKey
      ? "Selected album"
      : sidePanelBatchLimit
        ? `${sidePanelBatchLimit.toLocaleString()} item test batch`
        : "Entire library"
  const sidePanelDuplicateSummary =
    groups.length > 0
      ? `${groups.length.toLocaleString()} duplicate set${
          groups.length === 1 ? "" : "s"
        }`
      : state.status === "results"
        ? "No duplicate sets"
        : "Review unlocks after scan"
  const sidePanelSteps: SidePanelStepItem[] = [
    {
      index: 1,
      title: "Source",
      description: "Confirm the selected library and open it in this window.",
      status: sourceStepComplete ? "complete" : "active",
      icon: <PhotoLibraryRoundedIcon sx={{ fontSize: 15 }} />,
      summary: providerLabel(sourceProvider)
    },
    {
      index: 2,
      title: "Sign in",
      description:
        "Open the provider tab, sign in, then verify the connection.",
      status: sidePanelHasConnection
        ? "complete"
        : sourceStepComplete
          ? "active"
          : "locked",
      icon: <LockOutlinedIcon sx={{ fontSize: 15 }} />,
      summary: `Connected to ${providerLabel(sourceProvider)}`
    },
    {
      index: 3,
      title: "Scope",
      description: "Choose exactly what the scan should inspect.",
      status: scopeStepComplete
        ? "complete"
        : state.status === "connected"
          ? "active"
          : "locked",
      icon: <CollectionsRoundedIcon sx={{ fontSize: 15 }} />,
      summary: sidePanelScopeSummary
    },
    {
      index: 4,
      title: "Scan",
      description: "Find possible duplicate photos and videos.",
      status: scanStepComplete
        ? "complete"
        : state.status === "scanning"
          ? "active"
          : "locked",
      icon: <SearchRoundedIcon sx={{ fontSize: 15 }} />,
      summary:
        state.status === "results"
          ? `${state.totalItems.toLocaleString()} items checked`
          : workflowScanDetail
    },
    {
      index: 5,
      title: "Review",
      description: "Choose what stays before anything moves to trash.",
      status:
        state.status === "results" || state.status === "trashing"
          ? "active"
          : "locked",
      icon: <DoneAllRoundedIcon sx={{ fontSize: 15 }} />,
      summary: sidePanelDuplicateSummary
    }
  ]

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {isSidePanel && (
        <GlobalStyles
          styles={{
            body: {
              background: `linear-gradient(180deg, ${photoSweepColors.canvasTop} 0%, ${photoSweepColors.canvasBottom} 100%)`,
              overflowX: "hidden"
            },
            "#__plasmo": {
              minWidth: 0
            }
          }}
        />
      )}

      {!isSidePanel && (
        <AppBar position="sticky" elevation={0}>
          <Toolbar sx={{ gap: 1 }}>
            <PhotoLibraryRoundedIcon color="primary" />
            <Typography
              variant="h6"
              fontWeight={800}
              noWrap
              sx={{
                flexGrow: 1,
                letterSpacing: 0
              }}>
              PhotoSweep
            </Typography>
            {"accountEmail" in state && state.accountEmail && (
              <Typography variant="body2" color="text.secondary" noWrap>
                Signed in as {state.accountEmail}
              </Typography>
            )}
          </Toolbar>
        </AppBar>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          maxWidth: isSidePanel
            ? "100%"
            : state.status === "results" && groups.length > 0
              ? 1500
              : 1200,
          mx: "auto",
          px: isSidePanel ? 1 : { xs: 2, md: 3 },
          py: isSidePanel ? 1 : { xs: 2, md: 3 },
          minHeight: isSidePanel ? "100vh" : "calc(100vh - 64px)",
          background: isSidePanel
            ? "transparent"
            : `linear-gradient(180deg, rgba(246,250,248,0), ${photoSweepColors.canvasBottom})`
        }}>
        {isSidePanel ? (
          <Box
            sx={{
              display: "grid",
              gap: 0.85,
              pb: 1
            }}>
            <SidePanelBrandHeader />

            <SidePanelSourceBar
              provider={sourceProvider}
              connected={sidePanelHasConnection}
              onProviderChange={handleOpenProvider}
            />

            <SidePanelTimelineProgress steps={sidePanelSteps} />

            <SidePanelTimelineStep
              index={1}
              title="Source"
              description="Confirm the selected library and open it in this window."
              status={sourceStepComplete ? "complete" : "active"}
              icon={<PhotoLibraryRoundedIcon sx={{ fontSize: 19 }} />}
              summary={providerLabel(sourceProvider)}>
              <Button
                variant="contained"
                fullWidth
                endIcon={<OpenInNewRoundedIcon />}
                onClick={() => handleOpenProvider(sourceProvider)}
                sx={{ minHeight: 42, borderRadius: 2, fontWeight: 850 }}>
                Continue
              </Button>
            </SidePanelTimelineStep>

            <SidePanelTimelineStep
              index={2}
              title="Sign in"
              description="Open the provider tab, sign in, then verify the connection."
              status={
                sidePanelHasConnection
                  ? "complete"
                  : sourceStepComplete
                    ? "active"
                    : "locked"
              }
              icon={<LockOutlinedIcon sx={{ fontSize: 19 }} />}
              summary={`Connected to ${providerLabel(sourceProvider)}`}>
              {state.status === "disconnected" && (
                <Alert severity="warning" sx={{ py: 0.6 }}>
                  {state.error}
                </Alert>
              )}
              {state.status === "connecting" && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    color: "text.secondary"
                  }}>
                  <CircularProgress size={16} thickness={5} />
                  <Typography variant="body2">
                    Checking the open {providerLabel(sourceProvider)} tab...
                  </Typography>
                </Box>
              )}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1
                }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<OpenInNewRoundedIcon />}
                  onClick={() => handleOpenProvider(sourceProvider)}
                  sx={{ fontWeight: 800 }}>
                  Open
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon />}
                  onClick={handleReset}
                  sx={{ fontWeight: 800 }}>
                  Retry
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                This step must pass before scan controls unlock.
              </Typography>
            </SidePanelTimelineStep>

            <SidePanelTimelineStep
              index={3}
              title="Scope"
              description="Choose exactly what the scan should inspect."
              status={
                scopeStepComplete
                  ? "complete"
                  : state.status === "connected"
                    ? "active"
                    : "locked"
              }
              icon={<CollectionsRoundedIcon sx={{ fontSize: 19 }} />}
              summary={sidePanelScopeSummary}>
              {state.status === "connected" && (
                <ScanConfig
                  settings={settings}
                  onSettingsChange={setSettings}
                  onStartScan={handleStartScan}
                  onOpenProvider={handleOpenProvider}
                  onResumeScan={handleResumeScan}
                  onDismissResume={handleDismissResume}
                  onClearCache={handleClearCache}
                  onRebuildCache={handleRebuildCache}
                  onExportCacheDiagnostics={handleExportCacheDiagnostics}
                  hasGptk={state.hasGptk}
                  cacheEntryCount={cacheEntryCount}
                  cacheStatus={cacheStatus}
                  cacheBusy={cacheBusy}
                  resumeCheckpoint={resumeCheckpoint}
                  albums={albums}
                  albumsLoading={albumsLoading}
                  albumsError={albumsError}
                  onRefreshAlbums={() => requestAlbums(state.accountEmail)}
                  entitlement={entitlement}
                  onUpgrade={(detail) => openTrackedUpgradePrompt("scan", detail)}
                  compact
                />
              )}
            </SidePanelTimelineStep>

            <SidePanelTimelineStep
              index={4}
              title="Scan"
              description="Find possible duplicate photos and videos."
              status={
                scanStepComplete
                  ? "complete"
                  : state.status === "scanning"
                    ? "active"
                    : "locked"
              }
              icon={<SearchRoundedIcon sx={{ fontSize: 19 }} />}
              summary={
                state.status === "results"
                  ? `${state.totalItems.toLocaleString()} items checked`
                  : workflowScanDetail
              }>
              {state.status === "scanning" && (
                <>
                  <ScanProgress
                    phase={state.phase}
                    itemsProcessed={state.itemsProcessed}
                    totalEstimate={state.totalEstimate}
                    message={state.message}
                    onPause={handlePauseScan}
                    compact
                  />
                  {provisionalGroups.length > 0 && (
                    <Alert severity="info" sx={{ py: 0.65 }}>
                      Showing possible sets while the scan continues. Cleanup
                      unlocks after the scan completes.
                    </Alert>
                  )}
                </>
              )}
            </SidePanelTimelineStep>

            <SidePanelTimelineStep
              index={5}
              title="Review"
              description="Choose what stays before anything moves to trash."
              status={
                state.status === "results" || state.status === "trashing"
                  ? "active"
                  : "locked"
              }
              icon={<DoneAllRoundedIcon sx={{ fontSize: 19 }} />}
              summary={sidePanelDuplicateSummary}>
              {state.status === "results" &&
                groups.length === 0 &&
                storageChecked && (
                  <Box sx={{ display: "grid", gap: 1 }}>
                    <Typography variant="body2" fontWeight={800}>
                      No duplicates found
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Try Full scan or a wider time window if you expect
                      reuploads saved far apart.
                    </Typography>
                    <Button variant="outlined" onClick={handleReset}>
                      Change scan settings
                    </Button>
                  </Box>
                )}
              {state.status === "results" && groups.length > 0 && (
                <>
                  <ActionBar
                    totalItems={state.totalItems}
                    groupCount={visibleGroups.length}
                    totalGroupCount={groups.length}
                    exactGroupCount={exactGroupCount}
                    similarGroupCount={similarGroupCount}
                    duplicateCount={duplicateCount}
                    reviewFilter={reviewFilter}
                    onReviewFilterChange={setReviewFilter}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                    onTrash={handleTrash}
                    onRescan={handleReset}
                    onExportJson={handleExportJson}
                    onExportCsv={handleExportCsv}
                    onApplyKeepStrategy={handleApplyKeepStrategy}
                    compact
                  />
                  {lockedGroupCount > 0 && (
                    <Alert severity="info" sx={{ mb: 1, py: 0.65 }}>
                      {lockedGroupCount.toLocaleString()} more duplicate set
                      {lockedGroupCount === 1 ? "" : "s"} found. Upgrade to
                      review and clean the full scan.
                    </Alert>
                  )}
                  <DuplicateGroups
                    groups={visibleGroups}
                    mediaItems={displayMediaItems}
                    selectedGroupIds={selectedGroupIds}
                    onToggleGroup={handleToggleGroup}
                    keptByGroupId={keptByGroupId}
                    onToggleKept={handleToggleKept}
                    onTrashAll={handleTrashAllCopies}
                    compact
                  />
                </>
              )}
              {state.status === "trashing" && (
                <Box sx={{ display: "grid", gap: 1 }}>
                  <Typography variant="body2" fontWeight={800}>
                    Moving to trash
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {state.trashedSoFar > 0
                      ? `${state.trashedSoFar.toLocaleString()} of ${state.totalToTrash.toLocaleString()} moved`
                      : "Starting..."}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={
                      state.totalToTrash > 0
                        ? (state.trashedSoFar / state.totalToTrash) * 100
                        : 0
                    }
                  />
                </Box>
              )}
            </SidePanelTimelineStep>

            <SidePanelSafetyFooter />
          </Box>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 2.5,
              alignItems: "flex-start"
            }}>
            {showWorkflowRail && (
              <WorkflowRail
                stage={workflowStage}
                totalItems={workflowTotalItems}
                totalGroupCount={workflowGroups.length}
                exactGroupCount={workflowExactGroupCount}
                similarGroupCount={workflowSimilarGroupCount}
                duplicateCount={workflowDuplicateCount}
                scanDetail={workflowScanDetail}
                onRescan={handleReset}
              />
            )}

            <Box sx={{ minWidth: 0, flex: 1, width: "100%" }}>
              {state.status === "connecting" && (
                <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
                  <CircularProgress disableShrink />
                </Box>
              )}

              {state.status === "disconnected" && (
                <SidePanelConnectionSetup
                  selectedProvider={settings.sourceProvider ?? "google"}
                  onOpenProvider={handleOpenProvider}
                  onRetry={handleReset}
                  error={state.error}
                />
              )}

              {state.status === "connected" && (
                <ScanConfig
                  settings={settings}
                  onSettingsChange={setSettings}
                  onStartScan={handleStartScan}
                  onOpenProvider={handleOpenProvider}
                  onResumeScan={handleResumeScan}
                  onDismissResume={handleDismissResume}
                  onClearCache={handleClearCache}
                  onRebuildCache={handleRebuildCache}
                  onExportCacheDiagnostics={handleExportCacheDiagnostics}
                  hasGptk={state.hasGptk}
                  cacheEntryCount={cacheEntryCount}
                  cacheStatus={cacheStatus}
                  cacheBusy={cacheBusy}
                  resumeCheckpoint={resumeCheckpoint}
                  albums={albums}
                  albumsLoading={albumsLoading}
                  albumsError={albumsError}
                  onRefreshAlbums={() => requestAlbums(state.accountEmail)}
                  entitlement={entitlement}
                  onUpgrade={(detail) => openTrackedUpgradePrompt("scan", detail)}
                  compact={isSidePanel}
                />
              )}

              {state.status === "scanning" && (
                <>
                  <ScanProgress
                    phase={state.phase}
                    itemsProcessed={state.itemsProcessed}
                    totalEstimate={state.totalEstimate}
                    message={state.message}
                    onPause={handlePauseScan}
                  />
                  {provisionalGroups.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        Showing possible duplicate sets while the scan
                        continues. Trash actions unlock after the scan
                        completes.
                      </Alert>
                      <DuplicateGroups
                        groups={provisionalGroups}
                        mediaItems={displayMediaItems}
                        selectedGroupIds={new Set()}
                        onToggleGroup={() => {}}
                        keptByGroupId={keptByGroupId}
                        onToggleKept={() => {}}
                        onTrashAll={() => {}}
                        readOnly
                        heading={`${provisionalGroups.length} Possible Duplicate Set${provisionalGroups.length !== 1 ? "s" : ""}`}
                      />
                    </Box>
                  )}
                </>
              )}

              {state.status === "results" &&
                groups.length === 0 &&
                storageChecked && (
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
                    <Typography variant="body2" color="text.secondary">
                      For reuploads or copies taken years apart, use Full scan
                      and move match sensitivity toward More matches.
                    </Typography>
                    <Button variant="contained" onClick={handleReset}>
                      Change scan settings
                    </Button>
                  </Box>
                )}

              {state.status === "results" && groups.length > 0 && (
                <>
                  <ActionBar
                    totalItems={state.totalItems}
                    groupCount={visibleGroups.length}
                    totalGroupCount={groups.length}
                    exactGroupCount={exactGroupCount}
                    similarGroupCount={similarGroupCount}
                    duplicateCount={duplicateCount}
                    reviewFilter={reviewFilter}
                    onReviewFilterChange={setReviewFilter}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                    onTrash={handleTrash}
                    onRescan={handleReset}
                    onExportJson={handleExportJson}
                    onExportCsv={handleExportCsv}
                    onApplyKeepStrategy={handleApplyKeepStrategy}
                    compact={isSidePanel}
                  />
                  {lockedGroupCount > 0 && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {lockedGroupCount.toLocaleString()} more duplicate set
                      {lockedGroupCount === 1 ? "" : "s"} found. Upgrade to
                      review and clean the full scan.
                    </Alert>
                  )}
                  <DuplicateGroups
                    groups={visibleGroups}
                    mediaItems={displayMediaItems}
                    selectedGroupIds={selectedGroupIds}
                    onToggleGroup={handleToggleGroup}
                    keptByGroupId={keptByGroupId}
                    onToggleKept={handleToggleKept}
                    onTrashAll={handleTrashAllCopies}
                    compact={isSidePanel}
                  />
                </>
              )}

              {state.status === "trashing" && (
                <Box sx={{ maxWidth: 480, mx: "auto", p: 4 }}>
                  <Typography variant="h5" fontWeight={600} gutterBottom>
                    Moving to Trash
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 2
                    }}>
                    <CircularProgress size={14} thickness={5} />
                    <Typography variant="body2" color="text.secondary">
                      {state.trashedSoFar > 0
                        ? `${state.trashedSoFar.toLocaleString()} of ${state.totalToTrash.toLocaleString()} moved`
                        : "Starting..."}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={
                      state.totalToTrash > 0
                        ? (state.trashedSoFar / state.totalToTrash) * 100
                        : 0
                    }
                  />
                </Box>
              )}
              {isSidePanel && state.status !== "trashing" && (
                <Box
                  sx={{
                    mt: 1,
                    px: 1,
                    py: 1.25,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    bgcolor: photoSweepColors.surface,
                    display: "grid",
                    gap: 0.35
                  }}>
                  <Typography
                    variant="caption"
                    fontWeight={800}
                    color="success.dark">
                    Safe cleanup
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Matching runs locally. Confirmed items move to provider
                    Trash and a report is saved before cleanup.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <UpgradeDialog
        open={!!upgradePrompt}
        reason={upgradePrompt?.reason ?? "groups"}
        detail={upgradePrompt?.detail}
        onClose={() => setUpgradePrompt(null)}
        onChoosePlan={handleChooseUpgradePlan}
        onRefreshLicense={handleRefreshEntitlement}
        onRecoverLicense={handleRecoverLicense}
      />

      <RatingPromptDialog
        open={ratingPromptOpen}
        onReview={() => {
          setRatingPromptOpen(false)
          void completeRatingPrompt()
          void chrome.tabs.create({
            url: chromeWebStoreReviewUrl(chrome.runtime.id)
          })
        }}
        onFeedback={() => {
          setRatingPromptOpen(false)
          void completeRatingPrompt()
          void chrome.tabs.create({
            url: "mailto:pawsitivegames@gmail.com?subject=PhotoSweep%20feedback"
          })
        }}
        onLater={() => {
          setRatingPromptOpen(false)
          void deferRatingPrompt()
        }}
        onNever={() => {
          setRatingPromptOpen(false)
          void completeRatingPrompt()
        }}
      />

      {/* Trash confirm dialog */}
      <Dialog
        open={!!trashConfirm}
        onClose={handleCloseTrashConfirm}
        fullWidth
        maxWidth="xs"
        slotProps={{
          backdrop: {
            sx: {
              bgcolor: "rgba(23, 32, 28, 0.34)",
              backdropFilter: "blur(3px)"
            }
          },
          paper: {
            sx: {
              m: isSidePanel ? 1.5 : 3,
              borderRadius: 2.5,
              border: "1px solid",
              borderColor: photoSweepColors.border,
              bgcolor: photoSweepColors.surface,
              backgroundColor: photoSweepColors.surface,
              boxShadow: `0 24px 70px rgba(23, 32, 28, 0.22)`
            }
          }
        }}>
        <DialogTitle>Move to Trash</DialogTitle>
        <DialogContent>
          {reportError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {reportError}
            </Alert>
          )}
          <DialogContentText>
            Move {trashConfirm?.dedupKeys.length} duplicate
            {trashConfirm?.dedupKeys.length !== 1 ? "s" : ""} to trash? You can
            restore them from the {providerLabel(settings.sourceProvider)}{" "}
            trash. A JSON audit report will be saved before anything is moved.
            Items are moved in batches of {TRASH_BATCH_SIZE}.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label={`Type ${trashConfirm?.dedupKeys.length ?? 0} to confirm`}
            value={trashConfirmCount}
            onChange={(event) => setTrashConfirmCount(event.target.value)}
            inputProps={{
              inputMode: "numeric",
              pattern: "[0-9]*"
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTrashConfirm}>Cancel</Button>
          <Button
            onClick={handleTrashConfirmed}
            variant="contained"
            color="error"
            disabled={
              trashConfirmCount !== String(trashConfirm?.dedupKeys.length ?? "")
            }>
            Move to Trash
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo trash snackbar */}
      <Snackbar
        open={!!undoData && !trashWarning}
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

      <Snackbar
        open={!!trashWarning}
        autoHideDuration={null}
        onClose={() => setTrashWarning(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={trashWarning ?? ""}
        action={
          <>
            {undoData && (
              <Button color="secondary" size="small" onClick={handleUndo}>
                Undo moved items
              </Button>
            )}
            <IconButton
              size="small"
              color="inherit"
              onClick={() => setTrashWarning(null)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      />
    </ThemeProvider>
  )
}
