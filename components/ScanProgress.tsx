import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useEffect, useRef, useState } from "react"

import { photoSweepColors } from "../lib/theme"
import type { ScanPhase } from "../lib/types"

interface ScanProgressProps {
  phase: ScanPhase
  itemsProcessed: number
  totalEstimate: number
  message: string
  onPause?: () => void
  idleWarningMs?: number
  compact?: boolean
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  fetching: "Reading your library",
  downloading_thumbnails: "Loading previews",
  computing_embeddings: "Comparing photos and videos",
  detecting_duplicates: "Preparing review sets",
  complete: "Complete"
}

const PHASE_STEP: Record<ScanPhase, number> = {
  fetching: 1,
  downloading_thumbnails: 2,
  computing_embeddings: 3,
  detecting_duplicates: 4,
  complete: 4
}

const TOTAL_STEPS = 4

function formatEtr(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.ceil(seconds % 60)
    return secs > 0 ? `${mins}m ${secs}s remaining` : `${mins}m remaining`
  }
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.round((seconds % 3600) / 60)
  return mins > 0 ? `${hrs}h ${mins}m remaining` : `${hrs}h remaining`
}

export function ScanProgress({
  phase,
  itemsProcessed,
  totalEstimate,
  message,
  onPause,
  idleWarningMs = 120_000,
  compact = false
}: ScanProgressProps) {
  const [idleMs, setIdleMs] = useState(0)
  const lastProgressAtRef = useRef(Date.now())
  const progressSignature = `${phase}:${itemsProcessed}:${totalEstimate}:${message}`

  useEffect(() => {
    lastProgressAtRef.current = Date.now()
    setIdleMs(0)
  }, [progressSignature])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIdleMs(Date.now() - lastProgressAtRef.current)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const progress =
    totalEstimate > 0 ? Math.round((itemsProcessed / totalEstimate) * 100) : 0
  const isDeterminate = totalEstimate > 0
  const showIdleWarning = idleMs >= idleWarningMs
  const idleMinutes = Math.max(1, Math.floor(idleMs / 60_000))

  const phaseStartRef = useRef<{
    phase: ScanPhase
    time: number
    baseItems: number
  } | null>(null)
  if (phaseStartRef.current?.phase !== phase) {
    phaseStartRef.current = {
      phase,
      time: Date.now(),
      baseItems: itemsProcessed
    }
  }

  const cachedEtrRef = useRef<{ text: string; updatedAt: number } | null>(null)

  if (isDeterminate && phaseStartRef.current) {
    const now = Date.now()
    if (!cachedEtrRef.current || now - cachedEtrRef.current.updatedAt >= 1000) {
      const elapsedSec = (now - phaseStartRef.current.time) / 1000
      const processedSince = itemsProcessed - phaseStartRef.current.baseItems
      if (processedSince > 0 && elapsedSec >= 3) {
        const rate = processedSince / elapsedSec
        const remaining = (totalEstimate - itemsProcessed) / rate
        if (remaining > 0) {
          cachedEtrRef.current = { text: formatEtr(remaining), updatedAt: now }
        }
      }
    }
  } else {
    cachedEtrRef.current = null
  }

  const etaText = cachedEtrRef.current?.text ?? null
  const stepNum = PHASE_STEP[phase]

  return (
    <Box
      sx={{
        maxWidth: compact ? "none" : 860,
        mx: compact ? 0 : "auto",
        py: compact ? 0 : { xs: 2, md: 6 }
      }}>
      <Paper
        elevation={0}
        sx={{
          p: compact ? 1.25 : { xs: 2.5, md: 4 },
          border: "1px solid",
          borderColor: "rgba(214,226,221,0.9)",
          borderRadius: compact ? 2 : 3,
          bgcolor: compact
            ? photoSweepColors.surface
            : photoSweepColors.surfaceTint,
          backdropFilter: "saturate(180%) blur(22px)",
          boxShadow: compact ? "none" : `0 24px 70px ${photoSweepColors.shadow}`
        }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mb: compact ? 1.25 : 2
          }}>
          <Typography
            variant={compact ? "subtitle2" : "h5"}
            fontWeight={800}>
            Finding Duplicates
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Step {stepNum} of {TOTAL_STEPS}
          </Typography>
        </Box>

        {showIdleWarning && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No scan progress for {idleMinutes} minute
            {idleMinutes === 1 ? "" : "s"}. The scan may still recover, but you
            can pause and resume if it stays stuck.
          </Alert>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 2,
            mb: compact ? 1 : 1.5
          }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant={compact ? "caption" : "body2"}
              color="primary.main"
              fontWeight={800}
              sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              {phase !== "complete" && (
                <CircularProgress size={13} thickness={5} />
              )}
              {PHASE_LABELS[phase]}
            </Typography>
            <Typography
              variant={compact ? "h5" : "h4"}
              fontWeight={850}
              sx={{ mt: 0.5, letterSpacing: "-0.03em" }}>
              {itemsProcessed.toLocaleString()}{" "}
              <Box
                component="span"
                sx={{
                  fontSize: compact ? 13 : 16,
                  fontWeight: 700,
                  color: "text.secondary",
                  letterSpacing: 0
                }}>
                checked
              </Box>
            </Typography>
          </Box>
          {isDeterminate && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {etaText ? `${progress}% · ${etaText}` : `${progress}%`}
            </Typography>
          )}
        </Box>

        <LinearProgress
          variant={isDeterminate ? "determinate" : "indeterminate"}
          value={progress}
          aria-label="Scan progress"
          sx={{ mb: compact ? 0.75 : 1 }}
        />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.45 }}>
          {isDeterminate
            ? `${itemsProcessed.toLocaleString()} of ${totalEstimate.toLocaleString()} checked. `
            : ""}
          You can leave this tab open. Nothing can move to Trash during the
          scan.
        </Typography>

        {onPause && (
          <Box sx={{ mt: compact ? 1.25 : 2 }}>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={onPause}
              sx={compact ? { width: "100%" } : undefined}>
              Pause Scan
            </Button>
          </Box>
        )}

        {message && (
          <Box
            component="details"
            sx={{
              mt: compact ? 1 : 1.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              bgcolor: photoSweepColors.surfaceSoft,
              "& summary": {
                cursor: "pointer",
                px: 1.25,
                py: 1,
                fontSize: 12,
                fontWeight: 750
              }
            }}>
            <Box component="summary">Technical activity</Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                px: 1.25,
                pb: 1.25,
                overflowWrap: "anywhere"
              }}>
              {message}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  )
}
