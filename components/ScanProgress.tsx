import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import Typography from "@mui/material/Typography"
import type { ScanPhase } from "../lib/types"

interface ScanProgressProps {
  phase: ScanPhase
  itemsProcessed: number
  totalEstimate: number
  message: string
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  fetching: "Fetching media items",
  downloading_thumbnails: "Downloading thumbnails",
  computing_embeddings: "Computing image embeddings",
  grouping: "Grouping duplicates",
  complete: "Complete",
}

export function ScanProgress({
  phase,
  itemsProcessed,
  totalEstimate,
  message,
}: ScanProgressProps) {
  const progress =
    totalEstimate > 0 ? Math.round((itemsProcessed / totalEstimate) * 100) : 0
  const isDeterminate = totalEstimate > 0

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", p: 4 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Scanning Library
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <CircularProgress size={14} thickness={5} />
        <Typography variant="body2" color="text.secondary">
          {PHASE_LABELS[phase]}
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
            {progress}%
          </Typography>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" fontStyle="italic">
        {message}
      </Typography>
    </Box>
  )
}
