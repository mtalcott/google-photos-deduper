import Accordion from "@mui/material/Accordion"
import AccordionDetails from "@mui/material/AccordionDetails"
import AccordionSummary from "@mui/material/AccordionSummary"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Paper from "@mui/material/Paper"
import Slider from "@mui/material/Slider"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded"
import type { ScanSettings } from "../lib/types"

function formatWindow(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${Math.round(sec / 3600)}h`
  if (sec < 604800) return `${Math.round(sec / 86400)}d`
  return `${Math.round(sec / 604800)}w`
}

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

        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={<SearchRoundedIcon />}
          onClick={onStartScan}
          sx={{ mb: 2 }}>
          Scan Library
        </Button>

        <Accordion
          disableGutters
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            "&:before": { display: "none" },
          }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" color="text.secondary">
              More options
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                Scan mode
              </Typography>
              <ToggleButtonGroup
                value={settings.scanMode}
                exclusive
                size="small"
                fullWidth
                onChange={(_, value) => {
                  if (value !== null) onSettingsChange({ scanMode: value })
                }}>
                <ToggleButton value="smart">Smart</ToggleButton>
                <ToggleButton value="full">Full</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {settings.scanMode === "smart"
                  ? "Only compares photos taken at the same time — fast for large libraries."
                  : "Compares all photos against each other — thorough but slow for large libraries."}
              </Typography>
            </Box>

            {settings.scanMode === "smart" && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                  Time window: <strong>{formatWindow(settings.smartWindowSec ?? 1)}</strong>
                </Typography>
                <ToggleButtonGroup
                  value={settings.smartWindowSec ?? 1}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_, value) => {
                    if (value !== null) onSettingsChange({ smartWindowSec: value })
                  }}>
                  <ToggleButton value={1}>1s</ToggleButton>
                  <ToggleButton value={60}>1m</ToggleButton>
                  <ToggleButton value={3600}>1h</ToggleButton>
                  <ToggleButton value={86400}>1d</ToggleButton>
                  <ToggleButton value={604800}>1w</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  How close in time items must be to be compared. Widen this to catch re-saved videos whose EXIF date was rewritten — at the cost of more pairs to check.
                </Typography>
              </Box>
            )}

            <Box>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
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
          </AccordionDetails>
        </Accordion>
      </Paper>
    </Box>
  )
}
