import { useRef } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import Typography from "@mui/material/Typography"
import type { ScanPhase } from "../lib/types"

interface ScanProgressProps {
  phase: ScanPhase
  itemsProcessed: number
  totalEstimate: number
  message: string
  onCancel?: () => void
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  fetching: "Fetching media items",
  downloading_thumbnails: "Downloading thumbnails",
  computing_embeddings: "Computing image similarity",
  complete: "Complete",
}

const PHASE_STEP: Record<ScanPhase, number> = {
  fetching: 1,
  downloading_thumbnails: 2,
  computing_embeddings: 3,
  complete: 3,
}

const TOTAL_STEPS = 3

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
  onCancel,
}: ScanProgressProps) {
  const progress =
    totalEstimate > 0 ? Math.round((itemsProcessed / totalEstimate) * 100) : 0
  const isDeterminate = totalEstimate > 0

  const phaseStartRef = useRef<{ phase: ScanPhase; time: number; baseItems: number } | null>(null)
  if (phaseStartRef.current?.phase !== phase) {
    phaseStartRef.current = { phase, time: Date.now(), baseItems: itemsProcessed }
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
    <Box sx={{ maxWidth: 480, mx: "auto", p: 4 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Scanning Library
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={14} thickness={5} />
          <Typography variant="body2" color="text.secondary">
            {PHASE_LABELS[phase]}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Step {stepNum} of {TOTAL_STEPS}
        </Typography>
      </Box>

      <LinearProgress
        variant={isDeterminate ? "determinate" : "indeterminate"}
        value={progress}
        sx={{ mb: 1 }}
      />

      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {itemsProcessed.toLocaleString()} items processed
          {isDeterminate && ` / ${totalEstimate.toLocaleString()}`}
        </Typography>
        {isDeterminate && (
          <Typography variant="caption" color="text.secondary">
            {etaText ? `${progress}% · ${etaText}` : `${progress}%`}
          </Typography>
        )}
      </Box>

      {onCancel && (
        <Box sx={{ mt: 3 }}>
          <Button variant="outlined" color="inherit" size="small" onClick={onCancel}>
            Cancel
          </Button>
        </Box>
      )}
    </Box>
  )
}
