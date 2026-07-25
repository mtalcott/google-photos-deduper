import Accordion from "@mui/material/Accordion"
import AccordionDetails from "@mui/material/AccordionDetails"
import AccordionSummary from "@mui/material/AccordionSummary"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControl from "@mui/material/FormControl"
import InputLabel from "@mui/material/InputLabel"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import FormControlLabel from "@mui/material/FormControlLabel"
import Paper from "@mui/material/Paper"
import Slider from "@mui/material/Slider"
import TextField from "@mui/material/TextField"
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

function getDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function applyDatePreset(
  preset: "today" | "1w" | "1m" | "3m" | "1y",
  settings: ScanSettings,
  onSettingsChange: (settings: Partial<ScanSettings>) => void
) {
  const to = new Date()
  const from = new Date(to)
  
  if (preset === "1w") {
    from.setDate(from.getDate() - 7)
  } else if (preset === "1m") {
    from.setMonth(from.getMonth() - 1)
  } else if (preset === "3m") {
    from.setMonth(from.getMonth() - 3)
  } else if (preset === "1y") {
    from.setFullYear(from.getFullYear() - 1)
  }

  onSettingsChange({
    dateRange: {
      ...settings.dateRange,
      from: getDateString(from),
      to: getDateString(to),
    }
  })
}

interface ScanConfigProps {
  settings: ScanSettings
  onSettingsChange: (settings: Partial<ScanSettings>) => void
  onStartScan: () => void
  hasGptk: boolean
  hideScanButton?: boolean
}

export function ScanConfig({
  settings,
  onSettingsChange,
  onStartScan,
  hasGptk,
  hideScanButton,
}: ScanConfigProps) {
  if (!hasGptk) {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", p: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
          GPTK is not loaded on the Google Photos page. Please reload
          photos.google.com and try again.
        </Alert>
        <Button
          variant="contained"
          fullWidth
          href="https://photos.google.com/login"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Google Photos
        </Button>
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
        {!hideScanButton && (
          <>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              Scan for Duplicates
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Scan your Google Photos library to find duplicate images using
              AI-powered image comparison.
            </Typography>
          </>
        )}

        {!hideScanButton && (
          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={<SearchRoundedIcon />}
            onClick={onStartScan}
            sx={{ mb: 2 }}>
            Scan Library
          </Button>
        )}

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

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                Date range (EXIF taken date)
              </Typography>
              <Box sx={{ mb: 1.5 }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Quick Preset</InputLabel>
                  <Select
                    label="Quick Preset"
                    value=""
                    onChange={(e) => {
                      const val = e.target.value as string
                      if (val === "clear") {
                        onSettingsChange({ dateRange: undefined })
                      } else if (val) {
                        applyDatePreset(val, settings, onSettingsChange)
                      }
                    }}
                  >
                    <MenuItem value="" sx={{ display: "none" }}>Select range...</MenuItem>
                    <MenuItem value="today">Today</MenuItem>
                    <MenuItem value="1w">Last 1 week</MenuItem>
                    <MenuItem value="1m">Last 1 month</MenuItem>
                    <MenuItem value="3m">Last 3 months</MenuItem>
                    <MenuItem value="1y">Last 1 year</MenuItem>
                    {Boolean(settings.dateRange?.from || settings.dateRange?.to) && (
                      <MenuItem value="clear" sx={{ color: "error.main" }}>Clear selection</MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ display: "flex", gap: 1.5, mb: 1 }}>
                <TextField
                  label="From"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={settings.dateRange?.from || ""}
                  onChange={(e) => {
                    onSettingsChange({
                      dateRange: {
                        ...settings.dateRange,
                        from: e.target.value || undefined,
                      },
                    })
                  }}
                />
                <TextField
                  label="To"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={settings.dateRange?.to || ""}
                  onChange={(e) => {
                    onSettingsChange({
                      dateRange: {
                        ...settings.dateRange,
                        to: e.target.value || undefined,
                      },
                    })
                  }}
                />
              </Box>
              {Boolean(settings.dateRange?.from || settings.dateRange?.to) && (
                <Box sx={{ mt: 1, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={Boolean(settings.dateRange?.fallbackToUploadDate)}
                        onChange={(e) => {
                          onSettingsChange({
                            dateRange: {
                              ...settings.dateRange,
                              fallbackToUploadDate: e.target.checked,
                            },
                          })
                        }}
                      />
                    }
                    label={
                      <Typography variant="body2" fontWeight={500}>
                        Use upload date for photos without EXIF
                      </Typography>
                    }
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, ml: 3.5 }}>
                    If checked, photos and videos missing an EXIF taken date will be filtered by their upload date instead. If unchecked, photos without EXIF dates will be skipped.
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                Max group results
              </Typography>
              <TextField
                size="small"
                sx={{ width: 120 }}
                type="number"
                placeholder="No limit"
                value={settings.maxGroupResults ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onSettingsChange({
                    maxGroupResults: val ? parseInt(val, 10) : undefined,
                  });
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Stop finding duplicates when this many group results are reached. Leave empty for no limit.
              </Typography>
            </Box>

            {(settings.ignoredSignatures?.length ?? 0) > 0 && (
              <Box sx={{ mb: 3, p: 1.5, bgcolor: "action.hover", borderRadius: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    Ignored Groups
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {settings.ignoredSignatures!.length} photo pair(s) ignored.
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => onSettingsChange({ ignoredSignatures: [] })}>
                  Clear Ignored
                </Button>
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
