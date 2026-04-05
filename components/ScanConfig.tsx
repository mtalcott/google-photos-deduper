import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Paper from "@mui/material/Paper"
import Slider from "@mui/material/Slider"
import Typography from "@mui/material/Typography"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded"
import type { ScanSettings } from "../lib/types"

interface ScanConfigProps {
  settings: ScanSettings
  onSettingsChange: (settings: Partial<ScanSettings>) => void
  onStartScan: () => void
  hasGptk: boolean
}

export function ScanConfig({
  settings,
  onSettingsChange,
  onStartScan,
  hasGptk,
}: ScanConfigProps) {
  if (!hasGptk) {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", p: 4 }}>
        <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
          GPTK is not loaded on the Google Photos page. Please reload
          photos.google.com and try again.
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", p: 4 }}>
      <Paper
        elevation={0}
        sx={{
          p: 4,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Scan for Duplicates
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Scan your Google Photos library to find duplicate images using
          AI-powered image comparison.
        </Typography>

        <Box sx={{ mb: 4 }}>
          <Typography variant="body2" fontWeight={500} sx={{ mb: 2 }}>
            Similarity Threshold:{" "}
            <strong>{settings.similarityThreshold}</strong>
          </Typography>
          <Slider
            min={0.9}
            max={1.0}
            step={0.01}
            value={settings.similarityThreshold}
            valueLabelDisplay="auto"
            onChange={(_, value) =>
              onSettingsChange({ similarityThreshold: value as number })
            }
          />
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              More matches
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Exact only
            </Typography>
          </Box>
        </Box>

        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={<SearchRoundedIcon />}
          onClick={onStartScan}>
          Scan Library
        </Button>
      </Paper>
    </Box>
  )
}
