import CloudQueueRoundedIcon from "@mui/icons-material/CloudQueueRounded"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded"
import PhotoLibraryRoundedIcon from "@mui/icons-material/PhotoLibraryRounded"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded"
import Accordion from "@mui/material/Accordion"
import AccordionDetails from "@mui/material/AccordionDetails"
import AccordionSummary from "@mui/material/AccordionSummary"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import MenuItem from "@mui/material/MenuItem"
import Paper from "@mui/material/Paper"
import Slider from "@mui/material/Slider"
import Stack from "@mui/material/Stack"
import TextField from "@mui/material/TextField"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"

import { FULL_SCAN_BLOCK_SIZE } from "../lib/duplicate-detector"
import {
  canUsePaidProvider,
  canUseScanMode,
  getEffectivePlanId,
  getEstimatedScanCount,
  getScanGate,
  isFreeIcloudPlan,
  PLAN_LABELS,
  scanSettingsForEntitlement,
  type Entitlement
} from "../lib/entitlement"
import {
  getProviderOperations,
  providerBatchLimit,
  providerLabel
} from "../lib/provider-operations"
import type { ScanCheckpoint } from "../lib/scan-checkpoint"
import {
  describeScanCheckpointResume,
  summarizeScanCheckpoint
} from "../lib/scan-checkpoint"
import { photoSweepColors } from "../lib/theme"
import type { GpdAlbum, PhotoProvider, ScanSettings } from "../lib/types"

function formatWindow(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${Math.round(sec / 3600)}h`
  if (sec < 604800) return `${Math.round(sec / 86400)}d`
  return `${Math.round(sec / 604800)}w`
}

function isDateRangeInvalid(settings: ScanSettings): boolean {
  const from = settings.dateRange?.from
  const to = settings.dateRange?.to
  return !!(from && to && from > to)
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function recommendedFirstScanDateRange(
  now = new Date()
): NonNullable<ScanSettings["dateRange"]> {
  const from = new Date(now)
  from.setDate(from.getDate() - 29)
  return {
    from: dateInputValue(from),
    to: dateInputValue(now)
  }
}

function providerHelpText(provider: ScanSettings["sourceProvider"]): string {
  if (provider === "icloud") {
    return "Scan iCloud Photos through the signed-in web session. Free users can review scoped Smart scans; paid plans can use test batches before moving items to Recently Deleted."
  }
  if (provider === "amazon") {
    return "Scan Amazon Photos through the signed-in web session. Free and paid limits match the Google Photos workflow."
  }
  return "Best for full duplicate cleanup. You can scan the whole timeline, an album, or a date range, then move duplicates to Google Photos trash."
}

function compactScopeLabel(provider: ScanSettings["sourceProvider"]): string {
  if (provider === "icloud") return "iCloud Photos library"
  if (provider === "amazon") return "Amazon Photos library"
  return "Entire library timeline"
}

function compactScopeHelp(provider: ScanSettings["sourceProvider"]): string {
  if (provider === "icloud") return "Reads the connected iCloud Photos tab."
  if (provider === "amazon") return "Reads the connected Amazon Photos tab."
  return "Choose an album or scan the full timeline."
}

interface ScanConfigProps {
  settings: ScanSettings
  onSettingsChange: (settings: Partial<ScanSettings>) => void
  onStartScan: (settingsOverride?: ScanSettings) => void
  onOpenProvider?: (provider: PhotoProvider) => void
  onResumeScan?: () => void
  onDismissResume?: () => void
  onClearCache: () => void
  onRebuildCache: () => void
  onExportCacheDiagnostics: () => void
  hasGptk: boolean
  cacheEntryCount: number | null
  cacheStatus?: string
  cacheBusy?: boolean
  resumeCheckpoint?: ScanCheckpoint | null
  albums?: GpdAlbum[]
  albumsLoading?: boolean
  albumsError?: string | null
  onRefreshAlbums?: () => void
  entitlement?: Entitlement
  onUpgrade?: (detail?: string) => void
  compact?: boolean
}

export function ScanConfig({
  settings,
  onSettingsChange,
  onStartScan,
  onOpenProvider,
  onResumeScan,
  onDismissResume,
  onClearCache,
  onRebuildCache,
  onExportCacheDiagnostics,
  hasGptk,
  cacheEntryCount,
  cacheStatus,
  cacheBusy = false,
  resumeCheckpoint,
  albums = [],
  albumsLoading = false,
  albumsError = null,
  onRefreshAlbums,
  entitlement,
  onUpgrade,
  compact = false
}: ScanConfigProps) {
  const dateRangeInvalid = isDateRangeInvalid(settings)
  const albumLabel = settings.albumScope?.title || settings.albumScope?.mediaKey
  const sourceProvider = settings.sourceProvider ?? "google"
  const isIcloud = sourceProvider === "icloud"
  const isAmazon = sourceProvider === "amazon"
  const supportsAlbumScope =
    getProviderOperations(sourceProvider).supportsAlbumScope
  const entitlementSettings = scanSettingsForEntitlement(settings, entitlement)
  const batchLimit = providerBatchLimit(entitlementSettings)
  const freeIcloudPlan = isFreeIcloudPlan(settings, entitlement)
  const libraryAreaValueLabel = albumLabel || compactScopeLabel(sourceProvider)
  const hasScanScope = Boolean(
    settings.albumScope || settings.dateRange?.from || settings.dateRange?.to
  )
  const useRecommendedFirstScope =
    settings.scanMode === "smart" && !hasScanScope && !batchLimit
  const recommendedDateRange = recommendedFirstScanDateRange()
  const startSettings = useRecommendedFirstScope
    ? { ...settings, dateRange: recommendedDateRange }
    : settings
  const showUnscopedFullScanWarning =
    settings.scanMode === "full" && !hasScanScope
  const startEntitlementSettings = scanSettingsForEntitlement(
    startSettings,
    entitlement
  )
  const estimatedScanCount = getEstimatedScanCount(startEntitlementSettings)
  const scanGate = getScanGate(
    startEntitlementSettings,
    estimatedScanCount,
    entitlement
  )
  const fullScanAllowed = canUseScanMode("full", entitlement)
  const planName = PLAN_LABELS[getEffectivePlanId(entitlement)]
  const providerPaidSupported = canUsePaidProvider(sourceProvider, entitlement)
  if (!hasGptk && sourceProvider === "google") {
    if (compact) {
      return (
        <Box sx={{ maxWidth: "100%", mx: "auto" }}>
          <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
            Google Photos is not connected. Sign in, wait for your library to
            load, then retry.
          </Alert>
        </Box>
      )
    }
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", p: compact ? 1 : 4 }}>
        <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
          {isIcloud
            ? "iCloud Photos is not connected. Please open icloud.com/photos, sign in, and try again."
            : isAmazon
              ? "Amazon Photos is not connected. Please open Amazon Photos on your Amazon country site, sign in, and try again."
              : "GPTK is not loaded on the Google Photos page. Please reload photos.google.com and try again."}
        </Alert>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        maxWidth: compact ? "100%" : 900,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
        overflow: compact ? "hidden" : "visible",
        mx: "auto",
        py: compact ? 0 : { xs: 2, md: 6 },
        ...(compact
          ? {
              "&, & *": {
                boxSizing: "border-box"
              }
            }
          : {})
      }}>
      <Paper
        elevation={0}
        sx={{
          p: compact ? 0 : { xs: 2.5, md: 4 },
          minWidth: 0,
          maxWidth: "100%",
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid",
          borderColor: compact ? "transparent" : "rgba(214,226,221,0.9)",
          borderRadius: compact ? 2 : 3,
          bgcolor: compact ? "transparent" : photoSweepColors.surfaceTint,
          backdropFilter: compact ? "none" : "saturate(180%) blur(22px)",
          boxShadow: compact ? "none" : `0 24px 70px ${photoSweepColors.shadow}`
        }}>
        {!compact && (
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 3,
              mb: 3,
              alignItems: { md: "center" }
            }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 3,
                background: `linear-gradient(135deg, ${photoSweepColors.primarySoft} 0%, ${photoSweepColors.successSoft} 100%)`,
                color: "primary.main",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                boxShadow: `inset 0 0 0 1px ${photoSweepColors.primaryShadow}`
              }}>
              <PhotoLibraryRoundedIcon />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" fontWeight={800} gutterBottom>
                Find duplicates from your photo library
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pick the source, choose the part of the library to check, then
                review what should stay before anything moves to trash.
              </Typography>
            </Box>
          </Box>
        )}

        {resumeCheckpoint && (
          <Alert
            severity={resumeCheckpoint.status === "error" ? "warning" : "info"}
            sx={{ mb: 2 }}
            action={
              onDismissResume && (
                <Button color="inherit" size="small" onClick={onDismissResume}>
                  Dismiss
                </Button>
              )
            }>
            Previous {summarizeScanCheckpoint(resumeCheckpoint)} stopped during{" "}
            {resumeCheckpoint.phase.replace(/_/g, " ")}.{" "}
            {describeScanCheckpointResume(resumeCheckpoint)}
          </Alert>
        )}

        {resumeCheckpoint && onResumeScan && (
          <Button
            variant="outlined"
            fullWidth
            size="large"
            onClick={onResumeScan}
            disabled={dateRangeInvalid}
            sx={{ mb: 2 }}>
            Continue previous scan
          </Button>
        )}

        {!compact && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              borderColor: "rgba(214,226,221,0.86)",
              bgcolor: photoSweepColors.surfaceSoft
            }}>
            <Stack
              direction="column"
              spacing={2}
              alignItems={{ xs: "stretch", md: "center" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary">
                  Step 1
                </Typography>
                <Typography variant="subtitle1" fontWeight={700}>
                  Choose your photo library
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {providerHelpText(sourceProvider)}
                </Typography>
              </Box>
              <Box sx={{ minWidth: 0, width: "100%" }}>
                <ToggleButtonGroup
                  value={sourceProvider}
                  exclusive
                  size="small"
                  fullWidth
                  aria-label="Photo source"
                  onChange={(_, value) => {
                    if (value !== null) {
                      const provider = value as PhotoProvider
                      onSettingsChange({
                        sourceProvider: provider,
                        albumScope:
                          provider === "google"
                            ? settings.albumScope
                            : undefined
                      })
                    }
                  }}>
                  <ToggleButton value="google">Google Photos</ToggleButton>
                  <ToggleButton value="icloud">iCloud Photos</ToggleButton>
                  <ToggleButton value="amazon">Amazon Photos</ToggleButton>
                </ToggleButtonGroup>
                <Button
                  href={
                    onOpenProvider
                      ? undefined
                      : getProviderOperations(sourceProvider).openUrl()
                  }
                  target={onOpenProvider ? undefined : "_blank"}
                  rel={onOpenProvider ? undefined : "noopener noreferrer"}
                  size="small"
                  startIcon={<OpenInNewRoundedIcon />}
                  onClick={(event) => {
                    if (!onOpenProvider) return
                    event.preventDefault()
                    onOpenProvider(sourceProvider)
                  }}
                  sx={{ mt: 1 }}>
                  Open {providerLabel(sourceProvider)}
                </Button>
              </Box>
            </Stack>
          </Paper>
        )}

        <Paper
          variant="outlined"
          sx={{
            p: compact ? 0 : 2,
            mb: compact ? 0.75 : 2,
            minWidth: 0,
            maxWidth: "100%",
            width: "100%",
            boxSizing: "border-box",
            borderRadius: compact ? 1.5 : 2,
            borderColor: compact ? "transparent" : "rgba(214,226,221,0.86)",
            bgcolor: compact ? "transparent" : photoSweepColors.surfaceSoft
          }}>
          {!compact && (
            <>
              <Typography variant="overline" color="text.secondary">
                Step 2
              </Typography>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Choose what to check
              </Typography>
            </>
          )}
          {compact ? (
            <>
              <TextField
                select={supportsAlbumScope}
                size="small"
                fullWidth
                value={
                  supportsAlbumScope
                    ? settings.albumScope?.mediaKey ?? ""
                    : compactScopeLabel(sourceProvider)
                }
                InputLabelProps={{ shrink: true }}
                SelectProps={
                  supportsAlbumScope
                    ? {
                        inputProps: { "aria-label": "Library area" },
                        displayEmpty: true,
                        renderValue: (value) =>
                          value
                            ? libraryAreaValueLabel
                            : compactScopeLabel(sourceProvider)
                      }
                    : undefined
                }
                InputProps={supportsAlbumScope ? undefined : { readOnly: true }}
                inputProps={
                  supportsAlbumScope
                    ? undefined
                    : { "aria-label": "Library area" }
                }
                helperText={undefined}
                sx={{
                  "& .MuiInputBase-root": {
                    minHeight: 42,
                    borderRadius: 1.5
                  },
                  "& .MuiSelect-select, & .MuiInputBase-input": {
                    py: 1.15,
                    fontSize: 14.5,
                    lineHeight: 1.2
                  },
                  "& .MuiFormLabel-root": {
                    fontSize: 12,
                    fontWeight: 700
                  },
                  "& .MuiFormHelperText-root": {
                    display: "none"
                  }
                }}
                onChange={(event) => {
                  if (!supportsAlbumScope) return
                  const mediaKey = event.target.value
                  if (!mediaKey) {
                    onSettingsChange({ albumScope: undefined })
                    return
                  }
                  const album = albums.find((a) => a.mediaKey === mediaKey)
                  onSettingsChange({
                    albumScope: {
                      mediaKey,
                      title: album?.title,
                      itemCount: album?.itemCount,
                      isShared: album?.isShared
                    }
                  })
                }}>
                {supportsAlbumScope && (
                  <MenuItem value="">Entire library timeline</MenuItem>
                )}
                {supportsAlbumScope &&
                  albums.map((album) => (
                    <MenuItem key={album.mediaKey} value={album.mediaKey}>
                      {album.title}
                      {album.itemCount !== undefined
                        ? ` (${album.itemCount.toLocaleString()})`
                        : ""}
                      {album.isShared ? " - shared" : ""}
                    </MenuItem>
                  ))}
              </TextField>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 0.7,
                  gap: 1,
                  minWidth: 0
                }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                  title={albumsError || undefined}>
                  {supportsAlbumScope
                    ? albumsLoading
                      ? "Loading albums..."
                      : albumsError
                        ? "Albums unavailable"
                        : compactScopeHelp(sourceProvider)
                    : compactScopeHelp(sourceProvider)}
                </Typography>
                {supportsAlbumScope && onRefreshAlbums && (
                  <Button
                    size="small"
                    disabled={albumsLoading}
                    onClick={onRefreshAlbums}
                    sx={{
                      minHeight: 26,
                      minWidth: 0,
                      px: 0.5,
                      fontSize: 12,
                      fontWeight: 800,
                      whiteSpace: "nowrap"
                    }}>
                    Refresh
                  </Button>
                )}
              </Box>
            </>
          ) : supportsAlbumScope ? (
            <>
              <TextField
                select
                label="Library area"
                size="small"
                fullWidth
                value={settings.albumScope?.mediaKey ?? ""}
                InputLabelProps={{ shrink: true }}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (value) =>
                    value ? libraryAreaValueLabel : "Entire library timeline"
                }}
                helperText={
                  compact
                    ? undefined
                    : albumLabel
                      ? `Only checking ${albumLabel}.`
                      : "Check your full Google Photos timeline, or narrow this to one album."
                }
                sx={
                  compact
                    ? {
                        "& .MuiInputBase-root": {
                          minHeight: 42,
                          borderRadius: 1.5
                        },
                        "& .MuiSelect-select": {
                          py: 1.15,
                          fontSize: 14.5,
                          lineHeight: 1.2
                        },
                        "& .MuiFormLabel-root": {
                          fontSize: 12,
                          fontWeight: 700
                        },
                        "& .MuiFormHelperText-root": {
                          display: "none",
                          mx: 0,
                          mt: 0.7,
                          fontSize: 12,
                          lineHeight: 1.35
                        }
                      }
                    : undefined
                }
                onChange={(event) => {
                  const mediaKey = event.target.value
                  if (!mediaKey) {
                    onSettingsChange({ albumScope: undefined })
                    return
                  }
                  const album = albums.find((a) => a.mediaKey === mediaKey)
                  onSettingsChange({
                    albumScope: {
                      mediaKey,
                      title: album?.title,
                      itemCount: album?.itemCount,
                      isShared: album?.isShared
                    }
                  })
                }}>
                <MenuItem value="">Entire library timeline</MenuItem>
                {albums.map((album) => (
                  <MenuItem key={album.mediaKey} value={album.mediaKey}>
                    {album.title}
                    {album.itemCount !== undefined
                      ? ` (${album.itemCount.toLocaleString()})`
                      : ""}
                    {album.isShared ? " - shared" : ""}
                  </MenuItem>
                ))}
              </TextField>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: compact ? 0.75 : 1,
                  gap: 1,
                  minWidth: 0
                }}>
                {!compact && (
                  <Typography variant="caption" color="text.secondary">
                    {albumsLoading
                      ? "Loading albums..."
                      : albumsError
                        ? albumsError
                        : `${albums.length.toLocaleString()} album${
                            albums.length !== 1 ? "s" : ""
                          } available.`}
                  </Typography>
                )}
                {onRefreshAlbums && (
                  <Button
                    size="small"
                    disabled={albumsLoading}
                    onClick={onRefreshAlbums}
                    sx={
                      compact
                        ? {
                            ml: "auto",
                            minHeight: 26,
                            minWidth: 0,
                            px: 0.5,
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: "nowrap"
                          }
                        : undefined
                    }>
                    Refresh albums
                  </Button>
                )}
              </Box>
            </>
          ) : (
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <CloudQueueRoundedIcon color="primary" sx={{ mt: 0.25 }} />
              <Box>
                <Typography variant="body2">
                  {isIcloud
                    ? "The scan reads iCloud Photos items from the connected tab."
                    : "The scan reads Amazon Photos items from the connected Canada tab."}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {isIcloud
                    ? "Leave iCloud Photos open and signed in while the extension collects items."
                    : "Leave Amazon Photos open and signed in while the extension pages through the library."}
                </Typography>
              </Box>
            </Stack>
          )}
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            p: compact ? 1 : 2,
            mb: compact ? 0.75 : 2,
            borderRadius: compact ? 1.5 : 2,
            borderColor: "rgba(214,226,221,0.86)",
            bgcolor: compact
              ? "rgba(255,255,255,0.82)"
              : photoSweepColors.surfaceSoft
          }}>
          <Typography variant="body2" fontWeight={750} sx={{ mb: 0.35 }}>
            When
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}>
            Add either date to focus the scan. Leave both blank to check every
            taken date.
          </Typography>
          <Stack
            direction={compact ? "row" : { xs: "column", sm: "row" }}
            spacing={1}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              value={settings.dateRange?.from ?? ""}
              InputLabelProps={{ shrink: true }}
              onChange={(event) =>
                onSettingsChange({
                  dateRange: {
                    ...settings.dateRange,
                    from: event.target.value || undefined
                  }
                })
              }
            />
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              value={settings.dateRange?.to ?? ""}
              InputLabelProps={{ shrink: true }}
              onChange={(event) =>
                onSettingsChange({
                  dateRange: {
                    ...settings.dateRange,
                    to: event.target.value || undefined
                  }
                })
              }
            />
          </Stack>
          {(settings.dateRange?.from || settings.dateRange?.to) && (
            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
              <Button
                size="small"
                onClick={() => onSettingsChange({ dateRange: undefined })}>
                Clear dates
              </Button>
            </Box>
          )}
        </Paper>

        {showUnscopedFullScanWarning && !compact && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Full-library comparison can be slow and memory-heavy on large photo
            libraries. Full mode compares every item pair in{" "}
            {FULL_SCAN_BLOCK_SIZE.toLocaleString()}-item blocks, so it can catch
            duplicates uploaded years apart without loading the whole comparison
            matrix at once.
          </Alert>
        )}

        {dateRangeInvalid && (
          <Alert severity="error" sx={{ mb: 2 }}>
            The start date must be before the end date.
          </Alert>
        )}

        {!scanGate.allowed && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {scanGate.reason === "full_scan_locked"
              ? "Full scan is a paid cleanup tool. Switch to Smart scan to try PhotoSweep for free."
              : scanGate.reason === "unscoped_scan_locked" && freeIcloudPlan
                ? "Free iCloud scans need a date range before scanning. Upgrade to use paid iCloud test batches."
                : scanGate.reason === "unscoped_scan_locked"
                  ? `Your ${planName} plan needs an album, date range, or smaller test batch before scanning.`
                  : `This scope is above the ${scanGate.limit?.toLocaleString()} photo scan limit for ${planName}.`}
          </Alert>
        )}

        {!providerPaidSupported && sourceProvider !== "google" && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {providerLabel(sourceProvider)} is not enabled for this plan.
          </Alert>
        )}

        {batchLimit && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Test batch is on. This scan will check only{" "}
            {batchLimit.toLocaleString()} {providerLabel(sourceProvider)} item
            {batchLimit === 1 ? "" : "s"}. Clear the test batch size for the
            full library.
          </Alert>
        )}

        <Box
          sx={{
            mb: compact ? 0.75 : 1.5,
            px: compact ? 1 : 1.5,
            py: compact ? 0.9 : 1.25,
            borderRadius: compact ? 1.5 : 2,
            border: "1px solid",
            borderColor:
              settings.scanMode === "smart"
                ? photoSweepColors.primaryBorder
                : photoSweepColors.border,
            bgcolor:
              settings.scanMode === "smart"
                ? photoSweepColors.primarySoft
                : photoSweepColors.surfaceSoft
          }}>
          <Typography variant="body2" fontWeight={800}>
            {useRecommendedFirstScope
              ? "Recent 30 days · Recommended"
              : settings.scanMode === "smart"
                ? "Smart scan · Recommended"
                : "Full scan"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.25, lineHeight: 1.35 }}>
            {useRecommendedFirstScope
              ? "Starts with a bounded first pass. Widen the dates or use the entire library after you see the first results."
              : settings.scanMode === "smart"
                ? "Compares photos and videos saved close together. It is faster and works well for normal duplicates."
                : `Compares every item in ${FULL_SCAN_BLOCK_SIZE.toLocaleString()}-item blocks to find copies saved far apart.`}
          </Typography>
        </Box>

        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={<SearchRoundedIcon />}
          onClick={() => {
            if (!scanGate.allowed) {
              onUpgrade?.(
                scanGate.reason === "full_scan_locked"
                  ? "Full scan unlocks with Cleanup Pass or Lifetime Early Access."
                  : scanGate.reason === "unscoped_scan_locked" && freeIcloudPlan
                    ? "Free iCloud scans need a date range before scanning. Upgrade to use paid iCloud test batches."
                    : scanGate.reason === "unscoped_scan_locked"
                      ? `Your ${planName} plan needs an album, date range, or smaller test batch before scanning.`
                      : `This scan is above the ${scanGate.limit?.toLocaleString()} photo limit for ${planName}.`
              )
              return
            }
            if (useRecommendedFirstScope) {
              onSettingsChange({ dateRange: recommendedDateRange })
              onStartScan(startSettings)
              return
            }
            onStartScan()
          }}
          disabled={dateRangeInvalid}
          sx={{
            mb: compact ? 1 : 2,
            minHeight: compact ? 42 : undefined,
            borderRadius: compact ? 1.5 : 2,
            fontSize: compact ? 14 : undefined,
            boxShadow: compact
              ? `0 4px 12px ${photoSweepColors.primaryShadow}`
              : `0 12px 26px ${photoSweepColors.primaryShadow}`,
            "&:hover": {
              boxShadow: compact
                ? `0 6px 16px ${photoSweepColors.primaryShadow}`
                : `0 16px 34px ${photoSweepColors.primaryShadow}`
            }
          }}>
          {settings.albumScope && supportsAlbumScope
            ? "Check this album"
            : batchLimit
              ? `Check ${batchLimit.toLocaleString()} item test batch`
              : settings.dateRange?.from || settings.dateRange?.to
                ? "Check this date range"
                : useRecommendedFirstScope
                  ? "Scan recent 30 days"
                  : "Check entire library"}
        </Button>

        {useRecommendedFirstScope && (
          <Button
            fullWidth
            size="small"
            onClick={() => onStartScan(settings)}
            sx={{ mb: compact ? 1 : 2, fontWeight: 750 }}>
            Check entire library instead
          </Button>
        )}

        {showUnscopedFullScanWarning && compact && (
          <Alert
            severity="warning"
            sx={{
              mb: 1,
              py: 0.7,
              px: 1,
              borderRadius: 1.5,
              alignItems: "flex-start",
              fontSize: 13,
              "& .MuiAlert-message": {
                minWidth: 0,
                py: 0,
                overflowWrap: "anywhere"
              },
              "& .MuiAlert-icon": {
                mr: 0.75,
                py: 0.1
              }
            }}>
            Full-library scans can be slow on large libraries. Use albums or
            dates to narrow the first pass.
          </Alert>
        )}

        <Accordion
          disableGutters
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "rgba(214,226,221,0.86)",
            borderRadius: compact ? 1.5 : 2,
            bgcolor: compact
              ? "rgba(255,255,255,0.82)"
              : photoSweepColors.surface,
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            overflow: "hidden",
            "&:before": { display: "none" }
          }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={
              compact
                ? {
                    minHeight: 38,
                    px: 1,
                    "&.Mui-expanded": { minHeight: 38 },
                    "& .MuiAccordionSummary-content": {
                      my: 0.75,
                      "&.Mui-expanded": { my: 0.75 }
                    }
                  }
                : undefined
            }>
            <Typography
              variant="body2"
              fontWeight={compact ? 700 : undefined}
              color={compact ? "text.primary" : "text.secondary"}>
              Advanced matching
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={compact ? { px: 1, pt: 0, pb: 1 } : undefined}>
            <Box sx={{ mb: compact ? 1.75 : 3 }}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                Search breadth
              </Typography>
              <ToggleButtonGroup
                value={settings.scanMode}
                exclusive
                size="small"
                fullWidth
                onChange={(_, value) => {
                  if (value === null) return
                  if (value === "full" && !fullScanAllowed) {
                    onUpgrade?.(
                      `${planName} keeps Full scan locked. Use Smart scan for free proof, or upgrade to unlock Full scan.`
                    )
                    return
                  }
                  onSettingsChange({ scanMode: value })
                }}>
                <ToggleButton value="smart">Smart</ToggleButton>
                <ToggleButton value="full" aria-label="Full">
                  Full{fullScanAllowed ? "" : " (locked)"}
                </ToggleButton>
              </ToggleButtonGroup>
              {!compact && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}>
                  {settings.scanMode === "smart"
                    ? "Fast: compares photos and videos taken around the same time."
                    : `Compares all photos against each other in ${FULL_SCAN_BLOCK_SIZE.toLocaleString()}-item blocks.`}
                </Typography>
              )}
            </Box>

            {settings.scanMode === "smart" && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                  Time window:{" "}
                  <strong>{formatWindow(settings.smartWindowSec ?? 1)}</strong>
                </Typography>
                <ToggleButtonGroup
                  value={settings.smartWindowSec ?? 1}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_, value) => {
                    if (value !== null)
                      onSettingsChange({ smartWindowSec: value })
                  }}>
                  <ToggleButton value={1}>1s</ToggleButton>
                  <ToggleButton value={60}>1m</ToggleButton>
                  <ToggleButton value={3600}>1h</ToggleButton>
                  <ToggleButton value={86400}>1d</ToggleButton>
                  <ToggleButton value={604800}>1w</ToggleButton>
                </ToggleButtonGroup>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}>
                  How close in time photos and videos must be to be compared.
                  Widen this to catch re-saved files whose taken date changed.
                </Typography>
              </Box>
            )}

            {sourceProvider === "amazon" && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                  Amazon test batch size
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  fullWidth
                  value={settings.amazonBatchLimit ?? ""}
                  inputProps={{ min: 1, step: 1 }}
                  placeholder="Full library"
                  onChange={(event) => {
                    const raw = event.target.value
                    const value = raw ? Number(raw) : undefined
                    onSettingsChange({
                      amazonBatchLimit:
                        value && Number.isFinite(value)
                          ? Math.max(1, Math.floor(value))
                          : undefined
                    })
                  }}
                  helperText="Use 200 or 500 to verify Amazon end-to-end before scanning the full library. Leave blank for the full library."
                />
              </Box>
            )}

            {sourceProvider === "icloud" && !freeIcloudPlan && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                  iCloud test batch size
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  fullWidth
                  value={settings.icloudBatchLimit ?? ""}
                  inputProps={{ min: 1, step: 1 }}
                  placeholder="Full library"
                  onChange={(event) => {
                    const raw = event.target.value
                    const value = raw ? Number(raw) : undefined
                    onSettingsChange({
                      icloudBatchLimit:
                        value && Number.isFinite(value)
                          ? Math.max(1, Math.floor(value))
                          : undefined
                    })
                  }}
                  helperText="Use 200 to verify iCloud end-to-end before scanning the full library. Leave blank for the full library."
                />
              </Box>
            )}

            <Box>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                Sensitivity: <strong>{settings.similarityThreshold}</strong>
              </Typography>
              <Slider
                min={0.8}
                max={1.0}
                step={0.01}
                value={settings.similarityThreshold}
                valueLabelDisplay="auto"
                marks={
                  compact
                    ? false
                    : [
                        { value: 0.8, label: "Loose" },
                        { value: 0.95, label: "Balanced" },
                        { value: 0.99, label: "Near exact" }
                      ]
                }
                onChange={(_, value) =>
                  onSettingsChange({ similarityThreshold: value as number })
                }
              />
              {!compact && (
                <>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mt: 0.5
                    }}>
                    <Typography variant="caption" color="text.secondary">
                      More matches
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Exact
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}>
                    Lower values catch more reuploads, screenshots, and edited
                    copies. Exact/hash matches are always included.
                  </Typography>
                </>
              )}
            </Box>

            {!compact && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                  Embedding cache
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 1 }}>
                  {cacheEntryCount === null
                    ? "Cache size unavailable."
                    : `${cacheEntryCount.toLocaleString()} cached embedding${
                        cacheEntryCount !== 1 ? "s" : ""
                      }.`}
                </Typography>
                {cacheStatus && (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    {cacheStatus}
                  </Alert>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={cacheBusy}
                    onClick={onClearCache}>
                    Clear Cache
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={cacheBusy || dateRangeInvalid}
                    onClick={onRebuildCache}>
                    Rebuild Cache
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={cacheBusy || cacheEntryCount === 0}
                    onClick={onExportCacheDiagnostics}>
                    Export Diagnostics
                  </Button>
                </Stack>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      </Paper>
    </Box>
  )
}
